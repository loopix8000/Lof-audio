import fs from "node:fs/promises";
import readline from "node:readline";
import http from "node:http";

const { version } = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
const tools = JSON.parse(await fs.readFile(new URL("../skills/lof-audio/references/tools.json", import.meta.url), "utf8"));
const versions = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

function localResponse(message) {
  const params = message.params === undefined ? {} : message.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return { error: { code: -32602, message: "요청 매개변수는 객체여야 합니다." } };
  switch (message.method) {
    case "initialize": return { result: { protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "lof-audio", version }, instructions: "음악 도구를 호출하려면 Lof Audio 앱을 실행하세요. workspace_list로 실제 workspaceId를 확인하세요." } };
    case "ping": return { result: {} };
    case "tools/list": return { result: { tools } };
    case "tools/call": return null;
    default: return { error: { code: -32601, message: "지원하지 않는 메서드입니다." } };
  }
}

function post(port, token, line, protocolVersion, expectsResponse) {
  return new Promise((resolve, reject) => {
    // 시스템 프록시 설정에 영향을 받지 않는 로컬 소켓을 사용한다.
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
    if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0"
      || (message.id !== undefined && message.id !== null && typeof message.id !== "string" && !Number.isInteger(message.id))) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }) + "\n");
      continue;
    }
    if (message.id === undefined) continue;
    // 앱이 꺼져 있어도 MCP 초기화와 도구 탐색은 완료한다.
    const local = localResponse(message);
    if (local) {
      if (message.method === "initialize") protocolVersion = local.result?.protocolVersion;
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, ...local }) + "\n");
      continue;
    }
    try {
      const connection = JSON.parse(await fs.readFile(runtimePath, "utf8"));
      if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535 || !/^[a-f0-9]{64}$/i.test(connection.token ?? "")) throw Error("잘못된 연결 파일");
      const value = await post(connection.port, connection.token, line, protocolVersion, message.id !== undefined);
      process.stdout.write(JSON.stringify(value) + "\n");
    } catch (error) {
      if (message?.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: `Lof Audio 앱 실행 상태를 확인하세요. ${error.message}` }], isError: true } }) + "\n");
      else process.stderr.write("Lof Audio 연결 실패\n");
    }
  }
}
