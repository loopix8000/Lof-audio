import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Reads installed packages and Cargo metadata only; does not build or run tests.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const pkg = readJson(path.join(root, "package.json"));
const lock = readJson(path.join(root, "package-lock.json"));
const metadata = JSON.parse(execFileSync("cargo", [
  "metadata", "--format-version", "1", "--locked", "--offline",
  "--filter-platform", "x86_64-pc-windows-msvc", "--manifest-path", "src-tauri/Cargo.toml",
], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true }));
const output = path.join(root, "licenses");
fs.mkdirSync(output, { recursive: true });
const texts = new Map();
const rows = [];
const cell = value => String(value ?? "").replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
const sha = value => createHash("sha256").update(value).digest("hex");
const repository = value => {
  const url = typeof value === "string" ? value : value?.url;
  if (!url) return undefined;
  const normalized = url.replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\//, "https://");
  if (/^[\w.-]+\/[\w.-]+$/.test(normalized)) return `https://github.com/${normalized}`;
  if (/^https?:\/\//.test(normalized)) return normalized;
  return undefined;
};
const isNotice = name => /^(licen[cs]e|copying|notice|unlicense|copyright|patents?)(?:[._-]|$)|^thirdpartynotice/i.test(name);

function addFiles(label, directory, explicit = []) {
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && isNotice(entry.name)).map(entry => entry.name);
  for (const file of [...new Set([...files, ...explicit])].sort()) {
    const absolute = path.resolve(directory, file);
    if (!absolute.startsWith(directory + path.sep) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    const text = fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n");
    const key = sha(text);
    if (!texts.has(key)) texts.set(key, { text, origins: [] });
    texts.get(key).origins.push(`${label}: ${file.replaceAll("\\", "/")}`);
  }
}

for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location) continue;
  const directory = path.join(root, location);
  const manifest = path.join(directory, "package.json");
  const installed = fs.existsSync(manifest) ? readJson(manifest) : null;
  if (installed && installed.version !== entry.version) throw Error(`Lockfile mismatch: ${location}`);
  const name = installed?.name ?? location.split("node_modules/").at(-1);
  const label = `npm ${name}@${entry.version}`;
  const url = repository(installed?.repository) ?? `https://www.npmjs.com/package/${name}/v/${entry.version}`;
  rows.push(["npm", name, entry.version, installed?.license ?? entry.license ?? "미기재",
    pkg.dependencies?.[name] ? "직접" : pkg.devDependencies?.[name] ? "직접·개발" : "전이/선택", url]);
  if (installed) addFiles(label, directory);
}

const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
const reachable = new Set();
function visit(id) {
  if (reachable.has(id)) return;
  reachable.add(id);
  for (const dependency of nodes.get(id)?.deps ?? []) visit(dependency.pkg);
}
visit(metadata.resolve.root);
const direct = new Set(nodes.get(metadata.resolve.root).deps.map(dependency => dependency.pkg));
for (const entry of metadata.packages.filter(entry => reachable.has(entry.id) && entry.id !== metadata.resolve.root)) {
  const url = `https://crates.io/crates/${entry.name}/${entry.version}`;
  rows.push(["Cargo", entry.name, entry.version, entry.license ?? "라이선스 파일 참조",
    direct.has(entry.id) ? "직접/빌드" : "전이", url]);
  const extras = entry.license_file ? [entry.license_file] : [];
  if (entry.name === "opusic-sys") {
    extras.push("opus/COPYING");
    extras.push(...fs.readdirSync(path.join(path.dirname(entry.manifest_path), "opus"))
      .filter(name => /^patent/i.test(name)).map(name => `opus/${name}`));
  }
  if (entry.name === "ring") extras.push("src/polyfill/once_cell/LICENSE-APACHE", "src/polyfill/once_cell/LICENSE-MIT");
  addFiles(`Cargo ${entry.name}@${entry.version}`, path.dirname(entry.manifest_path), extras);
}

rows.sort((a, b) => a.join("\t").localeCompare(b.join("\t"), "en"));
const table = rows.map(row => `| ${row.slice(0, 5).map(cell).join(" | ")} | [원본](${row[5]}) |`).join("\n");
fs.writeFileSync(path.join(output, "DEPENDENCIES.md"), `# 의존성 라이선스 목록\n\n` +
  `Lof Audio ${pkg.version}의 잠금 파일을 기준으로 작성했습니다.\n\n` +
  `npm은 package-lock.json의 전체 패키지(개발 도구·다른 플랫폼의 선택 패키지 포함), Cargo는 Windows x64 의존성 그래프(빌드 의존성 포함)를 기록합니다. 최종 실행 파일에 이 목록의 모든 패키지가 포함된다는 의미는 아닙니다. SPDX 표현식은 패키지의 선언을 유지합니다.\n\n` +
  `설치된 패키지에서 수집한 저작권·라이선스 고지 원문은 [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)에 있습니다. 설치되지 않은 npm 선택 패키지는 잠금 파일의 선언과 원본 링크를 기록합니다. 원문 파일 수집은 모든 소스 파일의 개별 고지를 대체하지 않습니다.\n\n` +
  `| 생태계 | 패키지 | 버전 | 라이선스 선언 | 의존성 | 출처 |\n| --- | --- | --- | --- | --- | --- |\n${table}\n`);
const notice = [...texts.values()].map(({ text, origins }) =>
  `${"=".repeat(78)}\n${origins.sort().join("\n")}\n${"=".repeat(78)}\n\n${text.trimEnd()}\n`).join("\n");
fs.writeFileSync(path.join(output, "THIRD_PARTY_LICENSES.txt"),
  `Lof Audio third-party copyright and license notices\n\n` +
  `Original text collected from installed packages referenced by the lockfiles.\n` +
  `Identical files are reproduced once with all originating packages listed.\n` +
  `Package declarations and source links: DEPENDENCIES.md\n\n${notice}`);
console.log(`${rows.length} dependency entries; ${texts.size} distinct notice texts.`);
