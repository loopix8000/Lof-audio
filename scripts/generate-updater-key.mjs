import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateDir = path.join(root, ".private");
const privateKey = path.join(privateDir, "updater.key");
const publicKey = `${privateKey}.pub`;
const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (fs.existsSync(privateKey) || fs.existsSync(publicKey)) {
  fail("서명 키 파일이 이미 있습니다. 기존 키를 덮어쓰지 않았습니다.");
}
if (!fs.existsSync(cli)) fail("Tauri CLI가 없습니다. 먼저 npm ci를 실행하세요.");

// 키가 Git에 포함되지 않는지 확인한 뒤 파일을 생성한다.
for (const relative of [".private/updater.key", ".private/updater.key.pub"]) {
  const ignored = spawnSync("git", ["check-ignore", "-q", "--", relative], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true,
  });
  if (ignored.status !== 0) fail(".private/ 폴더를 .gitignore에 등록한 뒤 다시 실행하세요.");
}
if (fs.existsSync(privateDir) &&
    (fs.lstatSync(privateDir).isSymbolicLink() || !fs.lstatSync(privateDir).isDirectory())) {
  fail(".private 경로는 실제 폴더여야 합니다.");
}
fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });

// CLI가 출력할 수 있는 키 내용은 화면이나 로그로 전달하지 않는다.
const result = spawnSync(process.execPath, [cli, "signer", "generate", "--ci", "--write-keys", privateKey], {
  cwd: root,
  stdio: "ignore",
  windowsHide: true,
});
if (result.status !== 0) {
  fail("서명 키 생성에 실패했습니다. .private 폴더의 파일 상태를 확인하세요.");
}
for (const file of [privateKey, publicKey]) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    fail("서명 키 파일이 완성되지 않았습니다. 기존 파일을 보존한 상태로 중단했습니다.");
  }
}
if (process.platform !== "win32") fs.chmodSync(privateKey, 0o600);

console.log("업데이트 서명 키를 생성했습니다. 키 내용은 출력하지 않습니다.");
console.log(`비밀키: ${privateKey}`);
console.log(`공개키: ${publicKey}`);
console.log("GitHub의 TAURI_SIGNING_PRIVATE_KEY에는 비밀키 파일 전체 내용을 등록하세요.");
console.log("TAURI_UPDATER_PUBLIC_KEY 변수에는 공개키 파일 전체 내용을 등록하세요.");
console.log("이 명령은 별도 암호 없이 키를 생성하므로 비밀키 암호 Secret은 등록하지 않아도 됩니다.");
