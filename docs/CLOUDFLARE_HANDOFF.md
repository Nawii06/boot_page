# Cloudflare 후속 작업 인수인계

작성·공식 문서 확인일: 2026-10-15 (Asia/Seoul)

목표 구성은 **Pages 프런트 + Workers API + 게시물 DB(D1 후보) + 비공개 R2 + 지정 관리자 인증**이다. 이번 P-11은 변경 지점과 검수 기준을 정리하는 단계다. Cloudflare 프로젝트·DB·버킷·비밀값·도메인 설정이나 배포는 수행하지 않았다. 로컬 실행 검증을 Workers 호환 검증으로 해석하지 않는다.

기준은 [PROJECT_CONTEXT](PROJECT_CONTEXT.md), [README](../README.md), [28개 화면 및 미검증 목록](LOCAL_ACCEPTANCE.md)이다. 실제 한컴 작성 HWP/HWPX 원본 호환성은 미검증으로 유지한다. 실제 Git 추적/이력은 후속 승인된 로컬 커밋 정리에서 검사해 통과했으며 상세 범위는 검수표를 따른다. 추가 승인으로 기존 [GitHub 저장소](https://github.com/Nawii06/boot_page)를 `origin`에 연결하고 `main` push를 완료했다. Cloudflare 앱 배포·원격 DB 변경은 수행하지 않았다.

## 1. 프런트와 API 경계

현재 `npm.cmd run build`는 타입 검사, Vite 정적 프런트 `dist/client`, Node 서버 `dist/runtime`를 함께 만든다. Pages에 전달할 정적 산출물은 **`dist/client`만**이다. DB·업로드·콘텐츠 백업·서버 실행파일을 정적 자산에 포함하지 않는다. 프런트는 기존 React·라우트·디자인을 유지하며 서버 의존성을 Workers 번들에 무조건 포함하지 않는다.

현재 `/api` 상대 주소와 동일 출처 쿠키를 유지할 수 있도록, 최종 사용자 도메인의 `/api/*`를 Workers로 연결하는 구성을 우선 검토한다. 이는 아직 구현하지 않은 라우팅 결정이며 Pages와 Worker를 각각 배포하는 것만으로 자동 연결되지 않는다. Pages의 기본 SPA 동작은 최상위 `404.html`이 없을 때 정적 파일에 대응하지 않는 경로를 루트로 보내므로 API 오류까지 `index.html`로 응답하지 않도록 API 경계를 먼저 구성한다. [Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)

공개 상세·관리자 직접 주소와 새로고침, 없는 경로의 404 정책을 다시 검수한다. 현재 Express는 미인증 `/admin` HTML 요청을 로그인으로 이동시킨다. Pages의 정적 관리자 화면 파일 자체에는 비밀 데이터가 없지만 같은 리다이렉트 동작이 필요하면 Worker/Functions 경계에서 구현한다. **데이터 조회·모든 변경·파일 권한은 항상 API 서버에서 검증**하며 프런트 라우트 가드로 대체하지 않는다.

API를 다른 출처로 분리하기로 결정하면 `src/client/api/`의 주소/credentials, 제한된 CORS 허용 출처, 쿠키 전송, SameSite·CSRF·로그인 재시도를 함께 변경·검증한다. `*` CORS 허용이나 무조건적인 CSRF 제거로 연결하지 않는다. 최종 도메인과 미리보기 환경의 DB·버킷·관리자 세션은 분리한다.

## 2. Node 실행본을 그대로 배포할 수 없는 지점

Workers의 Node 호환은 일부 API·shim을 제공하며 선택한 compatibility date의 동작을 확인해야 한다. 최신 공식 안내에는 HTTP·crypto 등 지원이 확대되어 있으므로 “Node 모듈은 전부 불가”라고 단정하지 않는다. 반대로 모듈 import 성공만으로 현재 앱의 네이티브 의존성·DB·영속 파일·프로세스 모델이 동작한다고 볼 수도 없다. `node:sqlite`는 공식 표에서 비기능 stub으로 분류된다. [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)

| 현재 구현 근거 | 후속 변경 / 반드시 보존할 동작 |
|---|---|
| `src/server/index.ts`: `app.listen`, process 신호·cwd·env | Worker 요청 진입점과 바인딩 기반 설정으로 전환. 현재 `npm start`를 Workers 시작 명령으로 사용하지 않음 |
| `src/server/app.ts`, `http/`: Express 라우트·middleware | Workers 요청/응답 방식 또는 검증된 HTTP 호환 어댑터 선택. API 경로·상태 코드·오류 비노출·권한 순서 유지 |
| `db/connection.ts`: native `better-sqlite3`, SQLite 파일·WAL·busy timeout | D1 등 선택한 DB binding으로 교체. 로컬 드라이버 바이너리를 복사해 사용하지 않음 |
| `repositories/contentRepository.ts`, `auth/service.ts`: 동기 prepare/run/get/all·트랜잭션 콜백 | 비동기 DB 경계로 변경. 콘텐츠·세부정보·관계·첨부·메인 설정의 일괄 저장, revision 충돌, 시도 제한 예약 원자성 유지 |
| `files/service.ts`: fsync·rename·unlink, DB 잠금 중 파일 작업 | 비공개 R2 객체 저장으로 교체. 임시 업로드·실패 정리·공통 파일 참조·총량 제한 재설계 |
| `http/files.ts`: busboy/Node stream·전체 Buffer·`sendFile` | Worker 요청 스트림과 R2 응답 스트림으로 교체/호환 검증. 크기·시간·동시 업로드 제한과 한글 원본명·no-store 유지 |
| `files/formats.ts`: sharp native 이미지 디코더, yauzl·saxes·zlib | 지원되는 검사 구현/WASM 또는 별도 검증 실행환경 선택. 이미지 완전 디코딩·ZIP 크기/CRC/경로/XML 검사와 허용 형식 유지 |
| `files/hwpValidation.ts`: Node worker_threads 5초·메모리 제한 | Workers에서 동일 격리 모델이 있다고 가정하지 않음. 제한된 검증 작업 방식과 CPU/메모리 차단을 별도 구현·시험 |
| `auth/passwords.ts`: scrypt N=32768/r=8/p=3, maxmem 64 MiB | 선택한 런타임의 crypto 동작·성능 시험. 아래 관리자 인증 기준 적용 |
| `transfer/index.ts`: 로컬 SQL snapshot·동기 fs·hard link 확정 | DB/R2 양방향 논리 이관기로 교체. 빈 대상·경로/버전/중복/해시 검사·실패 시 비공개·기존 자료 보존 유지 |
| `scripts/admin.ts`, `db.ts`, `content.ts` | 로컬 운영 도구로 유지하거나 별도 관리 CLI를 추가. 원격 권한·대상을 명시하고 비밀값/비밀번호 숨김 입력 유지 |

Workers에 `node:fs`가 있어도 `/tmp`는 요청별 비영속 공간이며 번들 영역은 읽기 전용이다. 현 `DB_PATH`·`UPLOAD_DIR` 값을 `/tmp`로 바꾸는 방식으로 영속 DB·업로드를 해결할 수 없다. [Workers filesystem](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/)

## 3. D1 후보의 스키마·원자성 검증표

**현재 SQLite DB 파일·SQL dump·마이그레이션을 D1에 그대로 적용할 수 있다고 보장하지 않는다.** 원본 마이그레이션을 수정하지 않고 D1용 변환·이력 및 논리 형식의 대응을 별도로 관리한다. 아래 항목은 D1에서 아직 미검증이다.

| 확인 대상 | 실제 로컬 사용 / D1 검증 기준 |
|---|---|
| 타입·제약·정렬 | `STRICT`, `CHECK`, `GLOB`, `instr`, `substr`, `COLLATE NOCASE`, 복합 UNIQUE/PK, NULL slug의 유일성. 관리자 아이디 대소문자와 한글 본문/파일명 의미 보존 |
| 외래키·트리거 | `ON DELETE CASCADE/RESTRICT`, 콘텐츠 종류 제한, ID/kind/slug 불변 트리거. 생성 순서·삭제 영향·실패 롤백 확인 |
| 질의와 바인딩 | `?` 매개변수, NULL/정수/ISO 시각, 조회 결과·정렬·페이지 이동·검색 escape·변경 행 수. 동적 문자열로 입력값을 SQL에 붙이지 않음 |
| 동시 수정 | revision 조건부 수정과 관련 행 전체 확정이 한 논리 작업으로 성공/실패. 단순 `await` 질의 나열로 부분 저장되지 않게 함 |
| 인증 경쟁 | 로그인 시도 제한·사전 세션·계정 재설정·로그아웃 원자성. 재설정 중 진행하던 로그인도 이전 비밀번호로 세션을 발급하지 못함 |
| 환경별 PRAGMA | WAL·synchronous·busy_timeout·SQLite backup API를 원격 D1에 재현하려 하지 않음. D1이 지원하는 SQL/운영 방식 사용 |
| 마이그레이션 이력 | 로컬 `schema_migrations` 파일명/SHA-256과 D1 이력을 동일하다고 취급하지 않음. 원본/변환본 버전 대응 및 재실행 무중복 확인 |
| 한도·실패 | 쿼리/바인딩/행·DB 크기·실행 시간·배치 한도 확인. 큰 이관을 분할하면 검수 전 공개되지 않도록 완료 표시/전환 경계 구현 |

D1은 준비된 질의와 `batch()` 등 자체 API를 제공한다. 현재 `db.transaction(callback).immediate()`를 API 이름만 바꾸어 포팅하지 말고 선택한 배치/조건부 SQL 방식의 전체 실패·동시 수정 동작을 테스트한다. 원자성은 실패 주입과 경쟁 요청으로 증명한다. [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)

D1의 외래키는 기본적으로 활성화되며 일시적 제약 유예는 `defer_foreign_keys` 방식이다. 유예가 CASCADE 삭제를 막는다고 가정하지 않는다. 별도의 `d1_migrations` 이력도 확인하고 로컬 체크섬 이력을 덮어쓰지 않는다. [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

## 4. R2 파일·DB 연결과 이관

R2 객체 키에는 현재 `files.storage_key`를 유지하고, 파일 ID·원본명·유형·크기·SHA-256 및 `content_files` 관계는 DB에 둔다. 공개 버킷 URL을 파일 연결의 유일한 기준으로 바꾸지 않는다. Worker의 R2 binding `put/get/head/delete`로 비공개 객체에 접근하는 어댑터를 구현한다. [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

다운로드는 현재 `/api/files/:id?contentId=...` 정책을 유지한다. 매 요청 DB 연결·공개 여부 또는 관리자 세션을 확인하고, 원본은 한글 `Content-Disposition`과 `private, no-store, max-age=0`, `nosniff`로 반환한다. R2 공개 도메인·CDN 캐시·장기 서명 URL로 이 권한 확인을 우회하지 않는다. 공개→비공개 전환 직후 직접 URL이 차단되는지 CDN/브라우저를 포함해 검수한다. 이미 내려받은 사본 회수는 보장하지 않는다.

DB와 R2에 걸친 단일 트랜잭션이 있다고 가정하지 않는다. 예를 들어 업로드 검증 후 비공개 임시 원본을 저장하고, DB 메타데이터/관계가 확정된 파일만 다운로드하도록 구성한다. 실패한 임시 객체와 미연결 객체는 식별해 정리하되 다른 콘텐츠가 참조하는 파일은 삭제하지 않는다. 공유 파일 교체·동시 삭제·총량 제한 경쟁·객체 누락·중간 요청 종료를 재현한다. 객체 ETag를 원본 SHA-256으로 간주하지 않고 manifest의 SHA-256과 실제 바이트를 비교한다.

이관은 현 `bootcamp-content` 버전 1 패키지를 입력으로 받아 **빈 D1 후보 DB와 새 비공개 R2 영역**에 복원하는 별도 도구로 구현한다. 로컬 importer는 로컬 SQL 버전·체크섬 일치를 요구하므로 D1에서 바꾼 스키마와 자동 호환되지 않는다. ID·slug·관계·게시 여부·수정일·revision·저장키를 유지하고 원본과 모든 파일 해시를 비교한다. 인증 자료는 이관하지 않고 새 환경에 관리자를 설정한다.

반대 방향도 준비한다. Cloudflare 편집을 서버에서 동결한 상태로 D1 논리 데이터와 R2 원본을 같은 기준 시점으로 내보내고, 로컬 새 빈 환경에 복원할 수 있는 형식으로 변환한다. 일부 객체만 복사하거나 D1 백업만 받아 전체 홈페이지 백업이라고 표시하지 않는다. 스키마 변경이 있다면 변환 버전과 원복 가능한 소스 버전을 함께 보관한다.

## 5. 지정 관리자 인증

현재 앱의 지정 관리자 정책·일반 회원가입 없음·서버 권한·만료·로그아웃 무효화·CSRF·시도 제한을 유지한다. D1 등 영속 상태 저장소로 세션/사전 세션/제한을 옮기고 인스턴스 메모리만으로 저장하지 않는다. read replica를 도입하면 로그아웃·비공개 전환 직후 오래된 권한을 읽지 않도록 일관성 정책을 검증한다.

공식 crypto 문서는 명시된 예외 외 Node crypto API 지원을 안내한다. 따라서 scrypt를 무조건 미지원으로 간주해 알고리즘을 바꾸지 않는다. 현재 파라미터·유니코드·타이밍 안전 비교·동시 검증 수를 해당 Worker CPU/메모리 한도에서 시험하고, 필요하면 검증된 인증 실행환경을 별도 선택한다. 지원/성능 문제를 이유로 평문·빠른 단일 해시·고정 비밀번호로 낮추지 않는다. [Workers crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

Cloudflare Access 같은 외부 관리 인증을 별도로 선택한다면 검증된 신원과 **지정 관리자 목록**의 대응, API·첨부까지 적용되는 서버 검증을 설계한다. 현재 로그인과 동등한 역할이라고 자동 간주하거나 공개 조회까지 일반 계정을 요구하지 않는다. 결정되지 않은 인증 제품을 지금 연결하지 않는다.

운영 쿠키는 HttpOnly·Secure·SameSite와 정확한 Origin/CSRF 검사를 유지한다. secrets/bindings는 서버에서만 읽으며 프런트 Vite 변수·Git·로그·콘텐츠 패키지에 넣지 않는다. 관리자 초기 생성/재설정은 숨김 입력을 지원하는 별도 관리 절차로 제공하고 재설정 시 기존 세션을 무효화한다.

## 6. 후속 실행 순서와 완료 증거

1. 승인된 소스 기준본, 기존 운영 콘텐츠 기준본, 쓰기 동결·회수 담당자를 확정한다. 실제 저장소의 추적 파일·이력에서 비밀값/DB/백업이 제외됐는지 확인한다.
2. 개발용 Worker·DB·R2 어댑터를 구현하고 고정된 도구 버전/compatibility date로 로컬 대체 환경에서 P-10 핵심 사례를 재현한다. 별도 환경의 D1/R2 실제 시험은 그다음 수행한다.
3. 빈 대상에서 스키마·콘텐츠·원본을 검증 복원하고 새 관리자 생성/재설정, 로그인→편집→공개→다운로드와 원복을 확인한다.
4. Pages 15개 공개/13개 관리자 유형의 직접 접속·새로고침·모바일, API 라우팅·404/오류 구분·한글 다운로드를 재검한다. 프런트에 비밀값·비공개 본문이 빌드되어 있지 않은지 확인한다.
5. Worker 새 버전·재시작·다중 요청 후 콘텐츠·관계·원본 유지, 로그아웃·비공개 직접 접근·CSRF·시도 제한·누락 원본/저장 실패를 확인한다.
6. 전체 내보내기→로컬 새 빈 환경 복원→건수/본문/공개 여부/관계/파일 SHA-256 일치→새 관리자 편집/다운로드를 확인한다. 실제 한컴 원본 미검증은 별도 시험으로 해소한다.
7. 변경자료 회수와 이전 환경 복귀 검수 후 실제 전환 여부를 결정한다. 코드만 되돌릴 때 최신 콘텐츠를 잃거나 새 스키마와 충돌하지 않는지 확인한다.

현재 저장소에는 Wrangler 설정·Workers 빌드/배포 명령·D1/R2 어댑터가 없다. 존재하지 않는 원격 명령을 실행 절차로 기재하거나 로컬 `npm start` 성공을 Cloudflare 배포 완료로 표시하지 않는다. 후속 구현에서 실제 명령과 실행 결과를 이 문서에 추가한다.

## 7. 전환 시 작성할 기록표

| 항목 | 기록할 값 / 현재 상태 |
|---|---|
| 소스 기준 | 로컬 `D:\boot_page`, `origin`=[Nawii06/boot_page](https://github.com/Nawii06/boot_page), `main` push 완료. 소스 기준 `9c104077f93988d3171d262abce4201bf088e556`, 최신 SHA는 README 명령으로 조회. 앱 배포 커밋은 미정이며 전환 시 전체 SHA·미커밋 변경 유무 기록 |
| 도구/어댑터 | Node/npm/잠금 파일·Wrangler 버전·compatibility date·D1/R2/인증 어댑터 버전. 후속 결정 |
| 실행 환경 | Pages 프로젝트/배포 ID·Worker 이름/버전·사용 도메인·시험/운영 구분. 미생성 |
| 저장소 | DB 이름/ID·R2 버킷/접두사·스키마/변환 버전·동시성/일관성 정책. 미정 |
| 입력 기준본 | Replit 또는 로컬 최종 export 위치·시각·manifest SHA-256·콘텐츠/파일 수 |
| 동결과 전환 | 원본 편집 동결 시각·복원 검수 완료·새 환경 편집 개시·담당자 |
| 변경자료 회수 | Cloudflare 동결 시각·최종 export/해시·로컬 복원 위치·일치/다운로드 결과 |
| 원복 기준 | 직전 코드와 호환 데이터 패키지의 쌍·비공개 보관 위치·복구 검수·재개 시각 |
| 남은 문제 | HWP/HWPX 원본·플랫폼별 미검증과 판정. 실제 Git 추적·이력 검사는 후속 통과, 플랫폼 전환 시 소스/비밀 설정을 다시 점검. 검증하지 않은 항목은 완료로 바꾸지 않음 |

Replit에서 먼저 운영한다면 [REPLIT_HANDOFF](REPLIT_HANDOFF.md)의 회수 기록과 이 표를 연결한다. 로컬 구버전과 Replit/Cloudflare 양쪽을 동시에 편집한 뒤 자동 병합하는 기능은 현재 없으며 새 기준본으로 전환하기 전 원본과 회수본을 모두 보존한다.
