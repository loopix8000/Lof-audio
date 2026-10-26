# 오픈소스 라이선스 고지

Lof Audio가 사용하는 외부 소프트웨어의 저작권과 라이선스를 안내합니다. 각 구성 요소에는 해당 저작권자의 라이선스가 적용됩니다.

Lof Audio 자체 소스에는 [MIT 라이선스](LICENSE)가 적용되며, 외부 구성 요소는 각자의 라이선스를 따릅니다.

## 의존성 목록과 원문

- [전체 의존성 목록](licenses/DEPENDENCIES.md): 잠금 파일 기준의 패키지 이름, 버전, 라이선스 선언, 원본 출처입니다.
- [저작권·라이선스 원문](licenses/THIRD_PARTY_LICENSES.txt): 설치된 패키지에서 수집한 라이선스, 저작권, 추가 고지 원문입니다. 같은 원문은 출처 목록과 함께 한 번 수록했습니다.

목록은 `package-lock.json`과 `src-tauri/Cargo.lock`을 기준으로 작성했습니다. npm 개발 도구·선택 패키지와 Windows x64용 Cargo 빌드 의존성도 포함하므로, 모든 항목이 배포 실행 파일에 포함되는 것은 아닙니다. 원본 소스의 파일별 고지와 각 패키지의 추가 조건도 함께 적용됩니다.

## 주요 구성 요소

| 구성 요소 | 용도 | 라이선스 선언 | 원본 |
| --- | --- | --- | --- |
| Tauri, Tauri API, dialog/updater 플러그인 | 데스크탑 앱, 파일 대화상자, 업데이트 | Apache-2.0 OR MIT | [Tauri](https://github.com/tauri-apps/tauri), [플러그인](https://github.com/tauri-apps/plugins-workspace) |
| React, React DOM | 화면 구성 | MIT | [React](https://github.com/facebook/react) |
| Lucide React | 아이콘 | ISC, 일부 Feather 유래 코드의 MIT 고지 포함 | [Lucide](https://github.com/lucide-icons/lucide) |
| rodio | 오디오 재생 | MIT OR Apache-2.0 | [rodio](https://github.com/RustAudio/rodio) |
| Symphonia 및 코덱·포맷 모듈 | 오디오 디코딩 | MPL-2.0 | [Symphonia](https://github.com/pdeljanov/Symphonia) |
| symphonia-adapter-libopus | Opus 디코더 연결 | MIT OR Apache-2.0 | [symphonia-adapters](https://github.com/aschey/symphonia-adapters) |
| opusic-sys, libopus | Opus 디코딩 | BSD-3-Clause | [opusic-sys](https://github.com/DoumanAsh/opusic-sys), [Opus](https://opus-codec.org/license/) |
| lofty | 오디오 태그 읽기·쓰기 | MIT OR Apache-2.0 | [lofty](https://github.com/Serial-ATA/lofty-rs) |
| rusqlite, libsqlite3-sys | SQLite 연결 | MIT | [rusqlite](https://github.com/rusqlite/rusqlite) |
| SQLite | 내장 데이터베이스 | Public Domain | [SQLite 저작권 안내](https://sqlite.org/copyright.html) |
| reqwest | HTTP 요청 | MIT OR Apache-2.0 | [reqwest](https://github.com/seanmonstar/reqwest) |
| rustls | TLS 연결 | Apache-2.0 OR ISC OR MIT | [rustls](https://github.com/rustls/rustls) |
| ring | 암호화 연산 | Apache-2.0 AND ISC, 포함 코드별 추가 고지 | [ring](https://github.com/briansmith/ring) |
| Tokio | 비동기 처리 | MIT | [Tokio](https://github.com/tokio-rs/tokio) |
| serde, serde_json | 직렬화 | MIT OR Apache-2.0 | [Serde](https://github.com/serde-rs/serde), [JSON](https://github.com/serde-rs/json) |
| base64, getrandom, hex, httparse, sha2, tempfile | 인코딩, 난수, HTTP 파싱, 해시, 임시 파일 | MIT OR Apache-2.0 | [버전별 원본 링크](licenses/DEPENDENCIES.md) |
| walkdir | 폴더 탐색 | Unlicense/MIT | [walkdir](https://github.com/BurntSushi/walkdir) |
| TypeScript | 개발·타입 검사 | Apache-2.0 | [TypeScript](https://github.com/microsoft/TypeScript) |
| Vite, React 플러그인 | 개발 서버·프론트엔드 번들 | MIT | [Vite](https://github.com/vitejs/vite), [플러그인](https://github.com/vitejs/vite-plugin-react) |
| React 타입 정의 | 개발·타입 검사 | MIT | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |

`OR`는 해당 구성 요소가 제공하는 대체 라이선스를, `AND`는 함께 적용되는 라이선스를 나타냅니다. 위 표는 안내용 요약이며, 저작권 표시와 정확한 조건은 수록한 원문 및 해당 버전의 원본을 따릅니다.

## Symphonia 소스 제공

Symphonia 및 `symphonia-*` 디코더·포맷 모듈의 MPL-2.0 적용 소스는 [버전별 의존성 목록](licenses/DEPENDENCIES.md)의 crates.io 링크에서 확인할 수 있습니다. 각 페이지의 소스 보기 또는 다음 주소 형식으로 게시된 해당 버전의 원본 소스 아카이브를 받을 수 있습니다.

```text
https://static.crates.io/crates/<패키지 이름>/<패키지 이름>-<버전>.crate
```

예: [symphonia 0.5.5 원본 소스](https://static.crates.io/crates/symphonia/symphonia-0.5.5.crate), [symphonia-core 0.5.5 원본 소스](https://static.crates.io/crates/symphonia-core/symphonia-core-0.5.5.crate). 이 프로젝트는 현재 레지스트리의 해당 패키지를 수정 없이 사용합니다. MPL 적용 파일을 수정하여 배포하는 경우 그 수정 소스도 MPL-2.0에 따라 제공해야 합니다. 자세한 내용은 [MPL-2.0 원문](https://www.mozilla.org/en-US/MPL/2.0/)과 [공식 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)를 참고하세요.

## 외부 서비스와 콘텐츠

MusicBrainz, LRCLIB, Cover Art Archive는 앱이 HTTP로 조회하는 외부 서비스입니다. 서비스의 소스 코드 라이선스와 응답에 포함된 데이터·가사·이미지의 이용 조건은 구분됩니다.

- MusicBrainz의 핵심 데이터는 CC0, 부가 데이터는 CC BY-NC-SA 3.0으로 구분됩니다. [공식 데이터 라이선스](https://musicbrainz.org/doc/About/Data_License)를 따릅니다.
- LRCLIB가 제공하는 가사와 Cover Art Archive의 앨범 이미지는 해당 콘텐츠 권리자의 권리를 따릅니다. 이 문서는 그 콘텐츠에 대한 별도 이용 허락을 부여하지 않습니다. [LRCLIB API](https://lrclib.net/docs), [Cover Art Archive](https://coverartarchive.org/)에서 서비스 정보를 확인할 수 있습니다.
- 사용자 음악 파일과 태그·가사·앨범 커버는 이 문서가 정하는 소프트웨어 라이선스의 대상이 아닙니다.

CSS의 글꼴 이름은 시스템에 설치된 글꼴을 선택하기 위한 설정입니다. 이 저장소에는 해당 글꼴 파일을 포함하지 않습니다.

## 문서 갱신

의존성을 설치하고 Cargo 패키지 캐시를 준비한 환경에서 다음 명령으로 목록과 고지 원문을 다시 수집할 수 있습니다. 빌드나 테스트는 실행하지 않습니다.

```sh
node tools/third-party-notices.mjs
```

수집 도구는 설치된 npm 패키지의 라이선스·고지 파일, Cargo 패키지의 라이선스·고지 파일, libopus의 `COPYING`과 특허 고지, ring의 추가 라이선스 파일을 읽습니다. 의존성 변경 시 이 문서의 요약과 소스 제공 링크도 함께 갱신합니다.
