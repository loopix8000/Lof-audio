import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** 정식 버전은 stable, 그 밖의 시험 버전(-alpha, -beta, -rc 등)은 beta 채널이다. */
export function releaseChannel(version) {
  return version.split("+")[0].includes("-") ? "beta" : "stable";
}

export function compareVersions(a, b) {
  const parse = value => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/.exec(value.replace(/^v/, ""));
    if (!match) throw Error(`Invalid release version: ${value}`);
    return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split(".") ?? [] };
  };
  const left = parse(a), right = parse(b);
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i] ? 1 : -1;
  }
  if (!left.pre.length || !right.pre.length) return left.pre.length ? -1 : right.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i], y = right.pre[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

// 정식 버전은 베타 채널에도 올리되, 이미 더 최신인 채널은 되돌리지 않는다.
export function publishChannels({ repo, version, manifestPath, target, temporary }) {
  const gh = (...args) => execFileSync("gh", [...args, "--repo", repo], { encoding: "utf8", windowsHide: true }).trim();
  const tags = releaseChannel(version) === "stable" ? ["stable", "beta"] : ["beta"];
  for (const tag of tags) {
    let current;
    try { current = JSON.parse(gh("release", "view", tag, "--json", "isPrerelease,assets")); }
    catch (error) { if (!/release not found|HTTP 404/i.test(String(error.stderr ?? error))) throw error; }
    if (current && !current.isPrerelease) throw Error(`Channel ${tag} must be a prerelease.`);
    if (current?.assets.some(asset => asset.name === "latest.json")) {
      const previousPath = path.join(temporary, `${tag}-latest.json`);
      gh("release", "download", tag, "--pattern", "latest.json", "--output", previousPath, "--clobber");
      const previous = JSON.parse(fs.readFileSync(previousPath, "utf8"));
      if (compareVersions(previous.version, version) > 0) {
        console.log(`Kept newer ${tag}: ${previous.version}`);
        continue;
      }
    }
    if (!current) gh("release", "create", tag, "--target", target, "--draft", "--prerelease",
      "--title", `${tag} update channel`, "--notes", "업데이트 채널 배포 정보입니다. 설치 파일은 버전별 릴리즈에서 다운로드하세요.");
    gh("release", "upload", tag, manifestPath, "--clobber");
    gh("release", "edit", tag, "--draft=false", "--prerelease", "--latest=false");
  }
}
