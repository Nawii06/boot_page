# Replit 후속 작업 인수인계

작성·공식 문서 확인일: 2026-10-15 (Asia/Seoul)

이 문서는 **향후 Replit 준비사항**이다. 이번 P-11에서 Replit 앱·저장소를 만들거나 Publish·원격 DB 변경을 수행하지 않았다. 로컬 재현 결과는 [README](../README.md), 28개 화면과 남은 검수 항목은 [LOCAL_ACCEPTANCE](LOCAL_ACCEPTANCE.md)를 따른다. 실제 한컴 HWP/HWPX 원본 호환성은 미검증으로 유지한다. 이후 승인된 로컬 Git 정리에서 실제 index/history 검수는 통과했으며 [추가 검수 기록](LOCAL_ACCEPTANCE.md)을 따른다.

## 1. 가져갈 실행본과 콘텐츠

- 소스 실행본: 코드, `package.json`, `package-lock.json`, `.node-version`, `.npmrc`, `.env.example`, 마이그레이션, 명백한 예시 seed, 문서, 디자인 자산, 테스트. Node `24.21.0`·npm `11.19.0`과 잠금 파일을 유지한다. Windows `node_modules`·빌드본을 Linux 실행 의존성으로 복사하지 않는다.
- 콘텐츠 패키지: `manifest.json`과 `files/<상대 저장키>`를 별도 비공개 전달한다. `bootcamp-content` 형식 버전 1, 스키마 버전, 마이그레이션 체크섬, 9개 논리 테이블, 파일 크기·SHA-256이 포함된다. 초안·비공개·문의처·미연결 업로드도 포함하므로 공개 GitHub에 넣지 않는다.
- 제외: `.env`, DB/WAL/SHM, 계정·비밀번호 해시·세션, 업로드 원본, 백업, 로그, 캐시. 일반 콘텐츠 패키지는 인증 정보를 제외하므로 새 환경의 지정 관리자를 별도로 설정한다.
- 현재 프로젝트 루트는 승인된 로컬 Git `main` 저장소다. 소스 기준 커밋은 `9c104077f93988d3171d262abce4201bf088e556`이고 이후 검수 문서 커밋을 별도로 기록했다. 배포할 커밋은 실제 배포 준비 시 선택하며 현재 로컬 HEAD를 운영 기준본으로 자동 확정하지 않는다. 추가 승인에 따라 기존 공개 [Nawii06/boot_page](https://github.com/Nawii06/boot_page)를 `origin`으로 연결하고 `main` push를 완료했다. GitHub 소스 게시와 Replit 앱 Publish는 구분하며 앱 Publish·원격 DB 변경은 수행하지 않았다.

## 2. 빌드·시작과 포트

현재 소스의 Node 실행 명령은 다음과 같다. **Replit/Linux 셸용 `npm`**이며 Windows PowerShell 절차는 README의 `npm.cmd`를 사용한다. 아래 명령만으로 영속 저장소 연결까지 완료되는 것은 아니다.

```sh
node --version
npm --version
npm ci
npm run build
npm start
```

설치는 빌드에 필요한 개발 의존성도 포함해야 한다. 빌드는 타입 검사·Vite 프런트·서버 컴파일을 수행하고, 시작은 `node dist/runtime/server/index.js`다. `dist/client`와 `/api`를 Express 한 프로세스가 제공하므로 게시용으로 Vite 개발 서버를 띄우지 않는다. 빌드 설정은 `npm ci` 후 `npm run build`, 시작 설정은 `npm start`로 구분한다. Replit의 build/run 설정은 [App Configuration](https://docs.replit.com/features/project-setup/configuration)을 따른다.

현재 [config.ts](../src/server/config.ts)와 [index.ts](../src/server/index.ts)가 읽는 값은 다음과 같다. 운영 값은 게시 환경 설정에 입력하며 예시 파일에 실제 주소·비밀값을 저장하지 않는다.

| 설정 | 게시 환경에서 결정할 값 / 검증 |
|---|---|
| `HOST` | `0.0.0.0` |
| `ALLOW_NETWORK` | `true`. 없으면 비루프백 바인딩을 거부함 |
| `PORT` | 실제 게시 내부 포트와 동일한 정수. 미설정 기본값은 3000이며 플랫폼이 제공한 값도 그대로 읽음 |
| `DEV_PORT` | 게시에 개발 서버를 사용하지 않아도 현재 설정 검증상 PORT와 달라야 함. 기본 5173 |
| `APP_ORIGIN` | 실제 브라우저의 HTTPS 출처 하나. 경로·끝 슬래시 없음. 개발 Preview와 Publish 주소를 혼용하지 않음 |
| `COOKIE_SECURE` | `true`. HTTPS APP_ORIGIN과 함께 지정 |
| `SESSION_TTL_SECONDS` | 기본 28800초. 300~86400초 범위에서 결정 |
| 업로드 제한 변수 | README의 파일당/총량/ZIP/이미지/콘텐츠당 제한을 유지하고 플랫폼 한도와 함께 재검 |
| `DB_PATH`, `UPLOAD_DIR`, `BACKUP_DIR` | 현재 로컬 파일 어댑터용 경로다. 관리형 DB 연결 문자열이나 버킷 이름을 이 값에 넣어 연결할 수 없음 |

공식 포트 안내는 외부 접근에 내부 포트 매핑과 `0.0.0.0` 수신이 필요하며 Autoscale/Reserved VM의 외부 노출 포트는 하나라고 설명한다. 선택한 게시 환경에서 내부 포트와 외부 HTTP 연결을 확인한다. 기본 루프백 설정은 로컬에서 그대로 유지한다. [Replit Ports](https://docs.replit.com/features/project-setup/ports)

종료는 셸의 `Ctrl+C` 또는 플랫폼의 정상 중지로 수행한다. 현재 서버는 SIGINT/SIGTERM에서 연결과 DB를 닫는다. 마이그레이션·seed·관리자 생성·콘텐츠 import를 매 시작 명령에 붙이지 않는다. 빌드·시작 성공만으로 데이터 유지나 관리자 인증 성공을 판정하지 않는다.

## 3. Publish 전에 필요한 영속 저장소 결정

**게시 앱 파일시스템에 SQLite와 업로드 폴더를 두는 것만으로 영속성을 보장하지 않는다.** Replit 공식 문서는 게시 실행을 개발 편집기와 분리된 스냅샷으로 설명하며 게시 파일시스템의 기록에 의존하지 말라고 안내한다. Reserved VM의 상시 실행도 이 프로젝트의 데이터 보존 검수를 대신하지 않는다. [Publishing](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments)

후속 구현 후보는 관리형 PostgreSQL에 콘텐츠·관계·파일 메타데이터·인증 상태를 저장하고 App Storage에 원본을 저장하는 구성이다. Replit은 관리형 SQL DB와 영속 객체 저장소를 제공한다. 이는 이번 단계에서 연결하거나 검증한 구성이 아니다. [Database](https://docs.replit.com/features/data-and-storage/sql-database), [App Storage](https://docs.replit.com/features/data-and-storage/object-storage)

| 현재 코드 | Publish 전 변경·검증할 사항 |
|---|---|
| `src/server/db/`, `repositories/contentRepository.ts` | `better-sqlite3` 동기 질의·SQLite SQL·트랜잭션을 선택한 DB 드라이버로 변경. ID/slug/revision, 외래키, 고유값, 조회·저장 원자성을 유지 |
| `src/server/auth/`, `scripts/admin.ts` | 세션·사전 CSRF·시도 제한·계정 생성/재설정을 같은 영속 DB로 연결. 현재 CLI는 로컬 SQLite만 지원 |
| `src/server/files/service.ts`, `http/files.ts` | fs 쓰기·rename·sendFile을 비공개 객체 put/get/delete로 교체. 저장키 유지, 요청마다 콘텐츠 공개 여부/관리자 권한 검사, 한글 파일명·no-store 유지 |
| `src/server/transfer/`, `scripts/content.ts` | 관리형 DB/객체 저장소용 import와 export 양방향 구현. 현재 CLI는 로컬 SQLite·파일 경로 전용이며 `DATABASE_URL`이나 버킷을 읽지 않음 |
| `src/server/files/formats.ts`, `hwpValidation.ts` | Linux의 sharp·ZIP·HWP worker 검증, 네이티브 모듈 설치, 자원 제한 확인. 검사를 제거해 설치 문제를 우회하지 않음 |
| SQLite 잠금에 묶인 파일 저장·내보내기 | DB와 객체 저장소에 하나의 공통 트랜잭션이 있다고 가정하지 않음. 비공개 임시 객체→검증→메타데이터/연결 확정과 실패 정리, 내보내기 동안 서버 변경 차단을 구현·시험 |

편집기 DB와 게시 DB, 시험 버킷과 게시 버킷을 식별해서 기록한다. 다중 인스턴스가 가능하면 현재 프로세스 내 업로드 동시 제한을 전체 제한으로 오해하지 않도록 공유 제한·총량 경쟁을 검증한다. 저장소 선택·어댑터 구현·복원 검증 전에는 실제 운영 콘텐츠 편집을 허용하는 게시본으로 판단하지 않는다.

## 4. 비밀값·관리자·HTTPS

Replit의 Secrets에는 향후 DB 연결 문자열·저장소 자격 증명 등 **실제 어댑터가 사용하는 값만** 넣는다. 비민감 설정은 Configurations로 구분한다. 현재 앱에 임의 `SESSION_SECRET` 또는 `ADMIN_PASSWORD`를 추가하지 않는다. 현재 세션은 서버 DB의 무작위 토큰 해시이며 관리자 비밀번호는 숨김 입력 CLI로 설정한다. 비밀값을 셸 환경 전체 출력·로그·프런트 빌드 변수에 포함하지 않는다. [Secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets)

새 영속 DB용 관리자 생성/재설정 절차가 구현된 후 비밀번호 숨김 입력과 이전 세션 무효화를 확인한다. 현재 로컬 `admin:create`를 Replit 편집기에서 실행했다고 게시 DB에 계정이 생긴 것으로 간주하지 않는다. 일반 회원가입·학교 SSO·추가 계정 관리 화면은 이관 범위에 추가하지 않는다.

현재 [auth.ts](../src/server/http/auth.ts)는 쿠키에 HttpOnly·SameSite=Lax·선택적 Secure를 지정하고 정확한 Origin과 CSRF를 확인한다. 프록시 뒤에서도 HTTPS 쿠키, 로그인/로그아웃, 만료, 익명 변경 거부를 재검한다. 현재 Express는 `trust proxy`를 설정하지 않아 IP 제한에 프록시 IP가 들어갈 수 있다. 실제 프록시 구조를 확인한 후 신뢰 범위를 한정해 해결하며 임의 `X-Forwarded-For`를 그대로 신뢰하지 않는다. 도메인 변경 시 APP_ORIGIN을 맞추고 기존 세션은 재로그인하게 한다.

## 5. 콘텐츠 가져오기와 변경자료 회수

현재 실행 가능한 로컬 명령은 README의 `content:export`와 `content:import`다. 원본 편집을 멈추고 새로운 패키지명을 사용한다.

```powershell
npm.cmd run content:export -- --output ./var/backups/replit-baseline-20261015
Get-FileHash -LiteralPath ./var/backups/replit-baseline-20261015/manifest.json -Algorithm SHA256
```

이 명령은 **실행 예시**다. 문서 작성 때문에 운영 기준본을 새로 생성한 것으로 보지 않는다. 기준본의 생성 시각·manifest 해시·콘텐츠/파일 수와 비공개 보관 위치를 아래 표에 기록한다. manifest 해시는 파일별 해시가 든 메타데이터를 식별하며, 파일 원본 일치는 import의 크기/SHA-256 검사로 함께 확인한다.

후속 가져오기는 선택한 저장소용 importer 구현 후 빈 게시 DB·새 객체 영역에서 수행한다. seed와 관리자 생성은 콘텐츠 복원보다 먼저 실행하지 않는다. 기존 데이터가 있으면 충돌로 중단하며 자동 병합·덮어쓰기를 하지 않는다. import 완료 전 외부에서 일부 콘텐츠를 읽을 수 없게 한다. 콘텐츠 수·본문·게시 여부·관련 ID·파일 저장키와 SHA-256이 기준본과 같을 때 새 관리자를 설정한다.

Replit에서 편집을 시작한 뒤에는 그 게시 환경이 새 변경자료의 기준본이다. 로컬 옛 패키지로 재배포 때 덮어쓰지 않는다. 회수 시 게시 편집을 서버 측에서 동결하고 DB·객체 저장소를 함께 export한 뒤, 인증 정보를 제외한 같은 논리 형식으로 로컬 **새 빈 환경**에 복원한다. 현 importer는 마이그레이션 버전·체크섬 일치를 요구하므로 후속 스키마 변환이 있다면 호환 변환기를 함께 준비한다. 삭제·비공개·파일 교체도 변경자료에 포함한다. 부분 증분 병합 기능은 현재 없으므로 원본과 대상의 동시 편집을 허용하지 않는다.

## 6. 게시 후 별도 수행할 검수

아래 항목은 **Replit에서 아직 미검증**이다. 실행 일시·배포 ID·결과·증거 경로를 기록하고 통과한 항목만 완료로 표시한다.

1. 고정 버전 설치·Linux 네이티브 모듈·빌드·단일 포트·`/api/health` 및 직접 주소/새로고침 확인.
2. 새 관리자 로그인→공지/교육/서식 등록→익명 공개 조회→한글 파일 다운로드→수정→비공개/직접 첨부 거부→삭제.
3. HTTPS의 쿠키·Origin/CSRF·로그아웃 이전 세션·시도 제한, 임의 프록시 헤더의 권한/제한 우회 거부.
4. 정상 종료/재시작, 새 코드 재배포, 선택한 방식의 인스턴스 교체 후 본문·관계·파일 해시 및 편집 상태 유지. 시작 시 seed/import 반복 주입이 없는지 확인.
5. 실제 HWP/HWPX 원본을 확보하면 원본 업로드/다운로드·해시·비공개·복원 시험을 별도 수행. 합성 구조 시험은 호환성 완료 증거가 아님.
6. 내보내기·빈 환경 복원·관리자 재설정·편집·다운로드, 중단/충돌 시 불완전 복원 차단. 데이터 회수까지 확인 후 사용 종료/다음 플랫폼 전환 판단.

## 7. 배포 시 작성할 기록표

| 항목 | 현재 상태 / 실제 작업 때 기록할 값 |
|---|---|
| 소스 저장소·브랜치·전체 커밋 SHA | 로컬 `D:\boot_page`, `origin`=[Nawii06/boot_page](https://github.com/Nawii06/boot_page), `main` push 완료. 소스 기준 `9c104077f93988d3171d262abce4201bf088e556`, 최신 SHA는 README 명령으로 조회. 앱 배포 커밋은 미정이며 실제 배포 시 선택한 전체 SHA와 미커밋 변경 유무 기록 |
| 소스 실행본 식별 | 전달 파일명·SHA-256·Node/npm/잠금 파일 해시·빌드 결과 |
| 게시 실행 환경 | Replit 앱/배포 ID·유형·URL·설치/기동 명령·포트·배포 일시 |
| 비밀값 | 이름·설정 위치·관리 담당자만 기록. 값은 이 문서에 기록하지 않음 |
| DB/파일 저장소 | 개발/운영 구분·DB 식별자·버킷/접두사·어댑터 버전·스키마 버전 |
| 최초 운영 데이터 기준본 | 비공개 패키지 위치·export 시각·manifest SHA-256·콘텐츠/파일 수·파일 해시 검수 결과 |
| 편집 권한 전환 | 로컬 동결 시각→복원 검수→Replit 편집 시작 시각, 담당자 |
| 변경자료 회수 | Replit 동결 시각·최종 export 패키지/해시·새 로컬 복원 위치·일치/편집/다운로드 결과 |
| 원복 | 직전 소스 커밋 및 호환 데이터 기준본·전환 담당자·재개 시각. 코드만 되돌려 새 편집 자료를 잃지 않도록 최종 회수본 보존 |
| 검수·남은 문제 | 28개 화면 검수 증거·HWP/HWPX·실제 Git 검사·운영 HTTPS/영속성 결과 |

전환 실패 시 양쪽 편집을 멈추고 직전 안전한 실행 환경과 **검증된 데이터 쌍**으로 복구한다. 기존 대상 DB·파일을 자동 삭제하거나 현재 작업 폴더를 덮어쓰는 절차는 제공하지 않는다. 다음 플랫폼의 변경 지점은 [CLOUDFLARE_HANDOFF](CLOUDFLARE_HANDOFF.md)를 참고한다.

## 8. ZIP 백업 이후 로컬 준비 점검 — 2026-10-15

P-11 시점의 작업본은 `var/backups/workspace-20261015073343-f83734d7/`에 소스 ZIP과 개인 복구 ZIP으로 분리했다. 개인 복구본은 실제 관리자 DB를 포함하므로 Replit 소스 업로드 대상으로 쓰지 않는다. 백업 직후에는 **로컬 사전 점검과 전환 범위 정리**를 수행했다. 이후 사용자가 Git 정리를 선택해 로컬 저장소·커밋을 구성했으며, 그 작업 당시 Publish·원격 DB·원격 저장소는 생성하지 않았다. 뒤이은 별도 승인으로 기존 GitHub 저장소에 `main`을 push했으며 앱 Publish·원격 DB 변경은 수행하지 않았다. 아래 후보는 아직 선택/구현 완료가 아니다.

| 다음 작업 | 실제 변경 대상 | 먼저 확정할 것 / 완료 증거 |
|---|---|---|
| 영속 저장소 결정 | 현재 `config.ts`는 로컬 DB/파일 경로만 받음 | 관리형 PostgreSQL+App Storage 후보 또는 검증할 다른 영속 저장소, 시험/운영 분리. 자격 증명 값은 문서에 넣지 않음 |
| DB 접근 전환 | `db/connection.ts`, `ContentRepository`, `AuthService`, `adminAccounts`, `FileService`의 직접 `prepare`/transaction | SQLite와 새 드라이버를 구분하는 작은 접근 계층, 비동기 처리 경계. revision·관련 행·로그아웃/재설정·시도 제한이 경쟁 요청에서도 원자적으로 유지되는 시험 |
| 파일 접근 전환 | `FileService`와 `http/files.ts`의 로컬 쓰기/읽기/rename/삭제 | 비공개 객체 저장소, 기존 ID/저장키 유지. 업로드 실패·공유 파일 교체·누락·총량 경쟁·비공개 전환 직후 직접 주소 차단 |
| 양방향 이관 | `transfer/index.ts`, `scripts/content.ts`, `scripts/admin.ts` | 형식v1을 새 DB에 넣고 다시 내보내는 변환기. 새 빈 로컬 환경에서 전체 표·본문·관계·파일hash 일치 및 새 관리자 편집/다운로드 |
| 게시 설정·실제 검수 | 호스트/포트/Origin/쿠키, 신뢰할 프록시, 선택한 게시 방식 | 실제 HTTPS 출처·게시 내부 포트·인스턴스 수 결정. 시작/재배포 후 유지와 소스/데이터 회수까지 통과한 뒤 게시 판단 |

서버가 타입상 동기 SQLite에 직접 의존하므로 DB 주소 변수만 추가하는 변경으로 완료되지 않는다. 위 순서대로 범위를 나누고 기존 로컬 경로와 콘텐츠 계약을 유지한다. UI 전면 재작성·일반 회원·대시보드를 추가하지 않는다. 저장소 결정 전 임의의 원격 계정/DB를 만들거나 두 저장소를 동시에 운영하는 기능을 구현하지 않는다.

남은 로컬 확인도 실제 자료 기준으로 유지한다. 현재 프로젝트 내부에 HWP/HWPX 원본은 0개라 해당 호환성 시험을 실행할 수 없다. 실제 Git index/history는 후속 로컬 커밋 정리에서 검사해 통과했다. 다른 개인 폴더의 파일을 임의로 가져오지 않았다. 실제 키보드 Ctrl+C는 사용자 터미널에서 확인할 항목이며 자동화의 PID 종료·재시작 증거와 구분한다. 이 항목을 완료로 바꾸지 않고 위 전환 준비와 병행한다.
