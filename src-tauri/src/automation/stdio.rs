use serde_json::{json, Value};
use std::{
    io::{BufRead, Read, Write},
    path::Path,
    time::Duration,
};

pub fn run(runtime_path: &Path) -> Result<(), String> {
    if !runtime_path.is_absolute() {
        return Err("--runtime에는 절대 경로가 필요합니다.".into());
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let runtime = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let mut reader = stdin.lock();
    let mut protocol = String::new();
    loop {
        let mut line = Vec::new();
        let size = Read::by_ref(&mut reader)
            .take(8_000_002)
            .read_until(b'\n', &mut line)
            .map_err(|e| e.to_string())?;
        if size == 0 {
            break;
        }
        if size > 8_000_000 {
            return Err("MCP 메시지가 너무 큽니다.".into());
        }
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        let message: Value = match serde_json::from_slice(&line) {
            Ok(v) => v,
            Err(_) => {
                writeln!(stdout,"{}",json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}})).map_err(|e|e.to_string())?;
                stdout.flush().map_err(|e| e.to_string())?;
                continue;
            }
        };
        let id = message.get("id").cloned();
        if !message.is_object()
            || message["jsonrpc"] != "2.0"
            || id
                .as_ref()
                .is_some_and(|id| !id.is_null() && !id.is_string() && !id.is_i64() && !id.is_u64())
        {
            writeln!(stdout, "{}", json!({"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}})).map_err(|e| e.to_string())?;
            stdout.flush().map_err(|e| e.to_string())?;
            continue;
        }
        // 연결 준비는 앱 실행 여부와 무관하게 처리하고, 실제 도구 호출만 앱에 전달한다.
        if let Some(output) = local_response(&message) {
            writeln!(stdout, "{output}").map_err(|e| e.to_string())?;
            stdout.flush().map_err(|e| e.to_string())?;
            if message["method"] == "initialize" {
                protocol = output["result"]["protocolVersion"]
                    .as_str()
                    .unwrap_or("")
                    .into();
            }
            continue;
        }
        if id.is_none() {
            continue;
        }
        let result: Result<Value, String> = runtime.block_on(async {
            let connection: Value = serde_json::from_slice(
                &std::fs::read(runtime_path).map_err(|_| "앱의 연결 파일을 읽지 못했습니다.")?,
            )
            .map_err(|_| "잘못된 연결 파일입니다.")?;
            let port = connection["port"]
                .as_u64()
                .filter(|v| *v > 0 && *v <= 65535)
                .ok_or("잘못된 포트입니다.")?;
            let token = connection["token"]
                .as_str()
                .filter(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
                .ok_or("잘못된 연결 토큰입니다.")?;
            let mut request = client
                .post(format!("http://127.0.0.1:{port}/mcp"))
                .bearer_auth(token)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json, text/event-stream")
                .body(line.clone());
            if !protocol.is_empty() {
                request = request.header("MCP-Protocol-Version", &protocol);
            }
            let response = request
                .send()
                .await
                .map_err(|_| "Lof Audio 앱에 연결하지 못했습니다.")?;
            if !response.status().is_success() {
                return Err(format!("HTTP {}", response.status().as_u16()));
            }
            let value: Value = response
                .json()
                .await
                .map_err(|_| "잘못된 MCP 응답입니다.")?;
            Ok(value)
        });
        let output=match result {
            Ok(value)=>Some(value),
            Err(message)=>id.map(|id|json!({"jsonrpc":"2.0","id":id,"result":{"content":[{"type":"text","text":format!("Lof Audio 앱 실행 상태를 확인하세요. {message}")}],"isError":true}})),
        };
        if let Some(value) = output {
            writeln!(stdout, "{value}").map_err(|e| e.to_string())?;
            stdout.flush().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn local_response(message: &Value) -> Option<Value> {
    let id = message.get("id")?;
    let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
    if !params.is_object() {
        return Some(
            json!({"jsonrpc":"2.0","id":id,"error":{"code":-32602,"message":"요청 매개변수는 객체여야 합니다."}}),
        );
    }
    let method = message["method"].as_str().unwrap_or("");
    if let Some(result) = super::discovery_result(method, &params) {
        return Some(json!({"jsonrpc":"2.0","id":id,"result":result}));
    }
    if method != "tools/call" {
        return Some(
            json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"지원하지 않는 메서드입니다."}}),
        );
    }
    None
}
