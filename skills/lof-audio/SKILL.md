---
name: lof-audio
description: Lof Audio의 음악·재생목록·태그·가사를 관리하고, AI가 여러 웹·카탈로그 출처를 대조해 곡·앨범 메타정보를 조사하고 수정한다. Lof Audio 라이브러리 작업이나 음악 정보의 검증·정정을 요청할 때 사용한다.
---

# Lof Audio

실행 중인 Lof Audio의 MCP 도구를 우선 사용한다. 연결되지 않으면 앱의 **설정 → MCP / API → MCP 설정 복사**에서 연결 정보를 가져온다. HTTP를 직접 사용할 때는 [API 연결 방법](references/api.md)을 읽는다. SQLite DB나 음악 파일을 직접 고쳐 앱의 저장 처리를 우회하지 않는다.

## 조회와 재생

- `workspace_list`로 실제 `workspaceId`와 등록된 폴더를 확인한다. 조회·수정 도구에는 사용자가 지정한 워크스페이스 ID를 명시한다. ID를 파일명이나 순서로 추측하지 않는다.
- `library_search`로 제목·아티스트·앨범·장르·파일명을 검색한다. 기본 100곡, 최대 200곡이며 `offset`, `limit`, `total`, `truncated`로 이어 읽는다. 가사 본문은 필요한 곡만 `track_read`로 읽는다.
- `playback_play`는 해당 곡의 워크스페이스를 앱에서 선택하고 재생한다. `playback_status`로 실제 상태를 확인한다. 일시정지·재개·중지·탐색·음량·배속도 같은 API를 사용한다.

## 태그와 가사

음악 정보를 찾아 검증·정정하는 요청은 [여러 출처 메타정보 파이프라인](references/metadata-research.md)을 따른다. AI가 사용 가능한 웹 검색·브라우저·다른 MCP로 출처를 직접 확인하고, `metadata_research_prepare` → `metadata_research_preview` → `metadata_research_apply` → `track_read`/`metadata_research_history`를 사용한다. 내장 MusicBrainz 검색은 선택 가능한 후보 출처 하나이며, 단독으로 검증 완료로 취급하지 않는다. 사용자가 정확한 값을 직접 지정한 단순 수정은 아래의 `track_update`를 사용할 수 있다.

- `track_read`로 최신 `track`과 `revision`을 읽은 다음 `track_update`의 `expectedRevision`에 전달한다. `changes`에는 요청한 필드만 넣는다. `CONFLICT`이면 다시 읽고 바뀐 내용과 비교해 요청한 수정만 재적용한다. 이전 내용을 둔 채 revision만 바꾸지 않는다.
- 생략한 필드는 유지된다. `year`, `trackNumber`, `coverDataUrl`, `syncedLyrics`, `plainLyrics`의 `null`은 해당 값을 지운다. 커버 원본이 필요할 때만 `track_read`에 `includeCover: true`를 전달한다. 커버 쓰기는 이미지 data URL을 사용하며 조회 결과의 로컬 커버 URL을 쓰기 값으로 보내지 않는다.
- `syncedLyrics`를 저장하면 일반 가사도 생성한다. `plainLyrics`만 수정하면 기존 싱크 가사를 해제한다. 파일에 `.lrc`도 쓸지는 `saveLrcFile`로 명시하거나 앱 설정을 따른다.
- `lyrics_search`와 `metadata_search`는 후보만 조회한다. 후보가 곡과 일치하는지 확인하고 사용자가 요청한 항목만 저장한다. 같은 파일의 태그·가사·즐겨찾기는 그 파일을 공유하는 다른 워크스페이스에서도 바뀐다.
- 앨범 단위로 찾을 때는 `album_search(workspaceId, trackId)`로 발매판을 확인하고, 선택한 `releaseId`와 실제 `trackIds`로 `album_preview`를 호출한다. 앨범 전체를 한 번 조회해 제목과 재생 시간으로 매칭하며, 순서만으로 곡을 연결하지 않는다. 저장은 각 곡의 `track_read` revision을 확인한 뒤 `track_update`로 요청한 필드만 반영한다.
- 저장 뒤 `track_read`로 실제 내용과 새 revision을 확인하고 성공한 변경만 완료했다고 알린다. 앱 밖에서 파일을 고쳤다면 먼저 다시 색인하고 최신 내용을 조회한다.

## 폴더와 플레이리스트

- `folder_add`와 `library_rescan`은 색인 요청을 접수한다. `scan_status.busy`와 `pendingFolders`로 대기·진행 여부를 확인하고 `library_search`로 결과를 읽는다. 요청 접수만으로 완료라고 알리지 않는다.
- `folder_remove`는 해당 워크스페이스의 폴더 연결만 해제하고 `track_remove`는 그 워크스페이스에서만 곡을 제외한다. 음악 파일은 삭제하지 않는다.
- 플레이리스트는 워크스페이스별로 분리된다. `playlist_list`에서 확인한 ID와 같은 워크스페이스의 trackId를 사용한다. 워크스페이스 삭제는 그 안의 폴더 연결과 플레이리스트도 지우므로 사용자 요청 범위에 포함됐을 때 수행한다.

## 스킬 가져오기와 설치

`skill_status`로 앱에 포함된 패키지 revision을 확인하고 `skill_get`으로 파일을 받는다. 실제 AI 스킬 폴더가 앱과 같은 기기에 있으면 `skillsDirectory`를 지정해 설치 상태를 확인한 뒤 `skill_install`을 쓴다. 패키지 revision을 `expectedRevision`, 기존 설치본이 있으면 `installed.revision`을 `expectedInstalledRevision`으로 전달한다. 설치 결과와 백업 경로를 확인한다. 다른 기기의 AI는 `skill_get` 파일을 자기 기기에 설치한다. 설치 후 스킬 새로고침이나 새 세션이 필요할 수 있다.

도구 인자의 정확한 이름과 범위는 앱이 제공한 [도구 스키마](references/tools.json)를 따른다.
