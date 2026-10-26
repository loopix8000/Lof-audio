import fs from "node:fs/promises";
import readline from "node:readline";
import http from "node:http";

function post(port, token, line, protocolVersion, expectsResponse) {
  return new Promise((resolve, reject) => {
    // Use a direct loopback socket, independent of the machine's HTTP proxy settings.
    const request = http.request({ hostname: "127.0.0.1", port, path: "/mcp", method: "POST", timeout: 60000,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(line), Accept: "application/json, text/event-stream", ...(protocolVersion ? { "MCP-Protocol-Version": protocolVersion } : {}) },
    }, response => {
      if (response.statusCode < 200 || response.statusCode >= 300) { response.resume(); reject(Error(`HTTP ${response.statusCode}`)); return; }
      if (!expectsResponse) { response.resume(); response.on("end", () => resolve(null)); return; }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; if (Buffer.byteLength(body) > 16_000_000) response.destroy(Error("MCP 응답이 너무 큽니다.")); });
      response.on("error", reject);
      response.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(Error("잘못된 MCP 응답")); } });
    });
    request.on("timeout", () => request.destroy(Error("MCP 요청 시간 초과")));
    request.on("error", reject);
    request.end(line);
  });
}

const runtimeIndex = process.argv.indexOf("--runtime");
const runtimePath = runtimeIndex >= 0 ? process.argv[runtimeIndex + 1] : process.env.LOF_AUDIO_RUNTIME;
if (!runtimePath) {
  process.stderr.write("Lof Audio 설정에서 복사한 --runtime 경로가 필요합니다.\n");
  process.exitCode = 1;
} else {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let protocolVersion;
  for await (const line of input) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line) > 8_000_000) { process.stderr.write("MCP 메시지가 너무 큽니다.\n"); process.exitCode = 1; break; }
    let message;
    try { message = JSON.parse(line); } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      continue;
    }
    if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }) + "\n");
      continue;
    }
    try {
      const connection = JSON.parse(await fs.readFile(runtimePath, "utf8"));
      if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535 || !/^[a-f0-9]{64}$/i.test(connection.token ?? "")) throw Error("잘못된 연결 파일");
      const value = await post(connection.port, connection.token, line, protocolVersion, message.id !== undefined);
      if (message.id !== undefined) {
        if (message.method === "initialize") protocolVersion = value.result?.protocolVersion;
        process.stdout.write(JSON.stringify(value) + "\n");
      }
    } catch (error) {
      if (message?.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: `Lof Audio 앱 실행 상태를 확인하세요. ${error.message}` } }) + "\n");
      else process.stderr.write("Lof Audio 연결 실패\n");
    }
  }
}
