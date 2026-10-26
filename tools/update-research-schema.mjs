import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = { type: "integer", minimum: 1, maximum: 9007199254740991 };
const text = (maxLength = 4096) => ({ type: "string", minLength: 1, maxLength });
const revision = { type: "string", minLength: 64, maxLength: 64 };
const fields = {
  title: text(),
  artist: { type: "string", maxLength: 4096 },
  album: { type: "string", maxLength: 4096 },
  albumArtist: { type: "string", maxLength: 4096 },
  year: { type: ["integer", "null"], minimum: 0, maximum: 9999 },
  trackNumber: { type: ["integer", "null"], minimum: 0, maximum: 65535 },
  genre: { type: "string", maxLength: 4096 },
};
const fieldNames = { type: "array", items: { type: "string", enum: Object.keys(fields) }, minItems: 1, maxItems: 7, uniqueItems: true };
const changes = { type: "object", properties: fields, minProperties: 1, additionalProperties: false };
const source = {
  type: "object", additionalProperties: false,
  properties: {
    sourceId: text(80), url: text(), title: text(), publisher: text(200), independenceKey: text(200),
    sourceKind: { type: "string", enum: ["official", "catalog", "store", "streaming", "reference", "other"] },
    identityVerified: { type: "boolean" }, identityNote: text(2000), accessedAt: text(64), note: text(2000), claims: changes,
  },
  required: ["sourceId", "url", "title", "publisher", "independenceKey", "sourceKind", "identityVerified", "identityNote", "claims"],
};
const proposal = {
  workspaceId: id, trackId: id, expectedRevision: revision, changes,
  sources: { type: "array", minItems: 1, maxItems: 16, items: source },
};
const requiredProposal = Object.keys(proposal);
const tool = (name, description, properties, required, readOnly) => ({
  name, description, inputSchema: { type: "object", properties, required, additionalProperties: false },
  annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: false },
});
const additions = [
  tool("metadata_research_prepare", "AI의 여러 출처 조사를 위한 최신 태그·revision·동일 곡 식별 정보·검색어·앨범 그룹 조회. 외부 검색은 AI의 웹/다른 MCP 도구로 수행", {
    workspaceId: id, trackIds: { type: "array", items: id, minItems: 1, maxItems: 200, uniqueItems: true }, fields: fieldNames,
  }, ["workspaceId", "trackIds"], true),
  tool("metadata_research_preview", "AI가 확인한 출처별 관측값과 수정안을 비교. 필드별 출처 충돌·근거 부족을 표시하고 저장 가능한 필드와 planHash 반환. 서버는 출처 본문을 직접 검증하지 않음", proposal, requiredProposal, true),
  tool("metadata_research_apply", "미리보기 hash·최신 revision을 확인하고 독립 출처 2개 이상이 일치하며 충돌 없는 선택 필드만 저장. 출처·전후 값·결과를 DB 이력에 기록", {
    ...proposal, expectedPlanHash: revision, selectedFields: fieldNames,
  }, [...requiredProposal, "expectedPlanHash", "selectedFields"], false),
  tool("metadata_research_history", "지정한 워크스페이스와 곡의 AI 메타정보 수정 근거·전후 값·저장 결과 이력 조회", {
    workspaceId: id, trackId: id, limit: { type: "integer", minimum: 1, maximum: 20 },
  }, ["workspaceId", "trackId"], true),
];

// serde_json's default object ordering is lexical; keep bundled bytes identical.
const ordered = value => Array.isArray(value) ? value.map(ordered) : value !== null && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const encode = value => JSON.stringify(ordered(value), null, 2);
const newNames = new Set(additions.map(tool => tool.name));
const bundledPath = path.join(root, "skills/lof-audio/references/tools.json");
const existing = JSON.parse(readFileSync(bundledPath, "utf8")).filter(tool => !newNames.has(tool.name));
writeFileSync(path.join(root, "src-tauri/src/automation/research_tools.json"), encode(additions));
writeFileSync(bundledPath, encode([...existing, ...additions]));
console.log(`Updated ${additions.length} research tool definitions; ${existing.length + additions.length} bundled tools.`);
