# 로컬 API

앱의 **설정 → MCP / API**에서 연결 정보를 복사한다. 앱이 다시 실행되면 포트와 토큰이 바뀔 수 있다. 같은 기기의 클라이언트는 복사한 MCP 설정의 실행 파일과 `--runtime` 경로를 사용하면 재시작 후에도 현재 연결 파일을 읽는다.

- `/mcp`: MCP Streamable HTTP. `initialize`, `ping`, `tools/list`, `tools/call` 지원. 지속 SSE 연결과 세션은 사용하지 않는다.
- `/rpc`: 같은 도구를 `{"name":"도구 이름","arguments":{...}}`으로 호출한다.
- `/health`: 인증 없이 앱 이름과 버전만 확인한다.

`/mcp`, `/rpc`에는 복사한 `headers.Authorization`과 `Content-Type: application/json`이 필요하다. 요청 본체는 최대 8 MB다. MCP 클라이언트는 `Accept: application/json, text/event-stream`도 보낸다. 서버는 localhost에만 연결하며 브라우저 Origin을 포함한 요청을 거부한다. 원격 실행 환경의 localhost는 앱 기기의 localhost와 다르므로 연결 가능한 로컬 실행 환경을 사용한다.

```json
{"name":"workspace_list","arguments":{}}
```

```json
{"name":"library_search","arguments":{"workspaceId":1,"query":"곡 제목","limit":20}}
```

위 `workspaceId`는 예시다. `workspace_list` 응답의 실제 ID를 쓴다.

성공 응답은 `{"result":...}`이다. 실패 응답에는 `error`와 `code`가 있으며 `CONFLICT`는 HTTP 409로 반환한다. MCP 실행 실패는 `result.isError: true`로 표시한다. 오류나 시간 초과 후 쓰기를 무작정 반복하지 말고 현재 상태를 다시 읽는다.

```json
{"name":"track_update","arguments":{"workspaceId":1,"trackId":42,"expectedRevision":"track_read에서 받은 revision","changes":{"genre":"Jazz"},"saveLrcFile":false}}
```

`track_update`는 지정한 필드만 바꾸고 음악 파일 저장이 성공한 뒤 DB를 갱신한다. 여러 곡을 고칠 때도 각 곡을 읽어 revision을 확인한다. 지원 도구와 필드 범위는 [tools.json](tools.json)을 참조한다.

앨범 조회는 `album_search`에 `workspaceId`, 대표 곡의 `trackId`를 전달하고, 응답에서 발매판을 선택한 뒤 `album_preview`에 `workspaceId`, `trackIds`, `releaseId`를 전달한다. `candidates`와 곡별 `matches`는 후보이며 파일은 수정하지 않는다. 메타데이터는 10분, 가사는 5분간 메모리에서 캐시하며 같은 요청이 진행 중이면 응답을 공유한다. 앱을 종료하면 캐시는 비워진다.

## 여러 출처 조사 도구

`metadata_research_prepare`에 실제 `workspaceId`, `trackIds`를 보내 AI의 외부 조사를 위한 최신 태그와 revision을 받는다. 웹 검색·브라우저·다른 MCP의 선택과 실제 출처 확인은 AI 클라이언트가 수행한다. 내장 검색 API만으로 교차 검증했다고 간주하지 않는다.

`metadata_research_preview`는 `workspaceId`, `trackId`, `expectedRevision`, `changes`, `sources`로 전후 값과 근거 충돌을 비교한다. 저장하지 않으며 `planHash`, `proposal`, `readyFields`, `blockedFields`를 반환한다. `metadata_research_apply`에는 반환된 `proposal`의 항목과 `expectedPlanHash`, `selectedFields`를 전달한다. 최신 revision·미리보기 hash·출처 근거를 다시 검사한 뒤 선택한 메타정보만 저장한다.

`metadata_research_history`는 같은 워크스페이스와 곡의 변경 근거·전후 값·결과 이력을 반환한다. `applied: true`와 `audit.status: pending`은 저장은 성공했지만 이력 완료 표시가 실패했음을 뜻한다. 저장 오류의 `failed_or_incomplete`나 앱 종료 후 `pending`을 자동 롤백으로 해석하지 않는다.

출처 관측값과 독립 원천 구분은 AI가 제출한 정보다. 서버의 `sourceVerification: agent_reported`는 웹 페이지의 내용을 서버가 직접 검증했다는 의미가 아니다. 필드와 근거 작성 방법은 [메타정보 조사 절차](metadata-research.md)를 따른다.

## 스킬 배포

`skill_status`는 패키지 버전·revision과 파일별 SHA-256을 제공한다. `skill_get`은 상대 `path`와 UTF-8 `content`를 반환한다. `knownRevision`이 같으면 파일 전송을 생략한다. 받은 상대 경로와 줄바꿈을 유지하고, 인증 토큰을 스킬이나 공유 문서에 넣지 않는다.

`skill_install`은 앱 기기의 절대 `skillsDirectory` 아래 `lof-audio`만 설치한다. 기존 설치본이 있으면 조회한 `installed.revision`으로 확인하고, 스킬 검색 경로 밖으로 폴더 전체를 백업한 뒤 교체한다. 변경되었으면 `SKILL_CHANGED`로 중단한다. 응답의 `installed.upToDate`와 `backupPath`를 확인한다. 다른 기기의 AI는 `skill_get`으로 파일을 받아 자기 기기에 설치한다.

프로토콜 참고: [MCP 전송 규격](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
