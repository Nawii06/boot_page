# 프로젝트 기준 — 국립한국교통대학교 부트캠프(AI)사업단

작성일: 2026-10-14 (Asia/Seoul)  
갱신일: 2026-10-15 (Asia/Seoul)  
현재 **P-11 로컬 새 폴더 재현·인계 준비 완료, 전체 최종 판정 보류**. 공개15·관리자13 및 실제 DB/파일/서버 인증을 유지한다. 소스와 콘텐츠 보존본을 분리하고 새 설치→관리자→자료 등록/공개/다운로드→재시작·다른 소스 폴더 복원을 검증했다. 한컴 원본은 미검증이다. 이후 승인된 로컬 Git 정리에서 `main`의 실제 index·커밋 이력 검사와 94파일 추적 제외 검증을 통과했다. 추가 승인에 따라 [GitHub 저장소](https://github.com/Nawii06/boot_page)를 `origin`으로 연결하고 `main` push를 완료했다. 실행은 [README](../README.md), 결과는 [BUILD_PROGRESS](BUILD_PROGRESS.md)·[LOCAL_ACCEPTANCE](LOCAL_ACCEPTANCE.md), 외부 준비는 [REPLIT_HANDOFF](REPLIT_HANDOFF.md)·[CLOUDFLARE_HANDOFF](CLOUDFLARE_HANDOFF.md)를 따른다. 외부 배포는 수행하지 않았다.

## 1. 기준과 실제 초기 상태

- 기준 원문: [로컬 제작 순서 및 VS Code Codex 실행 프롬프트.md](../로컬%20제작%20순서%20및%20VS%20Code%20Codex%20실행%20프롬프트.md), 버전 1.0. 전체를 UTF-8로 읽었다. 같은 이름의 TXT는 별도 원본으로 보존한다.
- IDE가 지정한 작업 폴더와 실제 셸 위치 모두 `D:\boot_page`이며 해당 기준 문서가 존재한다. 이 폴더를 신규 로컬 프로젝트 대상으로 삼는다. 경로는 조사 기록이며 앱 소스에 고정하지 않는다.
- 작업 시작 시 파일은 위 MD/TXT 두 개뿐이다. 숨김 파일을 포함한 목록과 파일 검색에서 코드, `AGENTS.md`, `README`, 패키지·잠금 파일, 대응 프로젝트 문서, DB, 업로드를 발견하지 못했다. 상위 `D:\AGENTS.md`도 없다.
- `git status --short` 결과는 `not a git repository`다. 따라서 브랜치·커밋·remote·미커밋 변경 목록이 존재하는 저장소로 취급하지 않는다. Git 초기화·clone·원격 저장소 선택은 수행하지 않았다.
- Git `2.54.0.windows.1`, Python `3.14.6`, Python 내장 SQLite `3.50.4`를 확인했다. 이는 홈페이지 런타임이나 DB 드라이버 검증 결과가 아니다.
- 최초 조사에서는 PowerShell의 PATH와 확인한 일반 설치 위치에서 Node.js/npm을 찾지 못했다. pnpm/yarn/corepack/deno/bun도 당시 셸 명령으로 발견되지 않았다.
- 설치 후 재확인(2026-10-14): 사용자가 Node.js/npm 설치를 완료했고, 현재 PowerShell에서 `node --version` → `v24.21.0`, `npm.cmd --version` → `11.19.0`을 직접 확인했다. 두 명령은 `C:\Program Files\nodejs`에서 발견된다. Windows PowerShell의 프로젝트 절차에는 `npm.cmd`를 사용한다. 이후 P-02에서 의존성 설치·타입 검사·빌드·개발 및 빌드본 기동을 검증했다.
- 실제 공식 콘텐츠·교육조건·연락처·로고·HWP/HWPX 시험 파일은 프로젝트에 없다. IDE의 다른 탭 표시는 파일 제공이나 사업정보 승인으로 해석하지 않는다.
- P-01 당시에는 공개/관리자 화면, DB, 인증, 파일 저장, 백업이 모두 없었으며 요구사항 원문을 재사용했다. P-02에서 공통 UI·라우트·로컬 API, P-03에서 실제 SQLite·공개 조회와 마이그레이션 전 백업, P-04에서 서버 인증과 접근 통제, P-05에서 공지 화면·원본 파일 저장을 추가했다. P-09에서 이관용 내보내기/복원을 별도 CLI로 추가했다.

## 2. 확정 범위와 콘텐츠 원칙

- 최종 로컬 목표: 공개 15개, 관리자 13개 화면 유형. 화면 목록과 구현 상태는 [PAGE_INVENTORY.md](PAGE_INVENTORY.md)에서 관리한다.
- 공개 상위 메뉴: 홈 / 사업단 소개 / 교육·참여 프로그램 / 공지·자료실.
- 일반 방문자는 로그인 없이 공개 콘텐츠와 첨부를 이용한다. 콘텐츠·파일 변경은 지정 관리자만 서버 검증을 거쳐 수행한다.
- 공지, 교육과정, 비교과·산학 프로그램, 서식, FAQ, 기본정보, 참여 안내, 메인 설정을 실제 DB에 저장한다. 첨부 원본도 실제 파일로 저장하고 재시작 후 유지한다.
- 필수 첨부: HWP·HWPX·PDF·DOCX. 콘텐츠 편집에 필요한 JPEG/PNG/WebP 등 이미지는 허용 목록으로 제한한다.
- 일반 계정·회원가입·학생 계정·학교 SSO·온라인 신청/접수·실적 대시보드는 제외한다. 신청은 관리자가 입력한 기존 이메일·학교 시스템·방문 안내를 따른다.
- 교육 진행/모집 상태 필드·배지·상태별 필터·날짜에 따른 자동 전환을 만들지 않는다. `publication`의 `draft / public / private`만 게시 여부로 사용한다.
- HWP/HWPX 브라우저 미리보기·문서 자동변환은 필수가 아니다.
- 공식 정보가 없으면 ‘입력 대기’, 시험 콘텐츠면 제목과 본문에 ‘예시’를 표시한다. 임의 과정·주소·연락처·기관 로고를 만들지 않는다.
- P-01~11 범위에서 외부 Publish, Cloudflare 계정·원격 DB 변경, 도메인 연결, 원격 push는 제외했다. 이후 사용자가 지정한 GitHub 저장소로의 push만 별도 승인받아 완료했으며 외부 앱 Publish·원격 DB 변경은 수행하지 않았다.

## 3. 선택한 기술 기본안

| 영역 | 기본안 | 선택 이유 / 후속 확인 |
|---|---|---|
| 런타임 | Node.js 24 LTS, npm | Node `24.21.0`, npm `11.19.0`으로 설치·빌드·실행 확인. `.node-version`, `package.json`, `package-lock.json`에 반영 |
| 프런트 | React + TypeScript + Vite, React Router | 공개/관리자 공통 UI와 등록·수정 폼 재사용. 정적 빌드 결과와 서버 API를 분리 |
| API | Express 5 + TypeScript | 작은 REST API, 권한 미들웨어와 로컬 파일 스트리밍 구현. Workers에서는 HTTP 진입부 교체 |
| DB | SQLite + `better-sqlite3`, 명시적 SQL 마이그레이션 | P-03 구현: `better-sqlite3 13.0.3`, SQLite `3.53.4`, 타입 `@types/better-sqlite3 9.6.0`. Windows 사전 빌드 네이티브 모듈의 실행 확인, 실제 파일·매개변수 질의·트랜잭션 사용 |
| 검증 | 서버 입력 검증, 허용 목록 기반 HTML 정화 | P-03의 종류·필수값·UUID·URL 검증에 P-05 `sanitize-html`과 파일 시그니처·컨테이너·이미지 디코딩을 추가 |
| 인증 | Node.js scrypt + 무작위 불투명 토큰의 SQLite 서버 세션 | P-04: N=32768/r=8/p=3, salt 16바이트. 토큰은 32바이트 난수이며 DB에는 SHA-256만 저장. 일반 가입 없이 숨김 입력 로컬 명령으로 계정 설정 |
| 테스트 | API 통합 테스트 + 격리 SQLite/저장 폴더, 브라우저 주요 흐름 검수 | 인증·파일·영속성·복원에 재현 가능한 증거 확보 |

새 프로젝트이므로 교체할 기존 프레임워크는 없다. Python이 있다는 이유만으로 요구 문서의 TypeScript 우선안을 변경하지 않았다. 단일 프로젝트/단일 npm 잠금 파일을 사용하며 모노레포·범용 CMS·범용 승인 시스템은 만들지 않는다. P-02에서 의존성을 실제 설치하고 `package-lock.json`과 런타임·패키지 매니저 버전을 고정했다. React `19.3.0`, Vite `8.3.4`, Express `5.3.0`, TypeScript `7.0.2`를 유지하며 실제 의존성 전체는 패키지/잠금 파일을 따른다. P-03에서 SQLite 드라이버·타입을, P-05에서 `busboy 1.6.0`, `cfb 1.2.2`, `sanitize-html 2.18.0`, `saxes 6.0.0`, `sharp 0.35.5`, `yauzl 3.4.0`과 필요한 타입을 추가했다. 프레임워크나 기존 잠금 버전을 일괄 교체하지 않았다.

Node 24의 LTS 상태는 [Node.js 공식 릴리스 표](https://nodejs.org/en/about/previous-releases)에서 확인했다. Vite는 [공식 시작 안내](https://vite.dev/guide/)의 Node 요구사항에 맞춰 구성하고 Express 5는 [공식 설치 안내](https://expressjs.com/en/starter/installing/)를 따른다. SQLite 드라이버는 [유지관리 저장소](https://github.com/WiseLibs/better-sqlite3)의 설치 요건과 실제 Windows 설치 결과를 함께 확인한다. 확인일은 2026-10-14이며 문서 열람은 설치·호환성 시험을 대신하지 않는다.

## 4. 디렉터리와 설정 설계

P-02 코드는 `src/client/`(화면·공통 UI·스타일), `src/shared/pageRoutes.ts`(경로), `src/server/app.ts`(API·정적 화면), `src/server/config.ts`(설정), `src/server/index.ts`(기동), `scripts/dev.ts`(개발 실행)에 있다. P-03에서 [공개 조회 라우트](../src/server/http/publicContents.ts), [콘텐츠 저장소](../src/server/repositories/contentRepository.ts), [DB 연결](../src/server/db/connection.ts)·[마이그레이션 실행](../src/server/db/migrations.ts)·[seed 실행](../src/server/db/seed.ts), [공유 자료형](../src/shared/content.ts), [클라이언트 API 모듈](../src/client/api/content.ts), [DB CLI](../scripts/db.ts)를 분리했다.

다음은 실제 구조다. P-05 화면은 `pages/NoticePages.tsx`, 호출 모듈은 `api/notices.ts`에 있다. P-06은 `pages/AdminContentPages.tsx`, `api/adminContents.ts`, 공통 편집 도구 `components/contentEditing.tsx`를 추가했다. P-07 안내/FAQ 화면은 `pages/PublicContentPages.tsx`, 공개 본문·파일·문의처·관련 ID·재조회 도구는 `components/publicContent.tsx`에 있다. P-08 메인은 `pages/HomePage.tsx`, 교육/프로그램/서식 목록·상세는 `pages/PublicCatalogPages.tsx`, 기존 AI 그래픽은 `components/ConnectionGraphic.tsx`에 있다. 공개 호출은 기존 `api/content.ts`를 사용한다. 기존 서버 `http/notices.ts`를 여러 콘텐츠 종류에 재사용하며 인증·파일 처리는 그대로 공유한다. `var/`는 DB·업로드·백업의 비공개 런타임 영역이다.

```text
src/
  client/                 공개/관리자 화면, 라우트, 공통 UI, 스타일
  server/
    http/                 API 라우트, 오류 처리
    auth/                 계정 확인, 비밀번호, 세션, CSRF
    repositories/         콘텐츠/파일 관계 질의와 트랜잭션
    db/                   SQLite 연결, 마이그레이션 실행
    files/                원본 파일 검증·저장·권한별 읽기·미연결 정리
    content/              콘텐츠 HTML 정화와 본문 이미지 ID 연결
    config.ts             환경변수 검증, 경로 해석
  shared/                 API 자료형, 입력 규칙
migrations/               버전 관리 SQL
seed/                     공개 가능한 명시적 예시 자료
scripts/                  개발 실행·DB·관리자·콘텐츠 내보내기/복원 CLI
tests/                    격리된 기능 테스트
docs/                     기준·화면 목록·진행기록
var/                      Git 제외 로컬 데이터
```

| 설정명 | 기본값 설계 | 해석 |
|---|---|---|
| `HOST` | `127.0.0.1` | P-02 구현: 프런트/API/빌드 실행 기본 바인딩 |
| `ALLOW_NETWORK` | `false` | P-02 구현: 루프백 외 HOST에는 명시적인 true가 필요 |
| `PORT` | `3000` | 로컬 API/빌드 실행 포트 |
| `DEV_PORT` | `5173` | 개발 프런트 포트. 기본 루프백, PORT와 다른 값 사용 |
| `APP_ORIGIN` | 루프백 주소의 PORT·DEV_PORT 출처 | 정확한 출처 1개로 제한 가능. HTTPS 운영 시 명시적 설정 |
| `DB_PATH` | `./var/db/bootcamp.sqlite` | P-03 구현: 실제 SQLite 파일. `.sqlite`/`.sqlite3`/`.db` 경로만 허용 |
| `UPLOAD_DIR` | `./var/uploads` | P-05 원본 파일 검증·저장. 정적 공개/소스 밖 경로 |
| `BACKUP_DIR` | `./var/backups` | P-03 구현: 마이그레이션 전 SQLite 백업. 콘텐츠 이관 패키지는 별도 CLI의 명시적 --output 경로 |
| `MAX_UPLOAD_MB` | `20` | 파일당 MiB, 1~100 정수 |
| `MAX_STORAGE_MB` | `512` | 저장소 전체 MiB, 1~102400 정수. 미연결 파일 포함 |
| `MAX_ZIP_EXPANDED_MB` | `100` | 압축 해제 합계 MiB, 1~500 정수 |
| `MAX_IMAGE_PIXELS` | `20000000` | 단일 이미지 픽셀 상한, 1~40000000 정수 |
| `MAX_FILES_PER_CONTENT` | `20` | 콘텐츠당 첨부·본문/메인 이미지 고유 개수, 1~100 정수 |
| `SESSION_TTL_SECONDS` | `28800` | P-04 서버 절대 만료 8시간. 300~86400초 |
| `COOKIE_SECURE` | 로컬 HTTP `false`, 운영 HTTPS `true` | HTTPS 출처와 함께 검증. 실제 운영 HTTPS 배포는 미실행 |

표의 모든 설정은 서버가 읽고 검증한다. `.env` 하나만 읽고 셸 환경변수를 우선하며, `.env.local` 등은 읽지 않는다. `.env.example`은 변수명·설명·비밀이 아닌 기본값을 제공하며 관리자 비밀번호는 받지 않는다.

저장소 상대 경로는 프로젝트 루트 기준으로 해석한다. 절대경로 설정도 가능하지만 콘텐츠/파일 관계에는 개인 PC 절대경로를 저장하지 않는다. 경로 검사에서는 심볼릭 링크의 실제 대상까지 확인해 소스·공개·빌드·문서·의존성 영역을 제외하고 메모리 DB·파일 URI를 허용하지 않는다. 설정값은 서버만 읽고 클라이언트 번들에 노출하지 않는다. DB 및 실제 서버 프로세스 테스트는 `.cache/tests`의 고유한 임시 DB·폴더로 격리한다.

P-02에서 `.gitignore`를 마련했다. `.env` 계열(예시 제외), `var/`, 실제 DB와 WAL/SHM/journal, 업로드·백업·로그·키, `node_modules/`, `.cache/`, 빌드/시험 산출물을 제외 대상으로 정의한다. 세션·개인정보도 향후 제외된 데이터 경로에 저장한다. 사용자 지정 데이터 경로가 저장소 안이면 해당 경로도 제외 여부를 점검한다. 코드·마이그레이션·잠금 파일·공개 예시·문서·디자인 자산만 추적한다. P-11까지 실제 저장소가 없었으며, 이후 사용자 승인으로 로컬 Git을 구성하고 실제 index/HEAD/도달 가능한 커밋의 제외 검사를 통과했다. 당시 단계의 미검증 기록은 보존한다.

## 5. DB 관계 구현과 후속 정책

공개 목록형 콘텐츠와 고정 안내를 `contents`로 묶고 허용된 종류와 필수값을 구분했다. 아래 테이블은 [001_initial.sql](../migrations/001_initial.sql)에 구현되어 있다. `schema_migrations`만 마이그레이션 실행기가 같은 트랜잭션 안에서 생성한다. P-04 인증은 001의 계정·세션과 002의 사전 세션·시도 제한을 사용한다. P-05는 기존 테이블을 활용하며 마이그레이션을 추가하거나 적용된 SQL을 수정하지 않는다.

| 테이블 | 주요 필드와 제약 | 역할 |
|---|---|---|
| `contents` | `id` UUID PK, `kind`, `slug`, `title`, `body_html`, `category`, `publication`, `pinned`, `sort_order`, `published_at`, `created_at`, `updated_at`, `revision`; `(kind, slug)` UNIQUE | 공지·교육·프로그램·서식·FAQ·고정 페이지. 게시 여부 CHECK, 매개변수 질의 |
| `program_details` | `content_id` PK/FK, `level`, `audience`, `delivery`, `completion_requirements` | 교육 수준/유형, 대상·운영 방식·이수요건. 진행 상태 없음 |
| `resource_details` | `content_id` PK/FK, `audience`, `required_documents`, `instructions`, `deadline_text`, `submission_method`, `destination`, `contact`, `applicable_year` | 서식 적용·작성·제출 안내. 날짜는 안내용 |
| `contact_details` | `content_id` PK/FK, `name`, `phone`, `email`, `address`, `note` | 공지·고정 페이지의 문의처. 실제 정보가 없으면 빈 값/입력 대기 |
| `content_relations` | `source_id`, `target_id` FK, `sort_order`; 복합 PK, 자기 참조 금지 | 교육 ↔ 공지 ↔ 서식, 참여 안내·FAQ의 관련 콘텐츠 |
| `files` | `id` UUID PK, `storage_key` UNIQUE, `original_name`, `media_type`, `extension`, `size`, `sha256`, `created_at` | 원본 메타데이터. 저장키는 서버 생성 상대키 |
| `content_files` | `content_id`, `file_id` FK, `role`, `sort_order`, `alt_text`; 복합 고유 제약 | 첨부·본문 이미지·메인 이미지 연결, 여러 콘텐츠가 한 파일 참조 가능 |
| `home_items` | `content_id` FK, `section`, `sort_order` | 메인 주요/최근 안내·교육·서식 선택. 콘텐츠 본문을 복제하지 않음 |
| `content_links` | `id` PK, `content_id` FK, `label`, `url`, `sort_order` | 관리자 입력 외부 링크·바로가기. 안전한 URL 규칙 검증 |
| `admins` | `id` PK, `username` UNIQUE(대소문자 무시), `password_hash`, `enabled`, `created_at`, `updated_at` | P-04 지정 관리자 생성/재설정용 구조 |
| `sessions` | `token_hash` PK, `admin_id` FK, `csrf_secret`, `expires_at`, `created_at` | 무작위 세션 토큰의 서버 검증, 만료·로그아웃 무효화 |
| `schema_migrations` | `version` PK, `filename` UNIQUE, `checksum`, `applied_at` | 순서·파일명·SHA-256 검증, 적용 파일 변경/누락/알 수 없는 이력 거부 |
| `seed_runs` | `key` PK, `checksum`, `applied_at` | 예시 묶음의 일회성 적용, 같은 버전 내용 변경 거부 |

`kind`는 `notice / curriculum / activity / resource / faq / page`로 제한한다. 고정 페이지는 `page` 종류의 `overview / organization / cooperation / location / guide / home` slug로 식별한다. 연락 안내는 `contact_details`로 구조화했고 P-07에서 공개 `location`의 문의처를 공통 하단에 재사용한다. 임의 JSON 문서 전체를 무검증 저장하지 않는다. P-07/P-08에도 기존 스키마·예시를 유지하며 공개 화면용 표를 따로 만들지 않는다.

DB 연결은 실제 파일만 사용하며 외래키·WAL·5초 busy timeout·FULL 동기화를 활성화했다. STRICT 테이블, 고유값·CHECK·목록 인덱스, 상세 정보의 콘텐츠 종류 일치 트리거를 적용했다. `storage_key`는 안전한 상대키이고 파일 ID와 콘텐츠 ID로 연결한다. 서버 공개 조회에서는 저장키·해시·개인 PC 경로를 내보내지 않는다.

저장소의 생성·수정은 검증과 매개변수 질의를 사용하고 콘텐츠/상세/관련 ID/파일 연결을 한 트랜잭션으로 반영한다. 수정 충돌은 `revision`으로 감지해 409를 반환한다. P-06은 목록형 모든 종류와 고정 페이지의 변경 API를 제공한다. 메인 문안·이미지·노출 ID 선택도 한 트랜잭션으로 저장한다. 복수 질의로 구성하는 상세·목록·메인은 읽기 트랜잭션으로 같은 시점의 공개 여부를 확인한다. 게시일은 안내용이며 자동 공개 예약·교육 진행 상태는 없다. 시간은 UTC로 저장하고 화면은 브라우저 현지 시간대의 한국어 날짜로 표시한다. 현재 시험 환경은 한국 시간대다.

ID는 DB 관계·파일 연결·백업 기준인 UUID이며 바꾸지 않는다. 교육·프로그램의 공개 주소는 종류와 slug 조합(`/programs/curriculum/:slug`, `/programs/activities/:slug`)이고 공지·서식의 `:post`는 UUID다. 관리자 HTTP 신규 등록에서는 `${kind}-${UUID}` 형식 slug를 서버가 자동 생성하며 기존 seed의 명시적 slug는 그대로 유지한다. 제목 수정은 ID·종류·slug를 변경하지 않으므로 기존 상세 주소가 유지된다. 수정 API는 slug 입력을 거절하고 저장소도 ID·종류·slug 변경을 막는다. 고정 안내는 기존 지정 slug를 사용한다. 이번 단계에서 경로 변경·slug 편집·리다이렉트 관리 기능을 추가하지 않는다.

관련 콘텐츠는 자유 URL 대신 대상 ID를 저장하고 공개 화면에서 종류별 기존 주소로 변환한다. 관계는 원본에서 선택한 방향이며 역방향 링크를 자동 생성하지 않는다. 양쪽에서 안내하려면 양쪽 편집기에 상대 콘텐츠를 선택한다. 공개 조회는 대상의 현재 게시 여부를 확인하며 비공개·삭제된 대상 링크를 제외한다. 공지 편집기도 같은 ID 선택 방식을 사용해 교육 → 공지 → 서식 흐름을 관리할 수 있게 한다.

마이그레이션과 예시 seed는 `db:migrate`, `db:seed`로 별도 실행한다. 서버는 DB를 자동 생성·마이그레이션·초기화하거나 seed를 넣지 않으며, DB가 없거나 이력이 맞지 않으면 기동을 거부한다. 마이그레이션은 001부터 연속한 SQL과 SHA-256을 검사하고 대기 변경 전체를 한 트랜잭션으로 적용한다. 기존 스키마가 있으면 SQLite 온라인 백업으로 WAL까지 포함한 일관된 DB 사본을 만들고 경로를 출력한 뒤 적용한다. 기존 테이블이 있으나 이력이 없는 DB는 보존하고 작업을 거부한다. 실행 중인 앱/DB 작성 프로세스를 먼저 종료한다.

[예시 manifest](../seed/example-contents.json)는 안정적인 ID의 명백한 예시 9건과 관련 ID·메인 선택을 담는다. ID/종류·slug 충돌을 사전 검사하고 전체 seed와 `seed_runs` 기록을 한 트랜잭션으로 적용한다. 같은 묶음의 재실행은 변경 없이 종료하므로 사용자가 수정하거나 삭제한 예시도 다시 덮어쓰거나 되살리지 않는다. 기본 관리자·비밀번호·가짜 파일 원본은 넣지 않는다.

`ContentRepository.update`는 전체 콘텐츠 교체 계약이다. HTTP PATCH와 고정 페이지 PUT은 생략한 상세·문의처·관련 ID·파일/외부 링크를 현재 값과 병합·보존한다. 고정 페이지 최초 저장은 `revision: 0`으로 동시 생성을 막고 이후 현재 revision을 요구한다. 삭제 전 관련 참조·메인·공유 파일 영향을 확인하고 revision이 일치할 때 콘텐츠와 연결만 제거한다. 메인 페이지 삭제는 메인 노출 선택도 함께 해제한다. 원본은 보존하며 미연결 파일 정리에서 참조가 없는 파일만 별도로 삭제한다. P-06에는 스키마 변경·새 마이그레이션·seed 재주입이 없다.

## 6. API 계약 설계

현재 `GET /api/health`는 실제 DB 질의 후 `data.status=ok`, `stage=P-08`, `capabilities.database/authentication/uploads=true`를 반환한다. 모든 관리자 콘텐츠의 CRUD·삭제 영향·서버 미리보기와 고정 안내·메인 저장, 파일 원본 업로드/전송/미연결 정리를 구현했다. P-08은 기존 공개 메인·페이지·목록·상세 조회를 사용하고 공개 분류 조회를 추가했다. 새 변경 API는 없다. 모든 `/api` 변경 메서드의 미인증 요청은 401, 세션이 있어도 CSRF·Origin이 틀리면 403이다. 로그인에는 별도 사전 CSRF 검사를 적용한다.

동일 출처 `/api`를 사용한다. 공개 API는 관리자로 로그인했더라도 공개 자료만 반환하고, 미리보기는 관리자 API를 사용한다. `kind`, 검색어 길이, 페이지 크기, 정렬값 등은 서버 허용 목록/범위로 제한한다.

P-08 목록·관련 대상·메인 선택의 프로그램 요약에는 `programLevel`로 DB의 교육 수준/프로그램 유형을 전달한다. 기존 `program_details`를 JOIN하며 본문 전체나 비공개 자료를 내려받아 프런트에서 분류하지 않는다. 전체 분류 조회에서는 category 조건을 생략하고 특정 분류를 선택했을 때만 전달한다. 새 분류 API는 kind를 필수 검증하고 임의 추가 조건·중복 배열을 거부한다.

| 요청 | 기능 | 접근 기준 |
|---|---|---|
| `GET /api/health` | 최소 실행 상태, 비밀·경로 비노출 | 공개 |
| `GET /api/public/contents?kind=notice&q=&category=&page=1&pageSize=20` | 공개 목록·검색·분류·페이지 이동 | `publication=public`만 |
| `GET /api/public/content-categories?kind=resource` | 지정 종류의 공개 분류. kind 필수·허용 목록 검증 | 공개된 원본의 분류만. 기존 공지 분류 API 유지 |
| `GET /api/public/contents/:id` | 상세, 공개된 관련 링크, 첨부 메타데이터 | 비공개·누락 모두 404 |
| `GET /api/public/pages/:slug` | 기본정보·참여 안내 | 공개 고정 페이지 |
| `GET /api/public/programs/:kind/:slug` | 교육/프로그램 상세 | kind와 slug 조합 확인 |
| `GET /api/public/home` | 메인 설정·선택 콘텐츠·최신 공지 | 공개된 원본만 조합 |
| `GET /api/auth/csrf` | 로그인용 사전 CSRF 토큰 준비 | 동일 출처, 15분 사전 세션. 관리자 권한 없음 |
| `POST /api/auth/login` | `{username, password}` 검증 및 세션 교체 | CSRF·Origin·로그인 시도 제한 |
| `GET /api/auth/session` | 현재 관리자 및 필요한 CSRF 정보 | 미인증 401 |
| `POST /api/auth/logout` | 서버 세션 삭제·쿠키 만료 | 세션·CSRF 검증 |
| `GET /api/admin/contents`, `GET /api/admin/contents/:id` | 종류·검색·분류·게시 여부·페이지 / 전체 종류 상세 조회 | 활성 관리자 |
| `POST /api/admin/contents`, `PATCH /api/admin/contents/:id` | 콘텐츠·관계·첨부 연결 저장 | 관리자 + CSRF + 입력 검증 |
| `GET /api/admin/contents/:id/delete-impact` | 참조·파일 영향 표시 | 활성 관리자 |
| `DELETE /api/admin/contents/:id` | 확인한 대상 삭제 | 관리자 + CSRF + revision |
| `GET /api/admin/pages/:slug`, `GET /api/admin/home` | 고정 안내 / 메인 문안·노출 ID 선택 조회 | 활성 관리자, 미등록 페이지는 null |
| `PUT /api/admin/pages/:slug`, `PUT /api/admin/home` | 고정 안내 저장 / 메인 문안·이미지·선택 항목 동시 저장 | 관리자 + CSRF + revision |
| `GET /api/public/notice-categories`, `GET /api/admin/notice-categories` | 공개 공지 분류 / 전체 공지 분류 | 공개 / 관리자 |
| `GET /api/admin/content-categories?kind=...` | 종류별 전체 분류 | 활성 관리자 |
| `POST /api/admin/contents/preview` | 정화 HTML. 기존 `/notices/preview`도 유지, 미연결 이미지 URL은 관리자 권한 필요 | 관리자 + CSRF |
| `GET /api/admin/upload-config`, `GET /api/admin/files` | 허용 형식·한도 / 미연결 파일 최대 100건 | 활성 관리자 |
| `POST /api/admin/files` | multipart 원본 업로드, 미연결 파일 ID 반환 | 관리자 + CSRF + 업로드 제한 |
| `GET /api/files/:fileId?contentId=:id` | 첨부/이미지 읽기 | 연결된 콘텐츠의 공개 여부 또는 관리자 권한 확인 |
| `DELETE /api/admin/files/:fileId` | 미참조 파일 정리 | 관리자 + CSRF, 참조 중이면 409 |

구현된 공개 목록은 `{"data":[],"pagination":{"page":1,"pageSize":20,"total":0}}`, 상세·고정 페이지·프로그램·메인은 `{"data":...}`로 반환한다. 조회 조건 오류는 400, 없는/비공개 콘텐츠는 404, 내부 오류는 500이며 SQL·키·경로를 응답하지 않는다. 공개 조회는 관련 콘텐츠의 공개 여부도 다시 확인한다. 관리자 로그인 여부와 상관없이 같은 공개 정책을 적용할 구조다.

목록형 콘텐츠 변경 API는 `{"data":<ContentRecord>}`를 반환한다. 생성 201, 조회/수정 200, 삭제 204다. 고정 페이지 PUT은 200, 메인은 `{"data":{"page":<ContentRecord>,"items":[...]}}`를 반환한다. 오류는 `{"error":{"code":"VALIDATION_ERROR","message":"입력 안내"}}` 형태이며 필드별 객체는 사용하지 않는다. 401 미인증, 403 권한/CSRF, 409 수정 충돌/참조 중, 413 크기 초과, 415 형식 거부, 429 요청 제한을 구분한다.

내부 저장소는 안정적인 ID/slug와 종류별 필드·관련 ID·파일 연결을 받는다. 목록형 콘텐츠 HTTP 생성은 ID/slug를 서버가 생성하므로 이를 입력받지 않는다. 예: `{kind: "notice", title: "[예시] 안내", bodyHtml: "<p>[예시] 본문</p>", publication: "draft", fileLinks: []}`. 파일 연결은 `{fileId, role: "attachment" 또는 "body", altText}`이며 메인 페이지에만 이미지 `home` 역할 한 개를 허용한다. 수정에는 현재 `revision`을 전달하고 알 수 없는 필드를 거부한다. 파일 응답은 ID·원본명·크기·유형·연결 역할·설명을 제공하고 저장키·해시를 숨긴다. 다운로드는 ID 기반 서버 경로를 사용한다.

## 7. 인증·본문·파일 접근 원칙

- P-04의 `admin:create`/`admin:reset`은 대화형 터미널에서 비밀번호를 숨김 입력·재확인한다. 기본 계정/비밀번호가 없고 인수·환경변수·파이프 입력으로 비밀번호를 받지 않는다. 아이디는 대소문자 구별 없는 영문·숫자·점·밑줄·하이픈 3~100자, 비밀번호는 15~128자/UTF-8 최대 512바이트다. Node.js 내장 scrypt와 무작위 salt, timingSafeEqual을 사용한다. 변경 직전 DB 사본을 만들며 reset은 해당 계정의 모든 세션을 삭제하고 비활성 계정을 다시 활성화하지 않는다.
- 서버는 모든 관리 API에서 세션 유효기간과 관리자 활성 상태를 검사한다. 비밀번호 재설정 시 해당 관리자 세션을 무효화한다. 브라우저 플래그·localStorage는 인증 근거가 아니다.
- 세션 쿠키는 HttpOnly·SameSite=Lax·Path=/, Domain 미설정이다. 기본 로컬 HTTP는 Secure=false, 운영 HTTPS는 명시적 HTTPS `APP_ORIGIN`과 `COOKIE_SECURE=true`로 구분한다. `APP_ORIGIN` 미설정 시 루프백 주소와 PORT/DEV_PORT만 허용하며 Host/Forwarded에서 신뢰 출처를 만들지 않는다. 로그인·상태 변경 모두 세션 연계 CSRF와 정확한 Origin을 검사한다. 일반 GET 로그아웃은 없다.
- `migrations/002_auth.sql`은 로그인 전 CSRF를 위한 `pre_auth_sessions`(15분)와 영속 `auth_rate_limits`를 추가하며 기존 테이블·콘텐츠를 지우지 않는다. 로그인 성공 시 사전 세션을 소비하고 새 관리자 세션·CSRF를 발급한다. 관리자 세션은 기본 8시간 절대 만료이며 설정 범위는 300~86400초다. 만료·로그아웃·비밀번호 재설정 후 기존 세션은 거부한다. 서버 재시작이 세션·로그인 제한을 초기화하지 않는다.
- 15분당 로그인 IP 30회·아이디 8회, 새 사전 세션 발급 IP 60회로 제한한다(성공 포함). 비밀번호 검증 동시 실행은 최대 2개다. 존재하지 않는 아이디에도 동일한 비용의 해시 검증을 수행하고 실패 원문·해시·세션 토큰은 응답하지 않는다. 429는 Retry-After를 제공한다. 실제 운영 계정은 사용자가 CLI로 설정하며 테스트 비밀번호는 격리 시험에서만 무작위 생성한다.
- 구현 근거: [Node.js crypto scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback), [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). 공식 자료 확인과 실제 로컬 테스트 결과를 구분한다.
- P-05 공지에서 시작한 HTML 정화를 P-06의 모든 콘텐츠에 적용한다. 저장·미리보기·조회에서 `sanitize-html`로 문단·목록·표·안전한 링크·관리된 래스터 이미지만 허용하고 스크립트·이벤트·스타일·SVG·외부/data 이미지·위험한 URL을 제거한다. 이미지 URL은 허용된 파일 ID로 서버가 다시 만들고 공개 조회에서는 실제 본문 연결만 허용한다. HTML 입력과 간단한 서식 삽입 도구를 제공하며 미리보기는 저장·공개하지 않는다.
- 파일은 UUID 기반 저장키로 저장하며 원본명은 표시/다운로드 용도다. 파일 경로를 입력받지 않는다. 허용 확장자·시그니처/컨테이너 구조·크기·요청 개수를 검사한다. HWPX/DOCX ZIP은 구조와 압축 해제 크기 제한을 검증하며 MIME만으로 정상 파일을 거부하지 않는다. 이 검증을 악성코드 완전 탐지로 설명하지 않는다.
- 업로드 직후 미연결 파일은 관리자만 접근한다. 검증·쓰기 성공 후 메타데이터를 저장하고, 콘텐츠 저장 시 연결을 트랜잭션으로 확정한다. 실패한 작업이 공개된 깨진 링크를 만들지 않도록 보상 정리 절차를 둔다.
- 교체는 새 파일 ID를 만들고 해당 콘텐츠 연결만 바꾼다. 다른 콘텐츠가 참조하는 기존 파일은 보존한다. 연결 해제와 물리 삭제를 구분한다.
- 다운로드는 `contentId`와 `fileId`의 연결을 매번 확인한다. 비공개 전환된 콘텐츠의 기존 다운로드 URL은 거부한다. 같은 파일을 다른 공개 콘텐츠에서 공유 중이면 그 공개 콘텐츠 경로로는 계속 이용 가능하며, 삭제/비공개 확인에서 이 영향을 알린다.
- 한글 원본명은 안전한 `Content-Disposition`으로 전달한다. 파일 응답은 `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`를 적용하고 이미 내려받은 사본 회수를 보장하지 않는다.
- 실제 HWP/HWPX 시험 원본이 없으면 해당 형식의 정상 처리 검증은 ‘미검증’이다. 확장자만 바꾼 파일을 정상 파일 시험 증거로 쓰지 않는다.

P-05 실제 파일 제한은 요청당 1개·저장소별 동시 2개·관리자별 분당 30회다. ZIP은 최대 2,000개 항목, 해제 총량 기본 100MiB, 항목 1MiB 초과 시 1,000배 압축률을 제한하고 경로 조작·암호화·DTD를 거부한다. 특정 실행 확장자와 `vbaProject.bin` 이름도 거부하지만 모든 실행 파일/매크로를 탐지하지는 않는다. HWP5 CFB 검사는 암호 플래그·5초·worker 메모리 상한을 적용하고 PNG/JPEG/WebP는 전체 디코딩한다. PDF는 기본 구조 검사이며 암호화 여부·전체 문서 구문·악성코드를 검사하지 않는다. 세부 지원 범위는 README를 따른다. 파일은 단독 쓰기·fsync 후 DB 등록하며 실패 시 새 원본을 정리한다. 파일 삭제는 참조 확인·비공개 임시 이름·DB 트랜잭션으로 처리한다. 작업 중 프로세스 강제 종료로 남은 파일도 저장소 용량에 계산하며 임의 자동 삭제하지 않는다.

파일 응답은 `private, no-store, max-age=0`, Pragma no-cache, nosniff, 제한된 CSP를 사용하며 ETag·Last-Modified·부분 응답을 끈다. 미연결 목록/정리는 공지 편집 내부 기능으로 제공하며 별도 관리자 화면 유형을 추가하지 않는다. 구현 참고: [sanitize-html](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html), [busboy](https://github.com/mscdex/busboy), [yauzl](https://github.com/thejoshwolfe/yauzl), [sharp](https://sharp.pixelplumbing.com/api-constructor/), [한컴 HWPX 구조 안내](https://tech.hancom.com/hwpxformat/). 자료 열람·합성 구조 시험은 실제 HWP/HWPX 원본 검증을 대신하지 않는다.

## 8. 공개/관리자 UI 기준

네이비 `#17324D`, 민트 `#38B2AC`, 흰색·옅은 회색을 디자인 토큰으로 정의한다. 민트 배경의 작은 글자는 대비를 확보한다. 시스템 고딕체를 우선해 외부 폰트 접속 없이 읽을 수 있게 한다. 공식 로고가 없으므로 대학·사업단 명칭은 텍스트로 표시한다.

메인은 ‘내 전공에 AI를 더하다’와 절제된 연결 그래픽, 주요/최근 공지, 교육·프로그램, 서식 바로가기를 배치한다. 관리 화면은 좌측 메뉴·검색·표·폼 중심이며 통계 그래프와 큰 홍보 배너를 두지 않는다. 공통 헤더·현재 위치·문의처, 반응형 메뉴, 키보드 접근·포커스·레이블을 갖춘다. 빈 목록·검색 결과 없음·미등록·로딩·입력 오류·서버 오류를 구별한다.

P-02 공통 틀·P-03 DB 상태·P-04 로그인/관리 홈·보호를 유지한다. P-05의 ADM-06/07과 PUB-11/12에 이어 P-06에서 나머지 관리자 폼을 DB/API에 연결했다. 파일 선택창에서 돌아올 때 백그라운드 세션 확인이 편집 폼을 지우지 않으며 실제 만료·401은 권한을 해제한다. 등록·수정·취소·삭제 영향/확인·중복 요청 방지·서버 오류 안내와 관리자 미리보기를 제공한다. 교육·서식 상세, FAQ 순서, 문의처를 종류에 맞게 입력하고 관련 콘텐츠와 메인 노출은 ID 선택으로 저장한다.

P-07은 사업소개·조직/업무·협력·위치·참여 안내·FAQ를 공개 DB 조회에 연결한다. 기본 안내는 저장된 본문의 제목/문단/표/목록/조직도 이미지와 문의처·첨부를 표시한다. 페이지별 목적·교육 분야·추진내용 등의 구성은 관리자가 본문에 입력하며 실제 정보가 없는 자료를 자동 생성하지 않는다. 지도는 자동 접속하지 않고 확정된 주소/방문 안내 텍스트를 먼저 제공한다. 관련 콘텐츠는 공개 대상 ID만 경로로 연결하며 P-08에서 교육·프로그램·서식도 실제 상세 조회에 연결했다.

FAQ는 기존 목록 API의 10건 페이지 이동·검색·표시 순서와 상세 API를 사용한다. 질문은 키보드 Enter/Space로 여닫고 열 때 답변을 조회한다. `?item=ID` 직접 열람은 공개 FAQ 종류만 허용한다. 안내·FAQ·하단 문의처는 경로 이동/새로고침/탭 복귀 시 공개 여부를 다시 확인하며 로딩·조회 실패·404 입력 대기를 구분한다. 이전 요청 결과는 새 조회 중 표시하지 않고 실패하면 재시도를 제공한다. 이미 열린 페이지에 대한 서버 푸시나 내려받은 사본 회수 기능은 아니다. 공식 연락처·로고를 만들지 않는다.

P-08 메인은 공개된 관리자 소개·메인 이미지·주요 안내·선정 공지/교육/서식과 최근 공개 공지를 조합한다. 핵심 문구와 작은 AI 연결 SVG, 상단 서식 바로가기를 두고 공지 → 교육/프로그램 → 서식 → 공통 하단 순서를 유지한다. 긴 소개(본문 HTML 900자 초과)는 키보드로 펼쳐 읽으며 선정 목록은 영역당 처음 4건과 나머지 더보기로 제공한다. 이미지를 불러오지 못해도 제목·본문·선정 링크는 남는다. 홈 설정이 비공개면 해당 소개·이미지·선정 항목을 제외하며 다른 공개 공지의 최신 목록은 별도로 조회한다.

교육·프로그램 목록은 조회한 페이지의 DB 수준/유형별로 묶고 서식은 분류·제목·수정일 표로 표시한다. 검색·분류·10건 페이지 조건을 주소에 유지하며 빈 결과·범위 초과·서버 오류를 처리한다. 상세는 실제 종류와 slug/UUID를 확인하며 대상·운영·이수요건 또는 서식 작성/제출 필드, 본문·첨부·관련 ID를 표시한다. 공지 상세도 같은 공개 재조회·본문·첨부·관련 링크 도구를 사용한다. 원본 다운로드 권한은 기존 서버에서 매번 확인한다. 파일이 없으면 빈 안내를 표시하며 진행/모집 상태 배지는 만들지 않는다.

## 9. 로컬 실행 및 이관 전략

개발 프런트(기본 5173)는 `/api`를 로컬 API(기본 3000)로 프록시하며 쿠키·CSRF는 브라우저의 동일 출처로 처리한다. 빌드본은 Express 하나가 `dist/client`와 API를 제공하고 미인증 관리자 HTML 요청을 로그인으로 이동시킨다. Vite 개발 화면에서는 공통 클라이언트 보호 경로가 표시를 제어하고 모든 데이터/API 권한은 서버가 검증한다. API·비공개 경로·누락 자산 오류는 SPA fallback이 덮지 않는다.

현재 구현한 스크립트는 `dev`, `build`, `start`, `typecheck`, `test`, `test:browser`, `db:migrate`, `db:seed`, `db:status`, `admin:create`, `admin:reset`, `content:export`, `content:import`이다. README에 설치·DB 초기 준비·계정 설정·실행·빌드·Ctrl+C 종료 방법과 환경변수 예시를 기록한다. 최초 의존성 설치 후 로컬 실행에 외부 계정·클라우드 연결이 필요하지 않으며 외부 폰트/CDN을 사용하지 않는다.

`content:export`, `content:import`는 `scripts/content.ts`와 `src/server/transfer/`의 로컬 명령이다. 명령·복원 환경 설정·논리 형식 v1은 [README](../README.md#콘텐츠-내보내기빈-환경-복원)를 따른다. 관리자 메뉴나 원격 이관 API를 추가하지 않는다. 마이그레이션·관리자 변경 전 SQLite 사본은 계정·세션을 포함할 수 있는 비공개 로컬 복구용이며 아래 P-09 콘텐츠 이관 패키지와 다르다.

P-09 패키지는 manifest.json과 files/ 원본으로 구성한다. 형식명 bootcamp-content, formatVersion=1, schemaVersion=002와 마이그레이션 체크섬, 콘텐츠 관련 9개 테이블의 모든 열, 파일별 상대 저장키·크기·SHA-256을 기록한다. 초안·비공개·미연결 등록 파일을 포함하며 관리자·비밀번호 해시·세션·인증 제한·seed 이력·환경변수·키·DB 파일은 제외한다. 일반 이관 패키지도 비공개 자료이므로 Git 제외 영역에 보관한다.

내보내기는 SQLite BEGIN IMMEDIATE 쓰기 잠금 안에서 논리 행과 원본을 동기적으로 읽어 같은 시점의 자료를 묶는다. 기존 앱의 업로드·삭제도 같은 DB 쓰기 트랜잭션을 사용하므로 잠금 중 변경이 대기/실패한다. 별도 프로세스 유지보수 잠금을 도입한 것은 아니며 외부 도구의 직접 파일 변경은 허용하지 않는 운영 절차다. 완성 전 임시 패키지를 성공한 출력으로 표시하지 않고 기존 출력 폴더는 덮어쓰지 않는다.

복원 명령은 --db와 --uploads를 명시해야 한다. 새 DB 또는 현재 마이그레이션만 적용된 완전히 빈 DB와 새/빈 원본 폴더를 대상으로 하며 관리자·seed 이력 등 기존 자료가 있으면 충돌로 중단한다. 전체 패키지의 키·버전·스키마·ID/관계·경로·파일 크기/해시 및 실제 형식을 임시 영역에서 검증한다. 기존 빈 DB는 파일 준비 후 하나의 DB 트랜잭션으로 반영한다. 새 DB는 WAL을 정리한 완성 DB를 같은 파일시스템의 하드 링크로 원자적으로 연결해 기존 대상을 덮어쓰지 않는다. 실패나 강제 종료 시 불완전한 콘텐츠를 공개하지 않는다. 잔여 임시/미연결 파일이 있으면 자동 삭제 대신 새 빈 경로를 사용한다. ID·slug·revision·날짜·저장키를 유지하고 복원 후 새 관리자를 숨김 입력 CLI로 설정한다.

| 전환 대상 | 유지할 부분 | 변경·검증할 부분 |
|---|---|---|
| Replit 임시 운영 | 프런트/API 계약·콘텐츠 ID·이관 포맷 | 빌드/시작 명령, PORT/바인딩, HTTPS 쿠키, 비밀 주입, 영속 DB/파일 저장소, 재시작/재배포 유지 |
| Cloudflare Pages | 프런트 정적 산출물·라우팅·디자인 | API 주소/프록시, 직접 URL 라우팅, 출처·쿠키 정책 |
| Workers | 입력 검증·접근 정책·API 의미 | Express/Node HTTP·파일시스템·암호 라이브러리 의존과 스트리밍 구현 |
| D1 후보 | 콘텐츠 ID·관계에 해당하는 논리 데이터 모델 | SQLite 드라이버를 D1 접근 모듈로 교체, SQL/제약/트랜잭션/마이그레이션 호환성 |
| R2 | 파일 ID·원본명·상대 저장키 | 로컬 fs 저장소를 R2로 교체, 권한 검사 다운로드·캐시·실패 복구 |
| 운영 관리자 인증 | 지정 관리자만 변경하는 정책 | 공급자 미확정. 인증·세션 모듈 교체 및 서버 권한 재검증 |

Replit은 게시 앱 파일시스템에 쓴 데이터에 의존하지 말라고 안내한다. 로컬 SQLite/업로드 복사만으로 운영 영속성을 보장하지 않는다. [Replit 공식 Publishing 안내](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments)

D1은 원시 SQLite 파일을 그대로 가져오지 않으며 SQL 변환과 호환 확인이 필요하다. D1 선택과 실제 이관은 후속 결정이다. [Cloudflare 공식 가져오기/내보내기 안내](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

## 10. 다음 단계 진입 조건

P-02의 패키지/잠금 파일, 루프백 실행 골격, 28개 화면 유형의 공통 UI와 32개 경로, 직접 접속/새로고침·PC/모바일 검수 이력을 유지한다. P-03은 실제 DB·마이그레이션·예시 seed·접근 계층·공개 조회 API를 구현했다. 최종 타입 검사·빌드, 서버/DB 테스트 24개(저장소·seed 9, 마이그레이션 6, 실제 서버 프로세스 2, HTTP 서버 7)가 통과했으며 저장·수정 후 실제 서버 종료/재시작에도 조회 결과가 유지됐다. 기본 작업 DB의 마이그레이션과 예시 9건 입력·재실행, 빌드본 브라우저 6개 및 개발 서버 브라우저 1개 검수도 통과했다. 실행 명령·사용 포트와 후속 미구현 범위는 BUILD_PROGRESS에 기록했다.

P-04는 타입 검사·빌드, 서버/DB 42개, Chrome 브라우저 18개와 개발 모드 실제 인증 흐름 검증을 통과했다. 기존 작업 DB의 12개 데이터 테이블 해시를 보존하며 002 마이그레이션만 추가했고 재실행 무변경을 확인했다. 이후 사용자가 최초 관리자 설정을 완료했고 2026-10-14 최종 확인에서 관리자 1개 활성·scrypt 설정·유효기간 내 세션 1건과 DB 무결성을 확인했다. 새 환경의 최초 계정은 숨김 입력 CLI로 직접 설정한다.

P-05는 공지 CRUD·HTML 정화·한글 원본 다운로드·공유/비공개 파일 정책·서버 재시작을 실제 격리 DB/파일/브라우저로 확인했다. P-06은 모든 관리자 콘텐츠 유형을 추가했고 빌드·서버 72/72·브라우저 36/36과 개발 프록시 검증을 통과해 완료했다. P-07은 공개 기본정보·참여 안내·FAQ 6개 화면을 연결했고 최종 빌드·서버 72/72·Chrome 51/51을 통과했다. 1440·390·320px에서 관리자 변경 반영·공개 필터·미등록 안내·직접 접속·메뉴·FAQ 키보드 열람을 확인했고 Vite 개발 환경에서도 공개 조회·문의처·이미지·한글 PDF 권한을 검증했다. 공지 이미지 업로드가 다른 입력 위치의 포커스를 빼앗던 문제도 보완했다. 실제 DB 15개 테이블·계정·기존 자료를 보존했으며 상세 증거와 초기 실패·수정 기록은 최신 BUILD_PROGRESS를 따른다.

P-08은 남은 메인·교육/프로그램·서식과 기존 공지의 관련 ID 연결을 완성했다. 최종 빌드·서버 73/73·Chrome 66/66을 통과했고 Vite 개발 환경의 전체 다운로드 흐름과 긴 메인 소개/더보기의 320px 키보드 접근도 확인했다. 관리자 수정 반영·제목 변경 주소 유지·공개 필터·상세 직접 접속/새로고침을 검증했으며 실제 DB 15개 테이블과 계정·자료를 보존했다.

실제 HWP/HWPX 원본 호환성은 별도 미검증 항목으로 유지하되 P-08 완료의 차단 조건으로 삼지 않는다. 업무에 해당 형식을 사용하거나 전체 검수를 완료하기 전에는 실파일 검증이 필요하다. P-09는 최종 빌드와 서버/DB/이관 **122/122** 시험을 통과했다. 13개 콘텐츠·9개 논리 테이블·4개 원본을 별도 환경에 복원하고 본문·게시 여부·관련 ID·파일 해시, 새 관리자 생성/재설정 후 편집·공개 다운로드·재시작을 확인했다. 실제 작업 DB 9개 콘텐츠의 CLI 왕복 복원도 일치하며 원본 DB 15개 테이블·업로드·my_admin 계정을 보존했다. 실패/프로세스 강제 종료 시 부분 SQL 롤백과 불완전 복원 비노출도 검사했다. 새 UI/관리 메뉴/API·의존성·마이그레이션은 추가하지 않았으며 기존 UI 브라우저 66건은 이번 단계에서 재실행하지 않았다. P-10에서 빌드, 기존 서버 122/122와 신규 오류 복구 3/3, 브라우저 69개 고유 사례의 최종 통과를 확인했다. 신규 브라우저 검사에서 누락한 세로 스크롤을 보완하고 영향받는 3개 폭만 재검했으며 제품 코드는 변경하지 않았다. 공개 15개/관리자 13개 코드·주소·동작 대응과 실제 렌더링, DB 15개 테이블/계정/업로드 보존을 확인했다. 격리 Git 제외 규칙 39/39와 후보 소스 검사는 통과했지만 실제 저장소가 없어 Git index/history는 미검증이다. 실제 한컴 원본 호환성도 남아 전체 최종 완료로 표시하지 않는다. 현재 도구 환경은 Windows 10.0.26300.0·Chrome 154.0.8037.98·Python 3.15.0이며 실물 모바일/다른 사용자 PC 검증과 구분한다. 상세 판정과 실행별 근거는 [LOCAL_ACCEPTANCE.md](LOCAL_ACCEPTANCE.md)를 따른다. 다음 범위는 **P-11 로컬 실행본 확정·인수인계**이며 이 문서에 남은 미검증을 함께 넘긴다. D1/R2 호환 시험과 외부 배포는 수행하지 않았다.

## 11. 로컬 인계 기준본과 후속 경계

P-11에서 Node24.21.0·npm11.19.0을 package/lock engines와 일치시켰다. 기존 의존성·스키마·seed는 그대로다. source:package는 실데이터 없는 새 폴더와 파일 hash 목록을 만든다. README의 PowerShell 절차로 두 소스 폴더를 각각 설치·빌드하고 실제 TTY 관리자 생성/재설정, 3종 자료·공유 한글 PDF·관계·재시작·별도 복원을 확인했다. 관리자 설정 후 스트림이 남아 CLI가 종료하지 않던 문제를 수정하고 자연 종료0을 확인했다. 실제 계정·자료는 보존했다.

최종 소스는 `.cache/releases/source-handoff-p11-20261015/`, 현재 로컬 콘텐츠 보존본은 `var/backups/content-handoff-p11-20261015/`로 분리한다. 시험 fresh 폴더에는 DB/관리자가 생성됐으므로 소스 전달본으로 공유하지 않는다. 운영 커밋·기준 콘텐츠·편집 동결/회수는 Replit 기록표에서 실제 작업 시 확정한다. 후속 승인으로 로컬 Git `main`을 구성했다. 소스 기준 커밋은 `9c104077f93988d3171d262abce4201bf088e556`이며 최신 기록 커밋은 README의 Git 명령으로 확인한다. 기존 소스 전달본/ZIP은 Git 정리 전 보존본이다. 추가 승인으로 기존 공개 [Nawii06/boot_page](https://github.com/Nawii06/boot_page)를 `origin`에 연결하고 `main`의 최초 push 커밋 `4d7c046171cea4b0f11a624268ae9b06917f0d0c`을 원격 조회와 대조했다. 후속 문서 변경은 별도 커밋으로 기록한다. 실제 앱 배포 커밋은 미정이며 Replit/Cloudflare Publish·원격 DB 변경은 수행하지 않았다.

한컴 원본·별도 PC/빈 캐시·실물 모바일·운영 HTTPS는 미검증/후속 범위다. 실제 Git 추적·이력 검사는 후속 기록의 확인 범위에서 통과했다. 도구의 Ctrl+C 전송은 Windows 콘솔 제어 이벤트로 확인하지 못했고 재시작은 소유 PID 종료로 검증했다. 실제 키보드 Ctrl+C는 별도 확인한다. 로컬 인계를 Replit 영속성이나 Workers 무수정 호환/배포 완료로 해석하지 않는다.
