import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
// 앱은 채널별 주소를 직접 지정하므로 이 값은 기본 주소로만 쓰인다.
const endpoint = "https://github.com/loopix8000/Lof-audio/releases/download/beta/latest.json";
if (!publicKey) {
  throw new Error("TAURI_UPDATER_PUBLIC_KEY를 설정하세요.");
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const cargo = fs.readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (pkg.version !== config.version || pkg.version !== cargoVersion) {
  throw new Error("package.json, tauri.conf.json, Cargo.toml의 버전을 일치시키세요.");
}

// 비밀키는 이 파일에 기록하지 않는다. 공개키와 업데이트 산출물 설정만 덧붙인다.
const outputPath = path.join(root, "src-tauri/tauri.updater.generated.json");
fs.writeFileSync(outputPath, JSON.stringify({
  bundle: { createUpdaterArtifacts: true },
  plugins: {
    updater: { pubkey: publicKey, endpoints: [endpoint], windows: { installMode: "passive" } },
  },
}, null, 2) + "\n");
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT,
    `version=${pkg.version}\nprerelease=${pkg.version.includes("-")}\n`);
}
console.log("서명된 설치 파일 빌드를 위한 업데이트 설정을 준비했습니다.");
