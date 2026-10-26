import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import test from "node:test";

async function exercise(command, args) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "lof-audio-mcp-"));
  const runtime = path.join(temp, "runtime.json");
  let child;
  const servers = [];
  const replies = [], waiters = [];
  let output = "", stderr = "";
  const tokens = [];
  try {
    const serve = async () => {
      const token = randomBytes(32).toString("hex"); tokens.push(token);
      const requests = [];
      const server = http.createServer(async (request, response) => {
        assert.equal(request.headers.authorization, `Bearer ${token}`);
        assert.equal(request.url, "/mcp");
        let body = ""; for await (const chunk of request) body += chunk;
        const value = JSON.parse(body); requests.push({ message: value, protocol: request.headers["mcp-protocol-version"] });
        if (value.id === undefined) { response.writeHead(202); response.end(); return; }
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ jsonrpc: "2.0", id: value.id, result: value.method === "initialize" ? { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } } : { ok: true } }));
      });
      server.listen(0, "127.0.0.1"); await once(server, "listening"); servers.push(server);
      await writeFile(runtime, JSON.stringify({ port: server.address().port, token }));
      return requests;
    };
    const first = await serve();
    child = spawn(command, [...args, "--runtime", runtime], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stderr.on("data", data => { stderr += data; });
    child.stdout.on("data", data => {
      output += data;
      for (;;) { const index = output.indexOf("\n"); if (index < 0) break; const reply = JSON.parse(output.slice(0, index)); output = output.slice(index + 1); if (waiters.length) waiters.shift()(reply); else replies.push(reply); }
    });
    const next = () => replies.length ? Promise.resolve(replies.shift()) : Promise.race([
      new Promise(resolve => waiters.push(resolve)),
      new Promise((_, reject) => setTimeout(() => reject(Error(`Bridge timeout: ${stderr}`)), 10000).unref()),
    ]);
    child.stdin.write("{\n");
    assert.equal((await next()).error.code, -32700);
    child.stdin.write("null\n");
    assert.equal((await next()).error.code, -32600);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }) + "\n");
    const initialized = await next();
    assert.ok(initialized.result, JSON.stringify(initialized));
    assert.equal(initialized.result.protocolVersion, "2025-11-25");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }) + "\n");
    assert.equal((await next()).id, 2);
    assert.equal(first[1].protocol, "2025-11-25");
    assert.equal(first[2].message.id, 2);
    const restarted = await serve();
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }) + "\n");
    assert.equal((await next()).id, 3);
    assert.equal(restarted.length, 1);
    const exit = once(child, "exit"); child.stdin.end();
    const [code] = await exit; assert.equal(code, 0, stderr);
    assert.equal(output.trim(), ""); assert.equal(replies.length, 0);
    for (const token of tokens) assert.ok(!stderr.includes(token));
  } finally {
    child?.kill();
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await rm(temp, { recursive: true, force: true });
  }
}

test("Node MCP bridge handles framing, notifications and runtime changes without logging credentials", () => exercise(process.execPath, ["tools/mcp.mjs"]));
test("native MCP bridge handles framing, notifications and runtime changes", { skip: !process.env.LOF_AUDIO_TEST_BINARY }, () => exercise(process.env.LOF_AUDIO_TEST_BINARY, ["--mcp"]));
test("skill tool reference matches the native server schema", { skip: !process.env.LOF_AUDIO_TEST_BINARY }, async () => {
  const native = spawnSync(process.env.LOF_AUDIO_TEST_BINARY, ["--export-tools"], { encoding: "utf8", windowsHide: true });
  assert.equal(native.status, 0, native.stderr);
  const reference = JSON.parse(await readFile("skills/lof-audio/references/tools.json", "utf8"));
  assert.deepEqual(reference, JSON.parse(native.stdout));
});
