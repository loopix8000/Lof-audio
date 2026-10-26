import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { publishChannels, releaseChannel } from "./update-channels.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const repo = process.env.GITHUB_REPOSITORY;
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("GITHUB_REPOSITORY is required.");
const tag = `v${version}`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lof-audio-release-"));

function gh(...args) {
  return execFileSync("gh", [...args, "--repo", repo], {
    cwd: root, encoding: "utf8", windowsHide: true,
  }).trim();
}

try {
  const release = JSON.parse(gh("release", "view", tag, "--json", "assets,isDraft,isPrerelease,targetCommitish"));
  if (release.isPrerelease !== version.includes("-")) throw new Error("Release channel does not match the version.");
  gh("release", "download", tag, "--pattern", "latest.json", "--dir", temporary);
  const manifestPath = path.join(temporary, "latest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.version.replace(/^v/, "") !== version) throw new Error("Updater version mismatch.");
  const platform = manifest.platforms?.["windows-x86_64-nsis"] ?? manifest.platforms?.["windows-x86_64"];
  if (!platform?.signature) throw new Error("Signed Windows updater entry is missing.");
  const download = new URL(platform.url);
  const prefix = `/${repo}/releases/download/${tag}/`;
  // The build action can emit an API asset URL while the release is still a draft.
  const asset = release.assets.find(item => item.apiUrl === download.href || item.url === download.href ||
    (download.origin === "https://github.com" && download.pathname === `${prefix}${encodeURIComponent(item.name)}`));
  if (!asset) throw new Error("Updater must point to this version's release assets.");
  const installer = asset.name;
  if (!installer.endsWith(".exe") || installer.includes("/")) throw new Error("Invalid NSIS installer asset name.");
  for (const name of [installer, `${installer}.sig`]) {
    if (!release.assets.some(asset => asset.name === name && asset.size > 0)) {
      throw new Error(`Missing release asset: ${name}`);
    }
  }
  gh("release", "download", tag, "--pattern", `${installer}.sig`, "--dir", temporary);
  if (fs.readFileSync(path.join(temporary, `${installer}.sig`), "utf8").trim() !== platform.signature.trim()) {
    throw new Error("Updater signature does not match the installer signature asset.");
  }
  // 잘못 등록한 비밀키로 서명한 설치 파일이 기존 앱에 배포되지 않도록 확인한다.
  const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
  if (!publicKey) throw new Error("서명을 확인할 TAURI_UPDATER_PUBLIC_KEY가 필요합니다.");
  const decode = value => Buffer.from(value, "base64").toString("utf8").trim().split(/\r?\n/);
  const publicPacket = Buffer.from(decode(publicKey)[1] ?? "", "base64");
  const signatureLines = decode(platform.signature.trim());
  const signaturePacket = Buffer.from(signatureLines[1] ?? "", "base64");
  if (publicPacket.length !== 42 || signaturePacket.length !== 74 ||
      signaturePacket.subarray(0, 2).toString() !== "ED" ||
      !signatureLines[2]?.startsWith("trusted comment: ")) {
    throw new Error("업데이트 공개키 또는 서명 형식이 올바르지 않습니다.");
  }
  if (!publicPacket.subarray(2, 10).equals(signaturePacket.subarray(2, 10))) {
    throw new Error("비밀키와 앱 공개키가 다릅니다. 기존 Lof Audio 비밀키를 복구해 주세요.");
  }
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicPacket.subarray(10)]),
    format: "der", type: "spki",
  });
  gh("release", "download", tag, "--pattern", installer, "--dir", temporary);
  const payload = fs.readFileSync(path.join(temporary, installer));
  const digest = createHash("blake2b512").update(payload).digest();
  const signature = signaturePacket.subarray(10);
  const trusted = Buffer.concat([signature, Buffer.from(signatureLines[2].slice(17))]);
  if (!verify(null, digest, key, signature) ||
      !verify(null, trusted, key, Buffer.from(signatureLines[3] ?? "", "base64"))) {
    throw new Error("설치 파일의 업데이트 서명 검증에 실패했습니다.");
  }
  const publicDownload = `https://github.com${prefix}${encodeURIComponent(installer)}`;
  const originalDownload = platform.url;
  for (const entry of Object.values(manifest.platforms)) {
    if (entry.url === originalDownload) entry.url = publicDownload;
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  gh("release", "upload", tag, manifestPath, "--clobber");

  // Publish installers before moving the channel so the manifest always has a public download.
  if (release.isDraft) gh("release", "edit", tag, "--draft=false", "--latest=false");
  publishChannels({ repo, version, manifestPath, target: process.env.GITHUB_SHA || release.targetCommitish, temporary });
  if (releaseChannel(version) === "stable") gh("release", "edit", tag, "--latest");
  console.log(`Published ${tag} and updated release channels.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
