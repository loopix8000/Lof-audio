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

## 스킬 배포

`skill_status`는 패키지 버전·revision과 파일별 SHA-256을 제공한다. `skill_get`은 상대 `path`와 UTF-8 `content`를 반환한다. `knownRevision`이 같으면 파일 전송을 생략한다. 받은 상대 경로와 줄바꿈을 유지하고, 인증 토큰을 스킬이나 공유 문서에 넣지 않는다.

`skill_install`은 앱 기기의 절대 `skillsDirectory` 아래 `lof-audio`만 설치한다. 기존 설치본이 있으면 조회한 `installed.revision`으로 확인하고, 스킬 검색 경로 밖으로 폴더 전체를 백업한 뒤 교체한다. 변경되었으면 `SKILL_CHANGED`로 중단한다. 응답의 `installed.upToDate`와 `backupPath`를 확인한다. 다른 기기의 AI는 `skill_get`으로 파일을 받아 자기 기기에 설치한다.

프로토콜 참고: [MCP 전송 규격](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
