# 릴리즈와 앱 업데이트

GitHub Actions의 **Build Windows release** 워크플로로 서명된 NSIS 설치 파일과 업데이트 정보(`latest.json`)를 만든다. 앱은 설정 > 업데이트에서 선택한 채널의 `latest.json`을 확인한다.

| 앱의 채널 | 받는 버전 | 채널 주소 |
| --- | --- | --- |
| 정식 | 정식 버전만 | `https://github.com/loopix8000/Lof-audio/releases/download/stable/latest.json` |
| 베타 | 정식·시험 버전 중 최신 | `https://github.com/loopix8000/Lof-audio/releases/download/beta/latest.json` |

정식 버전(`1.2.0`)은 두 채널에, 시험 버전(`0.2.0-alpha.1`, `1.0.0-rc.1` 등)은 베타 채널에만 올린다. 이미 더 최신 버전이 올라가 있는 채널은 덮어쓰지 않는다. 채널 릴리즈가 아직 없으면 앱은 업데이트 없음으로 처리한다. 새로 설치한 앱의 기본 채널은 정식이며, 기존에 선택한 채널은 유지된다.

## 처음 한 번: 서명 키 등록

1. 새 체크아웃에서는 `npm ci`로 의존성을 설치한다. 서명 키 생성 스크립트는 저장소에 포함되며, 생성되는 `.private/`의 키 파일은 Git에서 제외된다. 이미 배포 중인 앱은 백업한 기존 키를 복원한다. 최초 배포에 사용할 키가 없을 때만 다음 명령으로 생성한다. 기존 키 파일이 있으면 덮어쓰지 않고 중단하며, 키 내용은 화면에 출력하지 않는다. 비밀키는 별도 장소에 백업한다. 잃어버리면 이미 설치된 앱이 이후 업데이트를 검증하지 못한다.

   ```powershell
   npm run updater:keygen
   ```

2. GitHub 저장소의 Settings > Secrets and variables > Actions에 등록한다.

   | 종류 | 이름 | 값 |
   | --- | --- | --- |
   | Secret | `TAURI_SIGNING_PRIVATE_KEY` | `.private/updater.key` 파일 전체 내용 |
   | Variable | `TAURI_UPDATER_PUBLIC_KEY` | `.private/updater.key.pub` 파일 전체 내용 |

   키를 암호 없이 만들었으므로 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`는 등록하지 않는다.

## 릴리즈할 때

1. `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`의 버전을 함께 올린다. 세 값이 다르면 준비 단계에서 빌드를 중단한다.
2. 필요하면 저장소 루트에 `RELEASE_NOTES.md`를 작성한다. 있으면 릴리즈 본문으로 쓰이고, 앱의 업데이트 안내에도 표시된다.
3. Actions에서 **Build Windows release**를 `main` 브랜치로 수동 실행한다.
   - **Publish the release and matching update channels after building**을 끄면 초안 릴리즈만 만든다. 설치 파일을 직접 받아 확인할 때 쓴다.
   - 켜면 설치 파일의 서명을 공개키로 검증한 뒤 릴리즈를 공개하고 채널의 `latest.json`을 갱신한다.

공개 단계만 다시 실행할 때는 해당 버전의 소스를 체크아웃하고 `GITHUB_REPOSITORY=loopix8000/Lof-audio`, `TAURI_UPDATER_PUBLIC_KEY`를 설정한 뒤 `node .github/scripts/publish-release.mjs`를 실행한다.

## 로컬에서 서명된 설치 파일을 만들 때

```powershell
$env:TAURI_UPDATER_PUBLIC_KEY = Get-Content .private/updater.key.pub -Raw
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .private/updater.key -Raw
npm run updater:prepare
npm run package:nsis -- --config src-tauri/tauri.updater.generated.json
```

생성된 `src-tauri/tauri.updater.generated.json`은 Git에서 제외된다. 이 설정 없이 빌드한 앱(개발 빌드 포함)은 공개키가 없어 업데이트 확인이 비활성화된다.
