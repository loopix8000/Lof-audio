use super::{tools, Handler};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};

const MAX_BODY: usize = 8_000_000;
const MAX_HEADER: usize = 16_384;
const VERSIONS: [&str; 4] = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

pub struct ApiServer {
    pub port: u16,
    pub(super) token: String,
    pub runtime_path: PathBuf,
    stopped: Arc<AtomicBool>,
    listener: Mutex<Option<thread::JoinHandle<()>>>,
}

impl ApiServer {
    pub fn start(runtime_path: &Path, handler: Handler) -> Result<Self, String> {
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let token = hex::encode(bytes);
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        fs::create_dir_all(
            runtime_path
                .parent()
                .ok_or("Runtime 경로에 상위 디렉터리가 필요합니다.")?,
        )
        .map_err(|e| e.to_string())?;
        let mut file = tempfile::NamedTempFile::new_in(runtime_path.parent().unwrap())
            .map_err(|e| e.to_string())?;
        serde_json::to_writer(
            &mut file,
            &json!({"port":port,"token":token,"pid":std::process::id()}),
        )
        .map_err(|e| e.to_string())?;
        file.as_file().sync_all().map_err(|e| e.to_string())?;
        file.persist(runtime_path).map_err(|e| e.to_string())?;
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = Arc::clone(&stopped);
        let runtime = Arc::new(tokio::runtime::Runtime::new().map_err(|e| e.to_string())?);
        let (tx, rx) = mpsc::sync_channel::<TcpStream>(16);
        let rx = Arc::new(Mutex::new(rx));
        for _ in 0..4 {
            let (rx, runtime, handler, token, stop) = (
                Arc::clone(&rx),
                Arc::clone(&runtime),
                Arc::clone(&handler),
                token.clone(),
                Arc::clone(&stopped),
            );
            thread::spawn(move || loop {
                let stream = rx.lock().unwrap().recv();
                let Ok(mut stream) = stream else { break };
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
                let _ = stream.set_write_timeout(Some(Duration::from_secs(15)));
                if let Err((status, message)) =
                    handle(&mut stream, port, &token, &runtime, &handler)
                {
                    respond(&mut stream, status, Some(&json!({"error":message})), "");
                }
            });
        }
        let thread = thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => match tx.try_send(stream) {
                        Ok(()) => {}
                        Err(mpsc::TrySendError::Full(mut returned)) => respond(
                            &mut returned,
                            503,
                            Some(&json!({"error":"Server busy"})),
                            "",
                        ),
                        Err(mpsc::TrySendError::Disconnected(_)) => break,
                    },
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(20))
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            port,
            token,
            runtime_path: runtime_path.to_path_buf(),
            stopped,
            listener: Mutex::new(Some(thread)),
        })
    }

    pub fn shutdown(&self) {
        self.stopped.store(true, Ordering::Relaxed);
        if let Ok(mut listener) = self.listener.lock() {
            if let Some(thread) = listener.take() {
                let _ = thread.join();
            }
        }
        let owned = fs::read(&self.runtime_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .is_some_and(|v| v["token"] == self.token);
        if owned {
            let _ = fs::remove_file(&self.runtime_path);
        }
    }
}
impl Drop for ApiServer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn respond(stream: &mut TcpStream, status: u16, value: Option<&Value>, extra: &str) {
    let body = value.map(Value::to_string).unwrap_or_default();
    let reason = match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        413 => "Payload Too Large",
        503 => "Service Unavailable",
        _ => "Error",
    };
    let header = format!("HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n{extra}\r\n",body.len());
    let _ = stream
        .write_all(header.as_bytes())
        .and_then(|_| stream.write_all(body.as_bytes()));
}

fn equal(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |diff, (a, b)| diff | (a ^ b)) == 0
}

fn handle(
    stream: &mut TcpStream,
    port: u16,
    token: &str,
    runtime: &tokio::runtime::Runtime,
    handler: &Handler,
) -> Result<(), (u16, String)> {
    let bad = |message: &str| (400, message.to_string());
    let mut bytes = Vec::new();
    let header_len = loop {
        if let Some(index) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
            break index + 4;
        }
        if bytes.len() > MAX_HEADER {
            return Err(bad("Headers too large"));
        }
        let mut block = [0u8; 1024];
        let read = stream.read(&mut block).map_err(|_| bad("Read timeout"))?;
        if read == 0 {
            return Err(bad("Incomplete headers"));
        }
        bytes.extend_from_slice(&block[..read]);
    };
    if header_len > MAX_HEADER {
        return Err(bad("Headers too large"));
    }
    let mut headers = [httparse::EMPTY_HEADER; 64];
    let mut request = httparse::Request::new(&mut headers);
    request
        .parse(&bytes[..header_len])
        .map_err(|_| bad("Invalid HTTP headers"))?;
    let method = request.method.ok_or_else(|| bad("Missing method"))?;
    let path = request.path.ok_or_else(|| bad("Missing path"))?;
    let values = |key: &str| {
        request
            .headers
            .iter()
            .filter(|h| h.name.eq_ignore_ascii_case(key))
            .map(|h| h.value)
            .collect::<Vec<_>>()
    };
    if !values("origin").is_empty() {
        return Err((403, "Browser Origin is not allowed".into()));
    }
    let expected_host = format!("127.0.0.1:{port}");
    if values("host") != vec![expected_host.as_bytes()] {
        return Err((403, "Invalid Host".into()));
    }
    if method == "GET" && path == "/health" {
        respond(
            stream,
            200,
            Some(&json!({"name":"Lof Audio","version":env!("CARGO_PKG_VERSION")})),
            "",
        );
        return Ok(());
    }
    if values("authorization").len() != 1
        || !equal(
            values("authorization")[0],
            format!("Bearer {token}").as_bytes(),
        )
    {
        return Err((401, "Unauthorized".into()));
    }
    if !["/mcp", "/rpc"].contains(&path) {
        return Err((404, "Not found".into()));
    }
    if method != "POST" {
        respond(stream, 405, None, "Allow: POST\r\n");
        return Ok(());
    }
    let versions = values("mcp-protocol-version");
    if versions.len() > 1
        || versions
            .first()
            .is_some_and(|v| !VERSIONS.iter().any(|s| s.as_bytes() == *v))
    {
        return Err(bad("Unsupported MCP protocol version"));
    }
    if !values("transfer-encoding").is_empty() {
        return Err(bad("Transfer-Encoding is not supported"));
    }
    let lengths = values("content-length");
    if lengths.len() != 1 {
        return Err(bad("One Content-Length is required"));
    }
    let length = std::str::from_utf8(lengths[0])
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .ok_or_else(|| bad("Invalid Content-Length"))?;
    if length > MAX_BODY {
        return Err((413, "Request too large".into()));
    }
    let types = values("content-type");
    if types.len() != 1
        || !std::str::from_utf8(types[0])
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .eq_ignore_ascii_case("application/json")
    {
        return Err(bad("Content-Type must be application/json"));
    }
    let is_mcp = path == "/mcp";
    let mut body = bytes[header_len..].to_vec();
    body.truncate(length);
    let remaining = length - body.len();
    body.resize(length, 0);
    if remaining > 0 {
        stream
            .read_exact(&mut body[length - remaining..])
            .map_err(|_| bad("Incomplete body"))?;
    }
    let message: Value = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) => {
            respond(
                stream,
                400,
                Some(
                    &json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}),
                ),
                "",
            );
            return Ok(());
        }
    };
    if !is_mcp {
        let name = message["name"]
            .as_str()
            .ok_or_else(|| bad("Missing tool name"))?
            .to_string();
        let args = message
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let result = runtime.block_on(handler(name, args));
        match result {
            Ok(value) => respond(stream, 200, Some(&json!({"result":value})), ""),
            Err(error) => {
                let error = super::error(&error);
                respond(
                    stream,
                    if error["code"] == "CONFLICT" {
                        409
                    } else {
                        400
                    },
                    Some(&error),
                    "",
                );
            }
        }
        return Ok(());
    }
    let id = message.get("id").cloned().unwrap_or(Value::Null);
    let invalid = message["jsonrpc"] != "2.0"
        || !message.is_object()
        || (!id.is_null() && !id.is_string() && !id.is_i64() && !id.is_u64());
    if invalid {
        respond(
            stream,
            400,
            Some(&rpc_error(id, -32600, "Invalid Request")),
            "",
        );
        return Ok(());
    }
    if message.get("method").is_none()
        && (message.get("result").is_some() || message.get("error").is_some())
    {
        respond(stream, 202, None, "");
        return Ok(());
    }
    let method = message["method"]
        .as_str()
        .ok_or_else(|| bad("Missing method"))?;
    if message.get("id").is_none() {
        if method.starts_with("notifications/") {
            respond(stream, 202, None, "");
            return Ok(());
        }
        respond(
            stream,
            400,
            Some(&rpc_error(Value::Null, -32600, "Requests need an id")),
            "",
        );
        return Ok(());
    }
    let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
    if !params.is_object() {
        respond(
            stream,
            200,
            Some(&rpc_error(id, -32602, "Invalid params")),
            "",
        );
        return Ok(());
    }
    let result = match method {
        "initialize" => {
            let version = params["protocolVersion"]
                .as_str()
                .filter(|v| VERSIONS.contains(v))
                .unwrap_or("2025-11-25");
            json!({"protocolVersion":version,"capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"lof-audio","version":env!("CARGO_PKG_VERSION")},"instructions":tools::INSTRUCTIONS})
        }
        "ping" => json!({}),
        "tools/list" => json!({"tools":tools::definitions()}),
        "tools/call" => {
            let Some(name) = params["name"].as_str().filter(|name| {
                tools::definitions()
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|t| t["name"] == *name)
            }) else {
                respond(
                    stream,
                    200,
                    Some(&rpc_error(id, -32602, "Unknown tool")),
                    "",
                );
                return Ok(());
            };
            match runtime.block_on(handler(
                name.into(),
                params
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({})),
            )) {
                Ok(value) => {
                    json!({"content":[{"type":"text","text":value.to_string()}],"structuredContent":{"result":value},"isError":false})
                }
                Err(error) => {
                    let error = super::error(&error);
                    json!({"content":[{"type":"text","text":error.to_string()}],"structuredContent":error,"isError":true})
                }
            }
        }
        _ => {
            respond(
                stream,
                200,
                Some(&rpc_error(id, -32601, "Method not found")),
                "",
            );
            return Ok(());
        }
    };
    respond(
        stream,
        200,
        Some(&json!({"jsonrpc":"2.0","id":id,"result":result})),
        "",
    );
    Ok(())
}

fn rpc_error(id: Value, code: i32, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}
