import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "dir";
if (!["dir", "msi", "nsis"].includes(mode)) {
  throw new Error(`지원하지 않는 패키징 형식입니다: ${mode}`);
}
if (process.platform !== "win32") {
  throw new Error("Windows 배포본은 Windows에서 빌드하세요.");
}

const tauriDir = path.join(rootDir, "src-tauri");
const config = JSON.parse(fs.readFileSync(path.join(tauriDir, "tauri.conf.json"), "utf8"));
const releaseDir = path.join(rootDir, "release");
const unpackedDir = path.join(releaseDir, "win-unpacked");
const targetDir = path.join(tauriDir, "target", "release");
const wrapper = path.join(rootDir, "tools", "tauri.mjs");
const buildArgs = mode === "dir" ? ["--no-bundle"] : ["--bundles", mode];

// Opus 빌드에 필요한 CMake 자동 탐색을 기존 Tauri 래퍼에서 유지한다.
const result = spawnSync(process.execPath, [wrapper, "build", ...buildArgs, ...process.argv.slice(3)], {
  cwd: rootDir,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const builtExe = path.join(targetDir, "lof-audio.exe");
if (!fs.existsSync(builtExe)) {
  throw new Error(`빌드된 실행 파일을 찾을 수 없습니다: ${builtExe}`);
}

// 버전별 폴더를 만들지 않고 같은 배포 경로에 실행 파일과 리소스를 갱신한다.
fs.mkdirSync(unpackedDir, { recursive: true });
fs.copyFileSync(builtExe, path.join(unpackedDir, `${config.productName}.exe`));
fs.copyFileSync(path.join(tauriDir, "icons", "icon.ico"), path.join(unpackedDir, "icon.ico"));
for (const [source, destination] of Object.entries(config.bundle.resources)) {
  const target = path.resolve(unpackedDir, destination);
  const relative = path.relative(unpackedDir, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`배포 폴더를 벗어난 리소스 경로입니다: ${destination}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(path.resolve(tauriDir, source), target, { recursive: true });
}

if (mode !== "dir") {
  const bundleDir = path.join(targetDir, "bundle", mode);
  const extension = mode === "msi" ? ".msi" : ".exe";
  const installers = fs.readdirSync(bundleDir).filter(file => file.endsWith(extension));
  if (installers.length === 0) {
    throw new Error(`설치 파일을 찾을 수 없습니다: ${bundleDir}`);
  }
  for (const file of installers) {
    fs.copyFileSync(path.join(bundleDir, file), path.join(releaseDir, file));
    const signature = `${file}.sig`;
    if (fs.existsSync(path.join(bundleDir, signature))) {
      fs.copyFileSync(path.join(bundleDir, signature), path.join(releaseDir, signature));
    }
  }
  console.log(`설치 파일: ${releaseDir}`);
}

console.log(`폴더 배포본: ${unpackedDir}`);
