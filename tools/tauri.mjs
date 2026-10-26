import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const env = { ...process.env };

// The bundled Opus decoder needs CMake. Visual Studio can install it outside PATH.
if (process.platform === "win32" && !env.CMAKE && spawnSync("cmake", ["--version"], { stdio: "ignore", windowsHide: true }).status !== 0) {
  const vswhere = path.join(env["ProgramFiles(x86)"] || env.ProgramFiles || "C:\\Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (existsSync(vswhere)) {
    const result = spawnSync(vswhere, ["-latest", "-products", "*", "-find", "Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe"], { encoding: "utf8", windowsHide: true });
    const cmake = result.stdout?.trim().split(/\r?\n/)[0];
    if (cmake && existsSync(cmake)) env.CMAKE = cmake;
  }
}

const cli = path.join(path.dirname(require.resolve("@tauri-apps/cli")), "tauri.js");
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { env, stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
