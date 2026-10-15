# 게시 이후 작업 기준: Replit 브랜치와 main 비교

- 확인일: 2026-10-15, Windows PowerShell / D:\boot_page.
- 이번 요청: Replit에서 만든 브랜치를 기존 main과 비교. 비교 및 기록만 수행했다.
- 상태: **브랜치 정적 비교 완료. C-01 전체 완료 아님.** 게시본과 커밋의 일치, 운영 DB·스토리지 대조, 운영 백업, 변경본 로컬 실행은 미검증이다.

## 1. 코드 기준과 보존

| 항목 | 확인 결과 |
|---|---|
| 저장소 | https://github.com/Nawii06/boot_page |
| 기존 main / origin/main | `90d7de6b9704113035fb8bb24444e29fa5003103` |
| 비교 브랜치 | `origin/replit-content-snapshot-20261015` |
| Replit 브랜치 HEAD | `c4746e74d25e11266d543f90693106e8bfaf6769` |
| 이력 | main 3개, Replit 19개 커밋. merge-base 없음: Git 공통 조상이 없는 이력이다. |
| 로컬 작업 브랜치 | main 유지. checkout·merge·reset·commit·push 미실행. |
| GitHub 공개 여부 | API 조회 결과 `private: false`. 작업계획의 비공개 저장소 전제와 다르다. 가시성은 변경하지 않았다. |
| 게시 URL | 사용자가 알려준 https://knut-bta.replit.app/ . 이번 비교에서는 실제 화면·배포 커밋·운영 환경변수를 확인하지 않았다. |

기존 미커밋 파일 `docs/BUILD_PROGRESS.md`, `로컬 제작 순서 및 VS Code Codex 실행 프롬프트.md`와 미추적 콘텐츠 작업계획 문서의 SHA-256을 전후 대조하여 변경되지 않았음을 확인했다. 환경변수 값, 비밀번호, 세션, 운영 DB·업로드는 읽거나 변경하지 않았다. 원격 브랜치는 fetch하여 Git 객체로 읽었다.

## 2. 경로 이동을 반영한 파일 비교

기존 파일을 Replit의 `artifacts/knut-ai-bootcamp/` 하위와 대응시켰다. 루트 경로만 비교하여 기존 파일이 모두 삭제됐다고 판정하지 않았다.

| 항목 | 수량 |
|---|---:|
| main 추적 파일 | 94 |
| Replit 브랜치 추적 파일 | 291 |
| 기존 파일 중 내용 동일 | 67 |
| 기존 파일 중 내용 변경 | 27 |
| 대응 파일 누락 | 0 |
| 앱 하위 신규 파일 | 75 |
| 앱 외부 신규 파일 | 122 |

기존 클라이언트 20파일 중 19파일이 동일하다. PUB-01~15, ADM-01~13의 기존 화면·라우트·레이아웃·스타일 소스가 유지됐다. 이는 코드 대응 확인이며 28개 화면의 실제 렌더링·운영 동작을 다시 검증했다는 뜻은 아니다.

실제 엔트리는 [index.html:12](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/index.html#L12) → `src/client/main.tsx` → `src/client/App.tsx`이다. 새 `src/App.tsx`의 제작 중 템플릿과 추가 UI 컴포넌트들을 현재 홈페이지 화면으로 간주하지 않는다.

## 3. 실행 구조의 주요 차이

| 구분 | 기존 main | Replit 브랜치 |
|---|---|---|
| 프로젝트 구조 | 루트 단일 앱 | pnpm workspace; 부트캠프 앱은 artifacts 하위 |
| DB | 로컬 SQLite | DATABASE_URL 유무에 따라 PostgreSQL 또는 로컬 SQLite |
| 첨부 저장 | 로컬 비공개 업로드 폴더 | PostgreSQL 선택 시 App Object Storage; SQLite 선택 시 로컬 폴더 |
| 업로드 | API multipart | 방식 조회 후 multipart 또는 서명 URL PUT 및 완료 처리 |
| 배포 구성 | Node 앱 실행·Vite 개발 프록시 | 정적 프런트와 API 서비스 분리, Replit 설정 추가 |
| 인증 | 서버 세션·CSRF·관리자 검사 | 기존 검사 구조 유지, DB 호출을 비동기로 변경 |
| 논리 백업 | SQLite와 로컬 첨부 내보내기/복원 | 기존 백업 코드 유지: PostgreSQL·App Storage 대응은 추가되지 않음 |
| 시험 | 기존 로컬·브라우저 검수 | 기존 시험 일부 비동기 전환, 별도 managed 시험 추가 |

근거: [실행 DB·파일 선택](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/index.ts#L23), [클라이언트 업로드 분기](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/client/api/notices.ts#L50), [Replit 서비스 설정](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/.replit-artifact/artifact.toml#L9). 코드가 지원하는 실행 모드와 현재 게시 앱에서 실제 선택된 모드는 구분한다.

## 4. 병합·실제 콘텐츠 입력 전 해결할 사항

### A. 운영 자료 회수 경로가 연결되지 않음 — 우선

[content:export 호출](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/scripts/content.ts#L24)은 여전히 [로컬 SQLite 내보내기](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/transfer/index.ts#L207)와 로컬 업로드 폴더를 사용한다. 서버가 PostgreSQL·App Storage를 사용 중이라면 명령이 성공하더라도 최신 운영 자료를 회수했다고 볼 수 없다. 관리형 저장소를 대상으로 일관된 콘텐츠·파일 내보내기와 별도 빈 환경 복원 검증이 필요하다.

[storage-migrate](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/scripts/storage-migrate.ts#L15)는 SQLite에서 관리형 DB로 보내는 별도 단방향 도구이다. 관리자 해시도 복사 대상이며, 첨부 또는 첨부 연결이 하나라도 있으면 중단한다(:29). 관리자를 제외하는 일반 콘텐츠 백업이나 운영 파일 회수 도구를 대신하지 않는다. 이번에 실행하지 않았다.

### B. Windows/npm 실행 문서와 새 workspace가 불일치 — 우선

루트는 [pnpm 강제](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/package.json#L6)를 추가했다. 앱 [package.json](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/package.json#L34)에는 `@workspace/db`·cloud storage 의존성이 생겼지만 기존 [package-lock.json](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/package-lock.json#L10)과 README의 `npm.cmd ci` 절차가 동기화되지 않았다. [workspace 설정](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/pnpm-workspace.yaml#L78)은 Windows용 esbuild/rollup 선택 의존성을 제외한다. Replit의 Node 계열 설정·engine 검사 우회와 기존 정확한 Node/npm 버전 고정도 정리해야 한다.

기존 [소스 포장 스크립트](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/scripts/package-source.mjs#L7)는 앱 폴더만 포장하므로 새로 필요한 루트 workspace·pnpm 잠금 파일·lib/db를 담지 못한다. 새 폴더 설치·기동 검증이 필요하며, 기존 P-11 통과 기록을 변경본의 통과 근거로 재사용할 수 없다.

### C. PostgreSQL 반환 필드 이름이 관리자 코드와 불일치 — 코드 결함

[getAdminHome](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/repositories/contentRepository.ts#L395)의 `content_id AS contentId`는 PostgreSQL에서 `contentid`가 된다. [어댑터 반환 처리](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/db/dataDatabase.ts#L82)는 키를 복구하지 않지만 [관리자 메인 편집](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/client/pages/AdminContentPages.tsx#L78)은 `item.contentId`로 상세 조회한다. 선택 콘텐츠가 있는 ADM-12를 재열 때 잘못된 ID로 요청하게 된다. 삭제 영향의 `originalName`·`otherReferences`도 [같은 별칭 문제](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/repositories/contentRepository.ts#L291)가 있어 공통 파일 참조 표시가 누락될 수 있다.

따옴표 없는 식별자가 소문자로 변환되는 동작은 [PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS)와 대조했다. 위 판정은 정적 코드 경로에 근거하며 실제 게시 앱에서 재현 시험을 하지는 않았다. 별칭 인용 또는 명시적 반환 매핑 후 PostgreSQL에서 재열기·삭제 영향 시험이 필요하다.

### D. 비밀번호 재설정과 로그인 동시 처리 — 코드상 경쟁 조건

[PostgreSQL 트랜잭션](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/db/dataDatabase.ts#L145)은 일반 BEGIN을 사용한다. [로그인 최종 검사](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/auth/service.ts#L145)가 관리자 행을 잠그지 않고 해시를 확인한 뒤 세션을 삽입하므로, 그 사이 [비밀번호 재설정](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/auth/adminAccounts.ts#L40)이 비밀번호 변경·세션 삭제를 커밋하면 진행 중이던 이전 비밀번호 로그인이 새 세션을 만들 수 있다. SQLite 쓰기 직렬화에 의존하던 보장을 PostgreSQL에서도 확보해야 한다. 관리자 행 잠금 또는 인증 버전 원자 검사와 격리 환경 동시성 시험이 필요하다. 실제 계정으로 재설정·시험하지 않았다.

### E. 업로드 확정 후 원본 불변성과 크기 제한 — 재현 필요

[서명 PUT 발급](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/files/objectStorage.ts#L49)은 동일 객체 키에 15분 유효 URL을 발급한다. [완료 처리](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/files/service.ts#L183)는 검증 뒤 같은 키를 기록하고, [다운로드](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/files/service.ts#L320)는 객체 generation을 고정하지 않는다. URL 재사용 PUT이 허용되는 환경이라면 확정 후 같은 크기의 다른 바이트로 바꿀 수 있다는 조건부 위험이 있다. [Cloud Storage 공식 문서](https://docs.cloud.google.com/storage/docs/access-control/signed-urls)는 유효 기간 동안 URL 보유자가 지정 작업을 수행할 수 있음을 설명한다. 실제 Replit 서명 조건·재PUT 동작은 미검증이다.

또한 [객체 다운로드](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/files/objectStorage.ts#L111)로 전체 바이트를 메모리에 받은 후 크기를 검사한다. 크기 조건·제한 스트리밍·검증 후 별도 불변 키 또는 generation 확정을 검토하고 격리 환경에서 재PUT·과대 파일을 검증해야 한다. 업로드 URL은 인증된 관리자 경로에서 발급되므로 이를 익명의 무제한 직접 업로드가 확인됐다는 의미로 해석하지 않는다.

### F. 기타 실행·병합 확인 사항

- [post-merge hook](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/scripts/post-merge.sh#L3)은 의존성 설치 후 `pnpm --filter db push`를 호출한다. 병합 전에 실제 대상·연결 환경·스키마 영향을 확인해야 한다. 이번에는 hook을 실행하지 않았다.
- API 단독 빌드는 서버만 빌드하지만 [서버 시작 검사](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/index.ts#L20)는 `--api-only`에서도 프런트 산출물을 요구한다. Replit의 빌드 산출물 공유 여부 또는 독립 빌드 수정 여부가 미확정이다.
- [REPLIT_SETUP](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/docs/REPLIT_SETUP.md#L42)과 루트 replit.md에 SQLite 전용이라는 이전 설명이 남아 있다. 실제 관리형 저장소 분기와 일치하도록 갱신해야 한다.

## 5. 브랜치의 콘텐츠 스냅샷

대상은 `artifacts/knut-ai-bootcamp/content-snapshot-2026-10-15/manifest.json`이다. 내용·연락처 원문을 이 보고서에 재인용하지 않았다.

| 항목 | 결과 |
|---|---|
| 형식 | bootcamp-content v1, schema 002 |
| 콘텐츠 | 9건: 공개 3 / 초안 5 / 비공개 1 |
| 실제 자료 여부 | 9건 모두 [예시] 표시, revision 1. ID·제목·본문·분류·공개 여부·상세 필드가 기존 seed와 일치 |
| 관계 / 메인 선택 | 6 / 4 |
| 파일 메타데이터 / 파일 연결 / 첨부 바이트 | 모두 0 |
| 인증 데이터 | 관리자·세션·비밀번호 해시 테이블은 포함되지 않음 |
| 원격 운영 데이터와 동일성 | 미검증. 현재 운영 기준본 또는 완전 백업으로 인정하지 않음 |

Git에는 manifest만 있고 빈 `files/` 디렉터리는 없다. [가져오기 구조 검사](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/src/server/transfer/index.ts#L90)는 파일 0개여도 files 디렉터리를 요구하므로, 새 checkout 그대로는 복원 패키지 요건이 충족되지 않는다. 별도 준비 단계가 필요하며, 임의 .gitkeep은 예상 외 파일 검사에 걸릴 수 있다. 실제 가져오기는 실행하지 않았다.

이번 manifest의 제한된 비밀 패턴 검사에서는 해당 항목을 발견하지 않았다. 이것은 브랜치 전체·과거 모든 커밋에 비밀이 없다는 보증이 아니다. 실제 초안·비공개 자료를 이 추적 경로에 덮어써서 커밋하지 않아야 한다. 현재 저장소 공개 상태도 고려하여 운영 백업은 소스와 분리한다.

## 6. 실행 결과와 미검증 범위

| 점검 | 결과·근거 |
|---|---|
| 원격 브랜치 식별·fetch | 완료. 두 HEAD를 고정하여 비교 |
| 이력·경로 대응·내용 비교 | 완료. Git tree/blob 및 소스 검토 |
| 기존 미커밋 변경 보존 | 완료. 기존 3파일 SHA-256 동일, main HEAD 유지 |
| 게시 화면·배포 커밋 일치 | 미검증 |
| 운영 DB·스토리지 내용과 원본 회수 | 미검증 |
| 변경본 설치·빌드·로그인·CRUD·다운로드 | 미실행 |
| Replit 재시작·재배포 영속성 | 미검증 |
| 신규 managed 시험 | 소스만 검토, 미실행 |
| 실제 HWP/HWPX 원본 | 이번에 검증하지 않음 |

[managed 시험](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/tests/managed-integration.ts#L51)은 축소된 PostgreSQL 시험 테이블, 가짜 서명 서버·메모리 객체 저장소, 직접 주입한 관리자 세션을 사용한다. SQL 트랜잭션 및 모의 파일 흐름의 시험이며 실제 Replit 권한·인증·전체 스키마·백업 복원·재배포 유지를 증명하지 않는다. [시험 실행기](https://github.com/Nawii06/boot_page/blob/c4746e74d25e11266d543f90693106e8bfaf6769/artifacts/knut-ai-bootcamp/scripts/test-managed-integration.ts#L70)의 임시 폴더 정리 조건은 Windows 구분자와도 맞지 않아 정비가 필요하다.

기본 샌드박스 셸은 프로세스 시작 전 setup 오류가 발생했다. 승인된 읽기 전용 실행 및 Git 객체 조회로 비교했으며, 이를 앱 시험 실패로 기록하지 않는다. 새 운영 백업은 만들지 않았다. 기존 로컬 백업이 Replit 운영 데이터의 백업이라고 간주하지 않는다.

## 7. 다음 작업 기준

1. main과 기존 미커밋 작업을 보존하고, Replit 변경본은 별도 작업 위치에서 다룬다. 공통 조상이 없으므로 일반 PR 병합이나 무검토 전체 덮어쓰기를 전제하지 않는다.
2. 실제 게시 커밋·DB 모드·스토리지와 데이터 기준본을 확인하고, 관리형 데이터·파일 회수 및 복원을 먼저 확보한다.
3. 위 코드 결함과 설치·포장·문서 불일치를 수정한 뒤 격리 환경에서 필요한 회귀 시험을 실행한다.
4. 그 결과를 C-01에 이어 기록하고 C-02 실제 자료 정리로 진행한다. 이번에는 C-02 입력·시각화·운영 쓰기·외부 배포를 실행하지 않았다.

비교 원시 요약은 로컬 제외 경로 `.cache/replit-branch-comparison-20261015-1eb6c9f3/comparison.json`에 보관했다. 원격 소스 링크는 변경되지 않는 비교 커밋에 고정했다.

## 8. 후속 승인: Replit 기준 main 통합

2026-10-15 사용자가 Replit 브랜치의 main 통합과 이후 기준 사용을 요청했다. 위 비교는 당시 기록으로 보존한다. 현재 코드 기준·경로·보존 방법은 [INTEGRATION.md](INTEGRATION.md)를 따른다. 기존 main과 Replit 이력을 함께 보존하고 Replit 앱 소스·패키지·잠금 파일을 기준으로 삼았다. 발견 항목은 통합만으로 해결된 것이 아니며 C-01 전체 완료로 표시하지 않는다.
