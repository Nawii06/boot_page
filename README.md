# 국립한국교통대학교 부트캠프(AI)사업단 파일럿 홈페이지

공개 15개·관리자 13개 화면을 갖춘 **로컬 실행본**입니다. P-10 핵심 동작 검수와 P-11 새 폴더 재현·인계 준비의 결과는 [로컬 검수 결과](docs/LOCAL_ACCEPTANCE.md)와 [진행기록](docs/BUILD_PROGRESS.md)에 구분해 기록합니다. 실제 한컴 HWP/HWPX 원본은 미검증으로 유지하며 전체 최종 완료 판정은 보류합니다. 후속 승인에 따라 로컬 Git `main`을 구성하고 실제 추적 파일·커밋 이력의 제외 검사를 통과했습니다. 외부 배포는 수행하지 않았습니다. 후속 준비는 [Replit 인계](docs/REPLIT_HANDOFF.md), [Cloudflare 인계](docs/CLOUDFLARE_HANDOFF.md)를 따릅니다.

## 실행 환경

- Windows PowerShell 5.1, Node.js **`24.21.0`**, npm **`11.19.0`** 기준. `.node-version`·`package.json`의 engines/packageManager·잠금 파일의 루트 engines가 일치하며 `.npmrc`의 `engine-strict=true`로 다른 버전의 설치를 거부합니다. 검증한 버전을 유지하고 업데이트는 별도 변경·재검으로 다룹니다.
- React + TypeScript + Vite 프런트, Express API, `better-sqlite3` SQLite DB. 정확한 의존성은 `package-lock.json`에 고정합니다. 현재 Windows에서 드라이버 `13.0.3`의 제공 바이너리와 SQLite `3.53.4` 동작을 확인했습니다.
- PowerShell에서는 `npm.cmd`를 사용합니다. 실행 정책을 바꿀 필요가 없습니다.
- 최초 의존성 다운로드에는 인터넷이 필요합니다. 설치 후 빌드/실행은 외부 계정·클라우드 연결·외부 폰트·CDN을 요구하지 않습니다.
- 앱 실행에 Git·Python·Chrome은 필수가 아닙니다. Git은 이력 관리, Chrome은 `test:browser`용입니다. 다른 OS의 네이티브 모듈 설치 성공은 별도로 확인해야 합니다.

## 실데이터 없는 소스 실행본 만들기

현재 프로젝트 루트에서 아래 명령으로 **아직 없는 새 폴더**를 만듭니다. `node_modules`·빌드 결과를 복사하지 않으므로 새 폴더에서 다시 설치합니다. 명령은 기존 파일을 삭제하거나 덮어쓰지 않으며, 같은 출력 이름으로 재실행하면 중단합니다.

```powershell
npm.cmd run source:package -- --output ./.cache/releases/source-local-001
Set-Location -LiteralPath ./.cache/releases/source-local-001
```

이 폴더가 소스 전달본입니다. 코드·설정 예시·잠금 파일·스키마·마이그레이션·명백한 예시 seed·테스트·문서·디자인 자산을 허용 목록으로 복사합니다. `.env`·실제 DB·관리자/세션·업로드·백업·로그·의존성·빌드·`.git`은 포함하지 않습니다. `source-manifest.json`에는 상대 파일명·크기·SHA-256·고정 런타임 버전을 기록합니다. 허용하지 않은 파일·링크·값이 채워진 `.env.example`은 거부합니다. 실패 시 남은 출력은 검토용으로 보존하며 새 이름으로 재시도합니다. 소스나 문서에 사람이 직접 적은 비밀까지 탐지하는 기능은 아니므로 전달 전 내용 검토도 필요합니다.

다른 PC에는 이 폴더만 전달하고 아래 설치 절차부터 수행합니다. 콘텐츠는 **별도 비공개 내보내기 패키지**로 전달하며 소스 폴더에 합치지 않습니다. 기존 작업 폴더 전체를 압축하거나 `var`를 소스에 붙이지 않습니다. 소스에 포함된 `source-manifest.json`은 생성 시점의 확인 목록이므로 설치 후 만들어진 `.env`/`var`를 소스 전달본으로 다시 공유하지 않습니다.

## 최초 설치

VS Code에서 새 소스 폴더를 연 뒤 PowerShell에서 순서대로 실행합니다. 현재 경로가 새 폴더인지 `Get-Location`으로 먼저 확인합니다. 외부 셸에 설정된 `DB_PATH`·`UPLOAD_DIR`·`BACKUP_DIR` 등은 `.env`보다 우선하므로 별도 새 터미널에서 시작하고 기존 자료 경로를 가리키는 설정을 가져오지 않습니다.

```powershell
Get-Location
node --version
npm.cmd --version
npm.cmd ci
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
npm.cmd run db:migrate
npm.cmd run db:status
```

각 명령이 오류로 끝나면 다음 명령을 진행하지 말고 해당 오류를 해결합니다. `.env.example`은 변수명·설명·빈 할당만 포함하며 그대로 복사하면 로컬 기본값을 사용합니다. 실제 설정값은 `.env`에만 기록하고 기존 파일은 덮어쓰지 않습니다. `package-lock.json`은 유지합니다. `npm.cmd ci`는 잠금 파일에 따라 의존성을 설치하며 홈페이지 콘텐츠를 생성/초기화하지 않습니다. `db:migrate`가 명시적으로 DB 파일과 필요한 스키마를 만들며 기존 DB를 지우지 않습니다. npm 캐시는 기본적으로 프로젝트 내부 `.cache/npm`에 저장합니다.

이미 다운로드한 캐시를 재사용할 때만 `npm.cmd ci --cache 'D:/boot_page/.cache/npm'`처럼 실제 캐시 경로를 지정할 수 있습니다. 이 경로는 검증 예시이며 앱 설정에 고정하지 않습니다. 새 PC의 빈 캐시 설치에는 다운로드 연결이 필요합니다. npm의 설치 스크립트 검토 안내가 나오면 `db:migrate`와 `build`가 정상 동작하는지 확인하고 모든 스크립트를 무조건 허용하지 않습니다. 현재 Windows에서는 제공되는 플랫폼 바이너리의 실행을 확인했습니다.

빈 DB로 직접 자료를 작성하려면 seed를 생략하고 다음 관리자 설정으로 진행합니다. 기존 콘텐츠를 가져올 환경이면 **seed와 관리자 생성보다 먼저** 아래 빈 환경 복원을 수행합니다.

예시 데이터가 필요하면 별도로 실행합니다. 필수 실행 명령은 아닙니다.

```powershell
npm.cmd run db:seed
npm.cmd run db:status
```

seed는 제목과 본문에 `[예시]`가 붙은 9건을 넣습니다. 실제 사업정보·연락처·관리자 계정·첨부 원본은 만들지 않습니다. 원래 개발 작업 폴더에는 P-03 검증에서 예시 9건을 적용했습니다. 새 소스 전달본에는 DB가 없으며 마이그레이션만 실행한 새 DB는 비어 있습니다. 재실행하면 중복 생성하지 않습니다.

## 최초 관리자 설정·비밀번호 재설정

앱과 다른 DB 쓰기 작업을 종료한 뒤 VS Code의 **대화형 PowerShell 터미널**에서 실행합니다. `my_admin`은 사용자가 정할 아이디의 예시입니다. 기본 관리자나 기본 비밀번호는 없습니다.

```powershell
npm.cmd run db:migrate
npm.cmd run admin:create -- --username my_admin
```

아이디는 영문·숫자로 시작하는 3~100자의 영문·숫자·점·밑줄·하이픈이며 대소문자를 구분하지 않습니다. 비밀번호는 터미널의 `New password`와 `Confirm password` 질문에 각각 입력합니다. **입력한 글자는 표시되지 않습니다.** 15~128자(UTF-8 최대 512바이트), 공백·유니코드도 그대로 구분합니다. Enter로 확정, Backspace로 한 글자 삭제, Ctrl+U로 비우기, Ctrl+C로 취소합니다. 명령 인수, 환경변수, 채팅에 비밀번호를 넣지 마세요. 입력 파이프나 출력 리다이렉션은 거부합니다.

기존 아이디의 재생성은 거부합니다. 비밀번호를 잊었거나 변경하려면 다음 **명시적 재설정**을 사용합니다.

```powershell
npm.cmd run admin:reset -- --username my_admin
```

재설정도 숨김 입력·재입력 확인을 거치며 해당 관리자의 모든 기존 세션을 무효화합니다. 비활성 계정은 재설정으로 다시 활성화하지 않고 거부합니다. 생성/재설정 직전 SQLite 안전 사본을 `BACKUP_DIR`에 만들고 경로만 출력합니다. 기존 콘텐츠는 변경하지 않습니다. 백업은 비밀번호 해시·세션을 포함할 수 있는 비공개 자료이므로 Git이나 공개 저장소에 넣지 않습니다. 일반 회원가입·학교 SSO·추가 관리자 계정 관리 화면은 없습니다.

원래 개발 작업 폴더에서는 사용자가 최초 관리자 설정을 완료했으며 등록·활성 상태를 확인했습니다(2026-10-14). 새 환경에서는 위 명령으로 직접 설정합니다. 기본 비밀번호는 제공하지 않습니다. 자동 검증은 별도 시험 DB와 실행 중 생성한 임시 비밀번호를 사용합니다.

## 개발 실행

```powershell
npm.cmd run dev
```

- 공개 홈: <http://127.0.0.1:5173/>
- 관리자 로그인: <http://127.0.0.1:5173/admin/login>
- 로그인 후 관리 홈: <http://127.0.0.1:5173/admin>
- 공지 관리: <http://127.0.0.1:5173/admin/notices> / 공개 공지: <http://127.0.0.1:5173/notices>
- 공개 사업소개: <http://127.0.0.1:5173/about/overview> / 참여 안내: <http://127.0.0.1:5173/programs/guide> / FAQ: <http://127.0.0.1:5173/faq>
- 교육과정: <http://127.0.0.1:5173/programs/curriculum> / 프로그램: <http://127.0.0.1:5173/programs/activities> / 서식: <http://127.0.0.1:5173/resources>
- API 상태: <http://127.0.0.1:3000/api/health>
- 개발 프런트의 `/api` 요청은 API 서버로 전달됩니다.
- React/CSS 변경은 Vite에서 반영됩니다. API 소스나 환경설정 변경 후에는 종료하고 다시 실행합니다.
- **종료:** 실행 중인 터미널에서 `Ctrl+C`. 프런트와 API 자식 프로세스를 함께 종료합니다.
- 다른 프로그램이 포트를 사용 중이면 자동으로 다른 포트로 바꾸지 않고 오류로 종료합니다. 해당 프로그램을 임의 종료하지 말고 포트 설정을 조정하세요.
- DB가 없거나 마이그레이션이 적용되지 않았으면 시작을 거부합니다. 서버 시작으로 DB 생성·초기화·마이그레이션·seed를 자동 실행하지 않습니다. 터미널 안내에 따라 서버 종료 상태에서 `npm.cmd run db:migrate`를 실행하세요.

## 빌드 및 빌드본 실행

개발 서버를 종료한 뒤 실행합니다.

```powershell
npm.cmd run build
npm.cmd start
```

빌드는 타입 검사, 프런트 번들, 서버 컴파일 순서로 수행합니다. 실행 주소는 <http://127.0.0.1:3000/>이며 관리자 로그인은 `/admin/login`입니다. 빌드본은 Express 하나가 `dist/client`와 API를 제공합니다. 미인증 `/admin` 경로는 로그인으로 이동하며, 로그인 후 직접 주소 접속과 새로고침을 지원합니다. 종료는 `Ctrl+C`입니다. `npm.cmd start` 전에 빌드가 없으면 명확한 오류를 표시합니다.

### 새 폴더에서 자료 등록·유지 확인

1. 빌드본 실행 후 `/admin/login`에서 방금 만든 관리자로 로그인합니다.
2. 공지 관리에서 `[예시] 설치 확인`처럼 명백한 시험 제목·본문을 입력하고 개인정보 없는 정상 PDF 원본을 첨부한 뒤 **공개**로 저장합니다.
3. 별도 비로그인 브라우저에서 `/notices`와 상세 주소를 열어 본문·한글 파일명·원본 다운로드를 확인합니다. 교육·서식도 각 관리 메뉴에서 저장하고 관련 콘텐츠를 ID로 연결합니다.
4. 실행 터미널에서 `Ctrl+C`로 종료하고 `npm.cmd start`로 다시 실행합니다. 같은 상세 주소의 본문·관련 링크·원본 파일이 유지되는지 확인합니다.
5. 아래 내보내기·별도 새 환경 복원 절차를 수행하고 새 관리자로 편집·공개 다운로드까지 확인합니다. 검사 중 기존 실제 작업 DB를 시험용으로 사용하지 않습니다.

### 재현 가능한 자동 검증

```powershell
npm.cmd run typecheck
npm.cmd test
```

테스트는 격리된 `.cache/tests`의 실제 SQLite·저장 폴더와 무작위 임시 관리자를 사용합니다. DB 영속성·무결성·seed·마이그레이션, 비밀번호·세션·권한·CSRF에 더해 모든 콘텐츠 종류의 저장/수정/삭제, 고정 페이지와 메인 설정의 원자적 저장, 파일 업로드/다운로드·교체·공유 참조, 실패 복구, HTML 정화 및 실제 서버 프로세스 재시작을 검사합니다. 기본 DB와 사용자의 계정을 변경하지 않습니다. PDF/OpenXML DOCX/이미지는 생성한 시험 원본을 사용하고, HWP/HWPX 합성 구조 시험은 검사 코드 확인용이며 한컴 작성 원본의 호환성 증거가 아닙니다. 실제 실행 결과와 검증 범위는 [진행기록](docs/BUILD_PROGRESS.md)에 기록합니다.

설치된 Google Chrome을 이용한 브라우저 검수는 `npm.cmd run build` 후 수행합니다. 시험이 별도 DB·임시 관리자·임의 포트의 서버를 실행하고 종료하므로 실제 관리자 설정이나 앱 서버 기동이 필요하지 않습니다. 개인 Chrome 프로필과 분리된 임시 테스트 프로필을 사용합니다.

```powershell
npm.cmd run test:browser
```

1440×1000, 390×844, 320×800에서 전체 화면의 직접 접속·새로고침, 메뉴·키보드, 로그인·로그아웃·보호 경로, 로딩/실패/재시도, 가로 넘침 및 외부 HTTP 요청 여부를 검사합니다. 공지·교육/프로그램·서식·FAQ·고정 안내·메인의 작성/재열기, 미리보기·ID 연결·파일 교체·비공개 전환·삭제와 저장 실패·중복 클릭·수정 충돌도 확인합니다. P-07 공개 안내 6개 화면은 관리자 변경 반영·빈 안내·비공개 제외·공통 문의처, FAQ의 키보드 열람·검색·페이지 이동·개별 주소까지 검사합니다. 각 시나리오는 별도 DB·계정을 사용합니다. 인증 시험의 trace와 자동 실패 스크린샷은 비밀번호 기록을 피하도록 끄고 안전한 화면만 명시적으로 캡처합니다. 결과는 `.cache/browser-results`에 저장됩니다. Chrome이 없는 PC에서는 Chrome 설치 후 검수합니다. 앱 실행 자체에는 Chrome이 필수가 아닙니다.

P-08 최종 실행 결과는 빌드 통과, 서버 시험 **73/73**, Chrome 시험 **66/66**입니다. 메인 → 교육 상세 → 공지 → 서식 → 한글 PDF 원본 다운로드, 관리자 변경 반영·주소 유지·비공개 제외·모바일 표시를 확인했습니다. 별도 Vite 개발 환경에서도 같은 흐름과 긴 메인 소개/선정 항목의 키보드 열람을 검증했습니다. 실제 DB·`my_admin` 계정과 기존 파일을 보존했으며 상세 증거는 [진행기록](docs/BUILD_PROGRESS.md)의 P-08 절을 따릅니다.

P-09 최종 실행은 **빌드 통과, 서버/DB/이관 시험 122/122 통과**입니다. 별도 환경에서 13개 콘텐츠·9개 논리 테이블·4개 원본의 일치, 새 관리자 설정/재설정·편집·다운로드·재시작, 오류/강제 종료 중 불완전 복원 차단을 확인했습니다. 실제 작업 DB도 콘텐츠 9건을 별도 빈 경로에 CLI로 복원해 일치와 인증 정보 제외를 확인했고 원본 DB·계정은 보존했습니다. UI 코드를 변경하지 않아 P-08의 브라우저 66건은 이번 단계에서 재실행하지 않았습니다.

P-10 검수 결과는 빌드 통과, 기존 서버 **122/122** 및 추가 오류 복구 **3/3** 통과, 브라우저 **69개 고유 사례 최종 통과**입니다. 브라우저 최초 실행의 새 검사 스크롤 오류를 보완한 뒤 해당 3개 폭만 재검했습니다. PC/모바일 실제 렌더링, 28개 화면과 동작, 기존 자료 보존, Git 제외 규칙 39건을 확인했습니다. 실제 저장소가 없어 Git index/history는 미검증이며 한컴 원본 호환성도 미검증입니다. 실행별 결과·화면 대응·남은 확인은 [LOCAL_ACCEPTANCE](docs/LOCAL_ACCEPTANCE.md)에 기록합니다.

P-11은 새 소스 폴더 두 곳에서 설치·빌드, 실제 TTY 관리자 생성/재설정, 3종 자료 등록·공개·한글 PDF 다운로드·재시작, 별도 복원 후 편집을 재현했습니다. 관리자 명령 종료 결함을 수정하고 실제 자연 종료를 확인했습니다. 소스 전달본은 `.cache/releases/source-handoff-p11-20261015/`, 현재 로컬 콘텐츠 보존본은 `var/backups/content-handoff-p11-20261015/`입니다. 캐시를 사용한 설치와 시험 PID 종료 후 재시작을 검증했으며 빈 캐시·다른 PC·실제 키보드 Ctrl+C 검증은 구분합니다. 명령·근거·남은 확인은 [진행기록 P-11](docs/BUILD_PROGRESS.md)을 따릅니다.

## 환경설정

설정 파일 없이 기본값으로 실행할 수 있습니다. 변경이 필요하면 `.env.example`을 참고해 프로젝트 루트에 `.env`를 만듭니다. 기존 `.env`는 덮어쓰지 않습니다. **이 프로젝트는 `.env` 하나만 읽으며 `.env.local`/`.env.development`는 사용하지 않습니다.** 셸에서 지정한 환경변수가 `.env`보다 우선합니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `HOST` | `127.0.0.1` | 프런트/API 바인딩 |
| `PORT` | `3000` | API 및 빌드본 포트 |
| `DEV_PORT` | `5173` | 개발 프런트 포트. PORT와 다른 값 사용 |
| `ALLOW_NETWORK` | `false` | 루프백 외 바인딩을 명시적으로 허용할 때만 true |
| `DB_PATH` | `./var/db/bootcamp.sqlite` | 실제 DB 파일. `.sqlite`, `.sqlite3`, `.db` 확장자 사용 |
| `UPLOAD_DIR` | `./var/uploads` | 정적 공개 영역 밖의 실제 첨부 원본 저장 경로 |
| `BACKUP_DIR` | `./var/backups` | DB 변경 전 안전 사본 저장 경로 |
| `MAX_UPLOAD_MB` | `20` | 파일당 최대 MiB, 1~100 정수 |
| `MAX_STORAGE_MB` | `512` | 저장소 전체 최대 MiB, 1~102400 정수. 미연결·잔여 파일도 포함 |
| `MAX_ZIP_EXPANDED_MB` | `100` | DOCX/HWPX 압축 해제 합계 최대 MiB, 1~500 정수 |
| `MAX_IMAGE_PIXELS` | `20000000` | 이미지 최대 픽셀 수, 1~40000000 정수 |
| `MAX_FILES_PER_CONTENT` | `20` | 콘텐츠당 고유 파일 최대 개수, 1~100 정수. 본문·메인 이미지 포함 |
| `APP_ORIGIN` | 루프백 주소의 PORT·DEV_PORT 출처 | 정확한 브라우저 출처 1개. 경로·끝 슬래시 제외. 비우면 localhost/127.0.0.1/[::1]의 두 포트만 허용 |
| `COOKIE_SECURE` | `false` | 로컬 HTTP는 false. HTTPS는 true + HTTPS APP_ORIGIN 필수 |
| `SESSION_TTL_SECONDS` | `28800` | 로그인부터 절대 만료(8시간), 허용 범위 300~86400초 |

포트 변경 예:

```dotenv
PORT=3001
DEV_PORT=5174
```

외부 공유용 바인딩은 `HOST=0.0.0.0`, `ALLOW_NETWORK=true`로 별도 허용합니다. 관리자 인증을 외부에서 사용하려면 HTTPS를 제공하는 환경과 해당 `APP_ORIGIN`, `COOKIE_SECURE=true`가 필요합니다. 비루프백 HTTP 출처는 거부합니다. Express 자체의 TLS 설정/외부 배포는 이번 범위에 없습니다. 개발 프런트와 API는 `/api` 프록시로 동일 출처를 사용합니다. 임의 Host/Forwarded 헤더를 신뢰해 출처나 클라이언트 IP를 변경하지 않습니다.

데이터 상대 경로는 프로젝트 루트를 기준으로 해석하며 절대경로도 설정할 수 있습니다. 소스·빌드·정적 공개·의존성 디렉터리 아래에는 데이터를 둘 수 없습니다. 심볼릭 링크의 실제 대상도 검사합니다. 파일 연결에는 개인 PC 절대경로나 공개 URL 대신 파일 ID와 상대 저장키를 사용합니다. 경로를 바꾸어도 기존 데이터를 자동 이동·복사하지 않습니다. 현재 설정에 사용되지 않는 비밀값이나 관리자 비밀번호를 넣지 않습니다.

## DB 변경과 예시 정책

- 스키마는 `migrations/001_initial.sql`부터 번호 순서로 적용하며 `schema_migrations`에 파일명·SHA-256·적용일을 기록합니다. 이미 적용한 SQL은 수정하지 말고 다음 번호의 파일을 추가합니다. 이력 불일치·누락·알 수 없는 DB는 변경하지 않고 종료합니다.
- DB 작업 전 앱과 다른 DB 쓰기 작업을 종료합니다. 대기 마이그레이션이 있는 기존 DB는 SQLite 백업 API로 일관된 사본을 만든 뒤 경로를 출력하고 변경합니다. 대기 작업 전체를 한 트랜잭션으로 실행해 실패하면 롤백합니다. 현재 버전 재실행은 변경하지 않습니다. 데이터 삭제/reset/down 명령은 없습니다.
- `db:seed`는 `seed/example-contents.json`의 고정 ID와 `seed_runs` 적용 이력을 사용합니다. 적용한 seed 재실행은 수정·삭제된 예시나 연결을 복원하지 않습니다. 같은 key의 파일 내용 변경은 거부하며 Windows의 CRLF/LF 차이는 무시합니다.
- 최초 seed에서 같은 ID·종류·slug의 기존 콘텐츠는 그대로 두고, 다른 콘텐츠와의 ID/slug 충돌은 전체 작업을 거부합니다. 기존 내용이 있는 DB에 아직 적용하지 않은 seed를 넣기 전에는 안전 사본을 만듭니다. seed 파일을 편집해 기존 콘텐츠를 갱신하는 용도로 사용하지 않습니다.
- DB 사본은 스키마/seed/계정 작업을 위한 로컬 안전 장치입니다. 계정·세션이 들어갈 수 있으므로 아래 콘텐츠 이관 패키지와 구분합니다.

## 콘텐츠 내보내기·빈 환경 복원

관리자 메뉴를 추가하지 않고 로컬 명령을 사용합니다. 원본 환경의 `DB_PATH`와 `UPLOAD_DIR` 설정을 읽습니다. 작업 중 관리자 편집을 멈추고 실행하세요. 내보내기는 SQLite 쓰기 잠금을 확보한 동안 논리 데이터와 등록된 원본을 함께 읽습니다. 서버가 실행 중이어도 이 앱의 DB·파일 변경은 잠금 해제까지 대기하거나 실패하므로 편집 요청은 내보내기 종료 후 다시 시도합니다. 실행 중인 `.sqlite` 파일만 복사하지 않습니다. 파일 탐색기·외부 스크립트로 저장소를 직접 바꾸지 마세요.

```powershell
npm.cmd run content:export -- --output ./var/backups/content-p09
```

출력 폴더는 **아직 없어야** 합니다. 같은 이름으로 재실행하면 충돌로 중단하며, 다음 백업에는 새 폴더명을 지정합니다. 이 패키지는 초안·비공개 콘텐츠·문의처·미연결 업로드도 포함하므로 기본 `var/backups` 등 Git 제외 영역에 보관합니다. 환경변수·비밀키·관리자 계정/비밀번호 해시·세션·로그인 제한 정보는 내보내지 않습니다. 미등록 잔여 파일과 로컬 SQLite 사본도 포함하지 않습니다.

복원은 앱을 종료한 **별도 빈 환경**을 지정합니다. `--db`와 `--uploads`는 필수이며 기본 DB로 암묵적으로 복원하지 않습니다. 아래는 원본과 다른 경로의 예시입니다. `db:seed`를 실행하지 마세요.

```powershell
npm.cmd run content:import -- --input ./var/backups/content-p09 --db ./var/restore-p09/db/bootcamp.sqlite --uploads ./var/restore-p09/uploads
```

새 DB 또는 현재 스키마만 준비된 완전히 빈 DB, 새 폴더 또는 빈 업로드 폴더만 받습니다. 관리자·세션·seed 이력도 기존 자료로 취급합니다. 충돌 시 덮어쓰기/병합/초기화하지 않으므로 기존 대상을 지우기보다 다른 빈 경로를 지정하세요. 성공한 복원에 같은 명령을 반복하면 충돌로 중단합니다.

패키지 전체의 형식·버전·관계·첨부를 임시 영역에서 검사한 뒤 파일과 DB를 반영합니다. 기존 빈 DB에는 파일을 준비한 뒤 하나의 DB 트랜잭션으로 전체 행을 확정합니다. 새 DB는 WAL이 정리된 완성 사본을 같은 파일시스템의 하드 링크로 원자적으로 연결하며 기존 파일을 대체하지 않습니다. ID·slug·저장키·본문·게시 여부·작성/수정일·revision을 유지하므로 절대경로가 달라져도 내부 주소와 다운로드 연결이 복원됩니다. 실패는 종료 코드 1이며 성공 메시지가 출력되지 않습니다. 강제 종료 시 임시/미연결 파일이 남을 수 있으나 불완전한 콘텐츠를 공개하지 않으며, 잔여 파일이 있는 대상은 재실행 시 충돌로 보호합니다. 자동 삭제·덮어쓰기 옵션은 없습니다.

복원된 환경의 관리자는 별도로 설정합니다. **새 PowerShell 터미널**에서 아래 경로를 지정한 뒤 기존 숨김 입력 절차를 사용합니다. 이 터미널을 닫으면 원래 터미널의 설정에는 영향이 없습니다.

```powershell
$env:DB_PATH = './var/restore-p09/db/bootcamp.sqlite'
$env:UPLOAD_DIR = './var/restore-p09/uploads'
$env:BACKUP_DIR = './var/restore-p09/backups'
npm.cmd run db:status
npm.cmd run admin:create -- --username my_admin
npm.cmd run dev
```

비밀번호는 프롬프트에서 숨김 입력하며 채팅·인수·환경변수에 넣지 않습니다. 복원 전에 사용하던 관리자·로그인은 이관되지 않습니다. 새 환경에서 생성한 계정의 비밀번호를 나중에 바꾸려면 `npm.cmd run admin:reset -- --username my_admin`을 사용합니다. 공개 내용·관련 링크·원본 다운로드와 로그인 후 수정/재조회까지 확인한 다음 이 복원 환경을 사용합니다. 원본 환경과 동시에 실행하려면 서로 다른 PORT/DEV_PORT를 명시하세요.

### 다른 소스 작업 폴더로 복원하는 순서

앞의 명령은 같은 소스에서 다른 DB 경로를 사용하는 예입니다. 소스까지 분리하려면 원본 앱을 `Ctrl+C`로 종료하고 **원본 소스 폴더**에서 다음을 실행합니다. 이미 사용한 출력 이름은 새 이름으로 바꾸며, 복원 성공 전 원본 자료를 삭제하지 않습니다.

```powershell
npm.cmd run content:export -- --output ./var/backups/content-handoff-001
$contentPackage = (Resolve-Path -LiteralPath ./var/backups/content-handoff-001).Path
npm.cmd run source:package -- --output ./.cache/releases/restored-local-001
Set-Location -LiteralPath ./.cache/releases/restored-local-001
npm.cmd ci
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
npm.cmd run content:import -- --input "$contentPackage" --db ./var/db/bootcamp.sqlite --uploads ./var/uploads
npm.cmd run db:status
npm.cmd run admin:create -- --username my_admin
npm.cmd run build
npm.cmd start
```

이 명령은 기본 경로를 쓰는 **새 터미널**을 전제로 합니다. 앞 절에서 `$env:DB_PATH` 등을 변경한 터미널은 닫고 새로 여세요. `content:import`가 새 DB에 현재 스키마를 구성하므로 먼저 seed나 계정을 넣지 않습니다. 다른 PC에서는 비공개 콘텐츠 패키지를 별도로 전달하고 `$contentPackage`를 그 실제 경로로 지정합니다. 예를 들어 `$contentPackage = (Resolve-Path -LiteralPath 'E:/handoff/content-handoff-001').Path`처럼 사용하며 해당 경로는 예시입니다. 기본 포트가 같으므로 원본과 복원 앱은 순서대로 실행합니다.

복원 후 관리자 로그인·기존 본문/관련 링크·한글 원본 다운로드를 확인하고 한 건 수정하여 공개 화면에 반영되는지 확인합니다. `Ctrl+C`로 종료했다가 다시 `npm.cmd start`하여 수정 내용·첨부가 유지되는지도 확인합니다. 콘텐츠 패키지와 새 계정 DB의 보관 위치는 공개 GitHub와 분리합니다.

### 이관 패키지 형식 v1

압축 SQL 덤프가 아닌 UTF-8 JSON과 원본 파일 디렉터리입니다. 실행할 SQL·스크립트·절대경로를 패키지에서 받지 않습니다.

```text
content-p09/
  manifest.json
  files/
    <상대 storage_key 그대로의 원본 파일>
```

| manifest 항목 | 의미 |
|---|---|
| `format`, `formatVersion` | `bootcamp-content`, 정수 `1` |
| `schemaVersion` | 현재 `002`; 알 수 없는 버전은 거부 |
| `migrations` | `version`, `filename`, SQL 내용 SHA-256인 `checksum`. 대상 코드의 마이그레이션과 일치해야 함 |
| `exportedAt` | 내보내기 시각(ISO 형식) |
| `tables` | 아래 9개 배열. 알 수 없는 테이블/열은 거부하며 인증 정보가 들어갈 수 없음 |

행의 열 이름과 자료형은 [001 스키마](migrations/001_initial.sql)의 해당 테이블을 따릅니다. 문자열·정수·null 값을 유지하며 boolean 필드는 SQLite와 같은 정수 0/1입니다. 각 행의 모든 열을 기록하고 순서는 연결의 `sort_order`로 보존합니다.

| 배열 | 포함 내용 |
|---|---|
| `contents` | 모든 종류의 콘텐츠·고정 안내·메인 문안, ID/slug/제목/본문/분류/게시 여부/날짜/revision |
| `program_details`, `resource_details`, `contact_details` | 교육/프로그램 세부 정보, 서식 작성/제출 안내, 문의처 |
| `content_relations`, `content_links` | 내부 ID 관계·정렬, 외부 링크 ID/라벨/URL·정렬 |
| `home_items` | 메인 영역별 선정 콘텐츠 ID·정렬 |
| `files` | 파일 ID·상대 저장키·한글 원본명·MIME·확장자·바이트 크기·SHA-256·생성일 |
| `content_files` | 콘텐츠/파일 ID·attachment/body/home 역할·정렬·이미지 대체문구 |

원본의 위치는 `files/<storage_key>`이며 파일마다 `size`와 `sha256`을 대조합니다. 절대경로·상위 경로 이동·심볼릭 링크/접합점·Windows 예약명·대소문자 경로 충돌·중복 ID·잘못된 참조·누락/변조 파일·잘못된 스키마를 거부합니다. 등록된 파일 이외의 추가 파일도 받지 않습니다. 해시는 손상 검사이며 발행자 전자서명이 아닙니다. 패키지 형식은 애플리케이션 계약이며 SQLite나 D1의 직접 가져오기 형식은 아닙니다.

현재 한도는 manifest 64MiB, 전체 행 합계 100,000개, 파일 20,000개, 저장키 240자/8단계입니다. 파일 크기·총량은 복원 환경의 `MAX_UPLOAD_MB`·`MAX_STORAGE_MB`를 따르며 실제 형식 검사에도 기존 ZIP/이미지 제한을 적용합니다. 이전 환경보다 한도가 낮으면 복원이 거부될 수 있으므로 환경설정을 비교하세요. 본문을 임의 정화해 다른 내용으로 복원하지 않으며 현재 편집기의 안전한 저장 형식과 다르면 거부합니다. 이전 DB의 해당 본문을 관리자 편집기에서 확인·저장한 후 새 패키지로 내보내세요.

### 향후 D1·R2 이전 시 확인할 사항

- 논리 JSON을 D1용 접근 모듈과 이관 명령으로 변환하고 별도 시험 DB에서 검증합니다. 현재 `.sqlite` 파일이나 로컬 덤프가 그대로 들어간다고 가정하지 않습니다. 로컬 BEGIN/COMMIT·WAL/파일시스템 PRAGMA는 대상 실행 방식에 맞게 처리합니다. [D1 가져오기·내보내기](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- `STRICT`, CHECK, 트리거, UNIQUE/외래키, NOCASE, GLOB, 인덱스 및 null/정수/날짜 문자열의 동작을 확인합니다. 부모→자식 삽입 순서와 외래키 검증, 일괄 실행 실패 시 롤백도 재검증합니다. [D1 SQL](https://developers.cloudflare.com/d1/sql-api/sql-statements/) · [외래키](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- SQL 크기·바인딩 수·행/문자열 크기·LIKE/GLOB 검색 패턴 등 당시 D1 제한을 확인하고 긴 본문·한글 검색·대량 이관을 시험합니다. [D1 제한](https://developers.cloudflare.com/d1/platform/limits/)
- `better-sqlite3`와 로컬 fs 의존을 Workers/D1/R2 어댑터로 교체합니다. 콘텐츠 ID·파일 ID·저장키와 공개/비공개 다운로드 정책은 유지합니다. DB와 객체 저장소를 함께 전환하기 전에 건수·본문·관계·해시를 대조하고 실패 시 공개하지 않는 절차를 별도로 구현합니다. 이 단계에서 D1/R2 실제 배포·호환 시험은 수행하지 않습니다.

DB 조회를 직접 확인하려면 앱 실행 중 다른 PowerShell 터미널에서 다음 명령을 실행합니다.

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/health' | ConvertTo-Json -Depth 5
Invoke-RestMethod 'http://127.0.0.1:3000/api/public/contents?kind=notice' | ConvertTo-Json -Depth 8
```

공개 조회 경로는 `/api/public/contents`, `/api/public/contents/:id`, `/api/public/pages/:slug`, `/api/public/programs/:kind/:slug`, `/api/public/home`, `/api/public/notice-categories`, `/api/public/content-categories?kind=콘텐츠종류`입니다. 초안·비공개 본문과 관련 대상·메인 노출·분류는 제외합니다. 파일 저장키·해시·관리자/세션 자료는 공개하지 않습니다. 원본은 `/api/files/:fileId?contentId=:contentId`에서 실제 연결·게시 여부를 확인한 뒤 제공합니다.

## 메인·교육·프로그램·서식과 주소 정책

메인은 공통 상단 → 핵심 소개 → 주요·최근 공지 → 교육·프로그램 → 서식·바로가기 → 공통 하단 순서입니다. ‘내 전공에 AI를 더하다’ 문구와 AI 연결 그래픽은 공통 디자인이며, 실제 소개 제목·본문·이미지·주요 안내·노출 콘텐츠는 **관리자 메인 화면 관리(ADM-12)**에서 공개 저장한 설정을 사용합니다. 최근 공지는 공개 공지에서 조회하고 주요 공지와 중복된 항목을 제외합니다. 선택한 콘텐츠가 없으면 빈 안내와 전체 목록 링크를 제공합니다. 본문을 복사해 메인용 게시물을 만들 필요가 없습니다. 긴 소개와 각 영역의 다섯 번째 이후 선정 항목은 키보드로도 펼쳐 읽을 수 있고 상단 서식 바로가기는 계속 제공합니다.

| 공개 목록 | 상세 주소 | 관리자 입력 |
|---|---|---|
| `/programs/curriculum` | `/programs/curriculum/:slug` | 교육·프로그램의 교육과정: 수준·대상·운영 방식·이수요건·본문 |
| `/programs/activities` | `/programs/activities/:slug` | 교육·프로그램의 비교과·산학 프로그램: 유형·대상·운영 방식·이수요건·본문 |
| `/resources` | `/resources/:post` | 서식: 적용 대상·제출서류·작성 안내·기한/방법/제출처·문의처·적용 연도·원본 파일 |
| `/notices` | `/notices/:post` | 공지: 본문·게시일·문의처·파일·관련 콘텐츠 |

교육·프로그램 목록은 저장된 수준/유형별로 묶고 서식 목록은 분류·제목·수정일을 표시합니다. 검색·분류·페이지 이동 조건은 주소에 남아 새로고침 후에도 유지됩니다. 일정은 안내용이며 진행/모집 상태 배지나 날짜에 따른 자동 전환은 없습니다. 파일이 없으면 ‘등록된 첨부파일이 없습니다’를 표시합니다. 잘못된 주소·비공개/삭제 콘텐츠와 서버 조회 실패를 구분하고 실패 시 재시도를 제공합니다.

`ID`는 변경하지 않는 UUID로 관계·파일 연결에 사용합니다. 공지·서식 주소의 `:post`도 이 ID입니다. 교육·프로그램의 `slug`는 최초 관리자 등록 시 서버가 자동 생성하며 기존 예시의 slug는 그대로 유지합니다. **제목을 수정해도 ID·slug·상세 주소는 바뀌지 않습니다.** 고정 안내·관리자 경로도 유지하며 임의로 새 주소나 리다이렉트를 만들지 않습니다.

교육·공지·서식을 각각 저장한 뒤 편집기의 **관련 콘텐츠**에서 대상 항목을 검색·선택하고 다시 저장합니다. 교육에 공지, 공지에 서식을 선택하면 메인 → 교육 상세 → 공지 → 서식 → 원본 다운로드로 이어집니다. 반대 방향 안내도 필요하면 대상 편집기에서 상대 콘텐츠를 선택합니다. 역방향 링크가 자동 생성되지는 않습니다. 비공개·삭제된 대상은 공개 관련 링크에서 제외되며 제목 수정은 ID 연결을 손상하지 않습니다. 메인 노출도 기존 콘텐츠를 ID로 선택합니다.

이미지 없이도 소개 문안·교육/서식 안내·연결 링크를 텍스트로 읽을 수 있습니다. 실제 자료가 없는 곳은 입력 대기로 남기며 예시를 공식 정보로 바꾸지 않습니다. 실행 중 관리자에서 공개 저장한 뒤 공개 화면을 새로고침하거나 재방문하면 코드 수정 없이 반영됩니다.

## 공개 안내 6개 화면

관리자에서 **공개**로 저장한 내용을 다음 주소에서 읽습니다. 변경 후 공개 페이지를 새로고침하거나 다시 방문하면 저장된 내용이 반영됩니다. 초안·비공개와 미등록 정보는 공개 본문·문의처·파일·관련 링크로 노출하지 않습니다. 해당 정보가 없으면 입력 대기 안내를 표시합니다.

| 공개 주소 | 관리자 입력 위치 | 본문 구성 안내 |
|---|---|---|
| `/about/overview` | 사업단 기본정보 → 사업소개 | 목적·교육 분야·추진내용 |
| `/about/organization` | 사업단 기본정보 → 조직 및 담당업무 | 조직도·담당업무·문의처. 조직도는 확인된 이미지와 설명 또는 표/목록으로 작성 |
| `/about/cooperation` | 사업단 기본정보 → 기업 협력 안내 | 협력 분야·참여 방식·문의 절차 |
| `/about/location` | 사업단 기본정보 → 위치 및 문의처 | 확정된 주소·방문 안내·문의처 |
| `/programs/guide` | 참여 및 신청 안내 | 공통 절차·기존 신청 경로·제출 유의사항, 관련 공지·서식 ID |
| `/faq` | 질문·답변 | 질문·답변·표시 순서·관련 링크 |

본문의 제목·문단·목록·표·이미지는 저장된 내용을 표시합니다. 예시로 등록한 자료의 `[예시]` 표시를 유지하고 제공되지 않은 사업정보를 사실로 바꾸지 않습니다. 제목/본문이 없는 페이지를 예시 자료로 자동 채우지 않습니다.

공통 하단 문의처는 **공개된 위치 및 문의처 페이지의 문의처 필드**에서 읽습니다. 위치 페이지를 초안/비공개로 바꾸면 하단에도 그 연락처를 노출하지 않습니다. 외부 지도를 자동으로 불러오지 않아 외부 지도 서비스에 접속할 수 없어도 주소와 방문 안내를 읽을 수 있습니다. 지도 주소가 확인된 경우에만 관리자가 외부 링크로 등록합니다.

FAQ는 표시 순서대로 10건씩 보여 주며 검색·페이지 이동과 `/faq?item=질문ID` 직접 열람을 지원합니다. 질문에 키보드 포커스를 둔 뒤 Enter 또는 Space로 답변을 열고 닫을 수 있습니다. 화면 재방문·탭 복귀·답변 재열기 때 공개 여부를 다시 확인하고 실패하면 재시도 버튼을 제공합니다. 자체 접수폼·학생 계정은 없으며 신청은 관리자가 확인한 기존 신청 경로를 안내합니다. 관련 교육·공지·서식도 공개된 실제 상세 화면으로 연결합니다.

## 공지 작성과 파일 사용

1. `/admin/login`에서 로그인하고 **공지 관리 → 새 공지 등록**으로 이동합니다. 제목·분류·본문·게시일·문의처·상단 고정·게시 여부를 입력합니다. 게시일은 안내용이며 날짜에 따른 자동 공개는 없습니다.
2. 본문은 HTML 입력과 문단·목록·표·링크 삽입 도구를 제공합니다. **본문 이미지**로 업로드한 이미지에는 설명을 입력할 수 있습니다. **미리보기**는 서버에서 정화한 결과를 표시하며 저장·공개 작업은 아닙니다. 외부 이미지·data URL·SVG·스크립트·이벤트·임의 CSS는 허용하지 않습니다.
3. 첨부파일을 선택해 업로드하고 **저장**합니다. 업로드만 한 파일은 관리자 전용 미연결 파일입니다. 공지를 `공개`로 저장하면 `/notices`와 상세 화면에서 로그인 없이 열람·원본 다운로드가 가능합니다. `초안`/`비공개`는 관리자 편집 화면에서 확인합니다.
4. 파일 **교체**는 새 원본을 업로드한 뒤 공지를 저장해야 반영됩니다. **연결 해제**도 저장 후 반영됩니다. 저장 실패 시 기존 DB 연결은 유지되고 입력 내용을 다시 확인할 수 있습니다. 교체 전 파일을 다른 콘텐츠가 참조하면 그 원본은 보존합니다.
5. 공지 삭제 전 관련 링크·메인 연결·공유 파일 영향을 표시합니다. 삭제는 공지와 해당 연결을 제거하며 원본은 자동 삭제하지 않습니다. 편집 화면의 **미연결 파일 정리**에서 참조가 없는 파일만 명시적으로 삭제할 수 있습니다. 목록은 한 번에 최대 100건입니다. 작성 취소·저장 실패로 남은 파일도 이곳에서 정리합니다.

수정은 `revision`을 검사해 오래된 화면이 최신 내용을 덮어쓰지 못하게 합니다. 충돌 안내가 나오면 최신 내용을 확인한 뒤 다시 편집하세요. 업로드는 관리자·Origin·CSRF 검사 후 한 요청에 한 파일, 저장소별 동시 2개, 관리자별 1분 30회로 제한합니다. 요청 시간·바이트·저장소 총량도 제한합니다. 업로드 원본은 변환하거나 실행하지 않고 보존합니다.

| 허용 파일 | 내용 검사 범위 |
|---|---|
| `.pdf` | PDF 헤더·객체·종료·startxref 등 기본 구조 확인. 완전한 PDF 구문/렌더링 검증은 아님 |
| `.docx` | ZIP 경로·CRC·압축 해제 크기, 필수 OpenXML 항목·XML 구문 확인 |
| `.hwpx` | ZIP·XML 검사와 HWPX mimetype·version·Contents의 필수 항목 확인. **실제 한컴 작성 원본은 미검증** |
| `.hwp` | HWP 5.x CFB 서명·FileHeader·DocInfo·BodyText, 비암호화 여부. 파서 실행 시간 5초·worker 메모리 제한. **실제 한컴 작성 원본은 미검증** |
| `.jpg`, `.jpeg`, `.png`, `.webp` | 실제 포맷과 확장자 일치, 단일 이미지 전체 디코딩·픽셀 수 확인 |

브라우저가 보낸 MIME만으로 판단하지 않아 `application/octet-stream` 같은 비표준 MIME의 정상 구조도 받습니다. ZIP은 최대 2,000개 항목·설정된 해제 총량·압축률 한도(1MiB 초과 항목 1,000배)를 적용하고 경로 조작·암호화·XML DTD를 거부합니다. ZIP 안의 특정 실행 확장자(`exe/dll/js/vbs/ps1/bat/cmd`)와 `vbaProject.bin` 항목도 거부하지만 모든 실행 파일·매크로를 탐지하는 것은 아닙니다. 암호 설정 HWP·암호화 ZIP·구형 HWP·허용 목록 밖 형식은 지원하지 않으며 PDF 암호화 여부는 검사하지 않습니다. **내용 검사는 악성코드 완전 탐지가 아닙니다.**

원본 파일명은 한글 다운로드명으로 보존하고 실제 저장명은 고유키로 만듭니다. 파일은 `public` 밖에 두며 직접 경로로 공개하지 않습니다. 다운로드·본문 이미지 응답은 `private, no-store, max-age=0`·`nosniff`를 사용하고 ETag/Last-Modified/부분 응답을 사용하지 않습니다. 비공개 전환 후 기존 콘텐츠 ID의 URL은 익명 접근 시 404가 됩니다. 공유 중인 다른 공개 콘텐츠의 URL은 계속 유효하며 **이미 내려받은 사본은 회수할 수 없습니다.**

## 관리자 콘텐츠 편집

로그인 후 관리 홈의 메뉴에서 목록 또는 고정 페이지 편집으로 이동합니다. 기존 공지와 동일한 서버 권한·파일 처리·본문 정화 규칙을 사용합니다.

| 관리자 경로 | 관리 내용 |
|---|---|
| `/admin/about` | 사업소개 / 조직·업무 / 기업 협력 / 위치·문의처. 구역별 독립 저장 |
| `/admin/programs` | 교육과정·비교과/산학 프로그램 목록과 등록·수정. 수준/유형·대상·운영 방식·이수요건·관련 콘텐츠 |
| `/admin/notices` | 공지 검색·편집·게시 여부·상단 고정·첨부 |
| `/admin/resources` | 서식 대상·제출서류·작성 안내·기한/방법/제출처·문의처·적용 연도·원본 교체 |
| `/admin/faq` | 질문·답변·표시 순서·관련 콘텐츠·외부 링크 |
| `/admin/home` | 메인 제목·소개 본문·이미지 한 개·주요 안내·공지/교육/서식 노출·바로가기 |
| `/admin/guide` | 참여 절차·기존 신청 경로·제출 유의사항·관련 콘텐츠·외부 링크 |

교육·프로그램 종류는 생성 후 고정되며 제목을 바꿔도 식별자와 경로용 slug를 유지합니다. 날짜·기한은 안내용이고 모집/진행 상태나 자동 전환은 없습니다. 수정일은 서버가 갱신합니다. 공식 정보가 없으면 입력 대기 상태로 두고 예시는 예시로 표시하세요.

관련 콘텐츠와 메인 노출은 검색해 **내부 ID로 선택**합니다. 본문을 복사하지 않으며, 비공개 대상의 선택은 관리자 설정에 남아도 공개 조회에서는 제외됩니다. 별도 외부 링크는 이름과 `http://` 또는 `https://` 주소를 입력합니다. 스크립트 URL이나 아이디/비밀번호가 들어 있는 URL은 거부합니다. 메인 소개와 노출 선택은 함께 저장하며 수정 충돌·잘못된 연결이 있으면 모두 반영하지 않습니다. 메인 설정 자체가 초안/비공개이면 지정 노출 목록도 공개 API에서 제외됩니다.

**관리자 미리보기는 저장·공개 작업이 아닙니다.** 실제 노출 여부는 저장한 게시 여부에 따릅니다. 메인·교육/프로그램·공지·서식·기본정보·참여 안내·FAQ의 공개 화면을 실제 DB에 연결했습니다. 자체 신청서 접수·일반 회원가입·계정 관리 화면·통계 대시보드는 추가하지 않습니다.

저장 중 중복 요청을 막고 성공/실패를 표시합니다. 취소는 저장하지 않은 편집을 버리는 동작이며, 이미 저장된 내용을 되돌리는 이력 기능은 아닙니다. 삭제 전 관련 콘텐츠·메인·공유 파일 영향을 확인해야 합니다. 기본정보나 참여 안내를 삭제해도 해당 홈페이지 경로는 유지되며 등록된 내용만 없어집니다. 메인 설정 삭제는 지정 노출 연결도 함께 제거합니다. 첨부 원본은 자동 삭제하지 않으며 미연결 파일 정리 규칙을 따릅니다.

## 기능 상태 및 코드 위치

| 범위 | 현재 동작 | 위치 |
|---|---|---|
| 공개 공통 화면 | 상단·하위 메뉴, 현재 위치, 공개 위치 페이지에서 읽는 하단 문의처 | `src/client/layouts.tsx`, `src/client/components/publicContent.tsx` |
| 공개 안내 6개 화면 | 기본정보 4개·참여 안내·FAQ, 본문/파일/관련 ID, 검색·키보드 펼침·비공개/빈 안내·재시도 | `src/client/pages/PublicContentPages.tsx`, `src/client/components/publicContent.tsx`, `src/client/api/content.ts` |
| 공개 메인 | DB 소개·이미지·주요 안내/공지·최근 공지·교육·서식·바로가기 | `src/client/pages/HomePage.tsx`, `src/client/components/ConnectionGraphic.tsx` |
| 교육·프로그램·서식 공개 | 검색·분류·페이지 이동, 수준/유형별 목록, 상세 필드·원본 다운로드·관련 ID | `src/client/pages/PublicCatalogPages.tsx`, `src/client/components/publicContent.tsx` |
| 없는 경로 | 실제 404 안내·홈 복귀 | `src/client/pages/PublicPages.tsx` |
| 관리자 공통 화면 | 서버 검증 로그인·보호 경로·관리 홈·로그아웃 | `src/client/layouts.tsx`, `src/client/pages/AdminPages.tsx`, `src/client/auth/` |
| 공지 4개 화면 | 관리자 목록/등록·수정, 공개 목록/상세, 검색·분류·페이지·파일·미리보기·관련 ID 선택/표시 | `src/client/pages/NoticePages.tsx`, `src/client/api/notices.ts` |
| 나머지 관리자 편집 | 기본정보·교육/프로그램·서식·FAQ·메인·참여 안내의 목록/폼·ID 선택·미리보기 | `src/client/pages/AdminContentPages.tsx`, `src/client/api/adminContents.ts`, `src/client/components/contentEditing.tsx` |
| 공통 UI | 버튼·표·검색·입력·파일표시·빈 목록·로딩·오류 안내 | `src/client/components/ui.tsx`, `src/client/styles.css` |
| 경로 정의 | 공개 15개, 관리자 등록/수정 포함 17개 패턴 | `src/shared/pageRoutes.ts` |
| DB·스키마 | 실제 SQLite 파일, 명시적 마이그레이션/seed/상태 명령 | `src/server/db/`, `migrations/`, `seed/`, `scripts/db.ts` |
| 데이터 접근 | 콘텐츠 저장·수정·조회, ID 관계, 파일 메타데이터, 메인 노출 설정 | `src/server/repositories/contentRepository.ts`, `src/shared/content.ts` |
| API | 실제 DB health·공개 조회·인증·유형별 CRUD·고정 페이지·메인 설정·미리보기·파일 저장/전송 | `src/server/app.ts`, `src/server/http/` |
| 본문·파일 | 모든 편집 유형의 서버 HTML 정화, 파일 내용 검증·쓰기·권한별 읽기·미연결 정리 | `src/server/content/noticeHtml.ts`, `src/server/files/` |
| 콘텐츠 이관 | 논리 JSON·원본 내보내기와 빈 환경 복원, 인증 정보 제외·충돌 거부 | `src/server/transfer/`, `scripts/content.ts` |
| 인증 | scrypt 비밀번호, SQLite 세션·시도 제한, 로컬 계정 설정 | `src/server/auth/`, `scripts/admin.ts`, `migrations/002_auth.sql` |
| 클라이언트 데이터 모듈 | API health·메인/목록/분류/프로그램·안내/FAQ/문의처 조회, 404·조회 실패 구분. 임시 콘텐츠 저장소 없음 | `src/client/api/content.ts` |
| 설정/기동 | 환경변수 검증, 루프백 기본값, 프런트/API 실행·종료 | `src/server/config.ts`, `src/server/index.ts`, `scripts/dev.ts` |

공개 조회는 인증 없이 실제 DB를 사용합니다. 관리 화면은 서버 `/api/auth/session` 확인 후에만 표시하며 localStorage나 임의 브라우저 플래그를 권한으로 쓰지 않습니다. 공식 연락처·주소·로고는 제공되지 않아 입력 대기 또는 텍스트 명칭으로 표시합니다.

## 인증·접근 정책

- 비밀번호는 Node.js `scrypt`(N=32768, r=8, p=3, 무작위 16바이트 salt)로 해시합니다. 원문을 DB·로그·seed에 저장하지 않습니다.
- 로그인마다 무작위 32바이트 세션을 새로 발급하며 DB에는 토큰의 SHA-256만 보관합니다. 활성 관리자와 만료 시각을 매 요청 확인합니다. 서버 재시작은 세션을 초기화하지 않으며 로그아웃/재설정은 DB 세션을 삭제합니다.
- 세션 쿠키는 HttpOnly·SameSite=Lax·Path=/이며 Domain을 설정하지 않습니다. HTTPS 설정에서 Secure를 추가합니다. 로그인도 15분 사전 세션의 CSRF 토큰을 검증합니다. 이후 변경은 서버 세션의 CSRF 토큰과 정확한 Origin을 함께 요구합니다.
- `GET /api/auth/csrf` → `POST /api/auth/login` → `GET /api/auth/session` → `POST /api/auth/logout`을 사용합니다. 로그인/변경 POST에는 `X-CSRF-Token`과 허용 Origin이 필요합니다. 세션 토큰은 JSON에 반환하지 않습니다.
- 로그인 시도는 15분 창에서 IP 30회·아이디 8회, 사전 로그인 세션 신규 발급은 IP 60회로 제한합니다. 성공 시도도 계산하며 서버 재시작으로 초기화하지 않습니다. 제한 시 429와 `Retry-After`, 실패 시 계정 존재 여부를 구분하지 않는 메시지를 반환합니다.
- `/api/admin` 전체는 인증이 필요하고 모든 `/api` 변경 메서드는 공통 권한·CSRF 검사를 거칩니다(로그인은 별도 사전 CSRF). 향후 편집·삭제·업로드 경로도 이 검사 뒤에 추가합니다. 현재 미구현 기능은 미인증 401, CSRF 실패 403, 검증 통과 후 501입니다.
- `GET /api/admin/contents/:id`는 인증된 관리자에게 초안·비공개 상세를 허용합니다. 공개 API는 로그인 여부와 관계없이 공개 콘텐츠만 반환합니다. `/api/files/:id?contentId=...`는 실제 ID 연결과 공개 여부를 검사하며 비공개/미연결 첨부는 관리자만 허용합니다. 파일 권한은 원본 전송 때마다 확인하며 개인 PC 경로나 저장키를 노출하지 않습니다. 문서는 첨부 다운로드, 관리된 래스터 이미지만 `inline=1`로 표시합니다.
- 빌드 서버는 미인증 관리자 HTML 요청을 로그인으로 이동합니다. Vite 개발 화면은 공통 클라이언트 보호 경로를 사용하며 모든 데이터/API 권한은 동일하게 서버에서 검사합니다.

내부 `ContentRepository.update()`는 전체 교체와 revision 검사를 사용합니다. 콘텐츠 PATCH와 고정 페이지 PUT API는 기존 값을 읽어 생략한 세부 정보·문의처·관련 링크·첨부 등을 보존하도록 병합합니다. 고정 페이지 최초 저장은 `revision=0`, 수정은 조회한 revision을 요구하며 동시 최초 저장도 덮어쓰지 않습니다. 본문은 저장·미리보기와 조회 시 서버에서 정화합니다. 파일은 실제 검증·쓰기·동기화 후 메타데이터를 등록하며 DB 실패 시 새 원본을 정리합니다. 미연결 삭제 실패 시에도 DB와 원본 복구를 시도하고 기존 콘텐츠 연결은 손상하지 않습니다.

## GitHub 포함·제외와 변경 이력

| 포함할 자료 | 제외할 자료 |
|---|---|
| `src/`, `scripts/`, `tests/`, `index.html`, 설정 코드와 디자인 자산 | `.env`와 비밀 설정, 개인 자료·계정/세션/키 |
| `package.json`, `package-lock.json`, `.node-version`, `.npmrc` | `node_modules/`, `dist/`, `.cache/`, 검수 로그·화면 캡처 |
| `migrations/`, 공개 가능한 `seed/example-contents.json` | 실제 `.sqlite`/`.db` 및 WAL/SHM, `var/`, 업로드·DB 사본·콘텐츠 백업 |
| `README.md`, `docs/`, 기준 원문, 값이 비어 있는 `.env.example`, `.gitignore` | 사용자 지정 저장소·백업 경로의 실데이터 |

사용자의 후속 승인에 따라 2026-10-15 로컬 Git 저장소를 만들었습니다. 브랜치는 `main`, 소스 기준 커밋은 `9c104077f93988d3171d262abce4201bf088e556`입니다. 이후 Git 검수 문서 갱신은 별도 커밋으로 구분합니다. 작성자 정보와 `core.autocrlf=false`는 이 저장소에만 설정해 현재 파일 바이트를 보존했습니다. 실제 index·HEAD 및 모든 로컬 참조에서 도달 가능한 커밋의 tree/blob을 검사했고, 추적 94파일에서 금지 경로·검사 대상 비밀값 발견 0건, 포함/제외 규칙 39/39를 확인했습니다. 알려지지 않은 모든 비밀의 부재를 보장하는 검사는 아닙니다. 상세 근거는 [LOCAL_ACCEPTANCE](docs/LOCAL_ACCEPTANCE.md)와 [BUILD_PROGRESS](docs/BUILD_PROGRESS.md)를 따릅니다.

현재 도구 계정과 작업 폴더 소유자가 달라 Git의 소유권 확인이 발생할 수 있습니다. 아래처럼 **확인한 작업 경로만 해당 명령에 지정**합니다. 전역 `safe.directory`나 파일 소유권은 변경하지 않았습니다. 다른 폴더에서는 확인한 실제 경로로 바꿉니다.

```powershell
git -c safe.directory=D:/boot_page status --short
git -c safe.directory=D:/boot_page log -5 --oneline
git -c safe.directory=D:/boot_page rev-parse HEAD
git -c safe.directory=D:/boot_page ls-remote --heads origin main
git -c safe.directory=D:/boot_page ls-files
git -c safe.directory=D:/boot_page check-ignore -v -- .env var/db/bootcamp.sqlite var/uploads/ var/backups/ .cache/ node_modules/ dist/
```

소스와 문서만 커밋했고 `.env`·실제 DB·관리자 해시/세션·업로드·백업·ZIP·캐시는 제외했습니다. 이후 자료를 추가할 때도 실제 추적 목록을 확인합니다. `.gitignore` 추가만으로 이미 추적된 비밀이 이력에서 사라지지는 않습니다. 이후 사용자가 지정한 [GitHub 저장소](https://github.com/Nawii06/boot_page)를 `origin`으로 연결하고 `main` push를 완료했습니다. Replit/Cloudflare Publish는 수행하지 않았습니다. 기존 ZIP과 P-11 소스 전달본은 이 Git 정리 이전 시점의 보존본이며 최신 문서 커밋을 포함하지 않습니다.

Replit에 올릴 소스 커밋, 소스 manifest 해시, 운영 콘텐츠 기준 패키지/해시·시각, 편집 동결/재개 시점, 원격 변경자료 회수 위치·검증 결과는 [Replit 인계 기록표](docs/REPLIT_HANDOFF.md)에 실제 작업 시 채웁니다. 미정 항목을 가상의 커밋이나 저장소 주소로 채우지 않습니다.

## 데이터 보존과 후속 단계

- 기존 기준 MD/TXT와 단계별 기록, 실제 DB·관리자 계정을 보존합니다. 실제 첨부는 기본 `var/uploads`에 저장합니다. P-05/P-06/P-07/P-08/P-09는 기존 스키마를 활용하며 추가 마이그레이션이나 seed 재실행이 필요하지 않습니다.
- `.env`·로컬 DB·업로드·백업·로그·의존성·빌드 산출물은 `.gitignore` 제외 대상입니다. 사용자 지정 데이터 경로를 추가할 때도 추적 제외를 확인하세요.
- 현재 소스와 검수 기록은 [Nawii06/boot_page](https://github.com/Nawii06/boot_page)의 `main`에 push했습니다. 기존에 제공된 원격을 사용했으며 새 저장소 생성·Replit/Cloudflare 배포는 수행하지 않았습니다.
- 실제 HWP/HWPX 원본 업로드·다운로드·해시 일치는 미검증 항목으로 유지합니다. 실제 업무 사용 또는 전체 검수 완료 전에 확인합니다. P-11 인계에서도 P-10 미검증을 유지하며 소스 전달·로컬 재현과 외부 운영 완료를 구분합니다. 실제 Git 추적·이력 검사는 후속 승인 작업에서 통과했습니다. 전체 최종 완료 전 한컴 원본 시험이 필요합니다.
- [프로젝트 기준](docs/PROJECT_CONTEXT.md) · [화면 목록](docs/PAGE_INVENTORY.md) · [진행기록](docs/BUILD_PROGRESS.md)
