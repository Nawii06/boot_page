# 로컬 통합 검수 — P-10

검수일: 2026-10-15 (Asia/Seoul)  
대상: 국립한국교통대학교 부트캠프(AI)사업단 파일럿 홈페이지, `D:\boot_page`

## 판정

**검수 수행·기록 완료, 확인한 로컬 핵심 동작 통과. 전체 최종 완료 판정은 보류한다.** 실제 한컴 작성 HWP/HWPX 원본 호환성은 미검증이다. 실제 Git index/history는 아래 후속 승인 작업에서 통과했으며 P-10 당시 기록과 구분한다. 나머지 검수 항목은 아래 실행 근거 범위에서 통과했으며 미해결 제품 결함은 발견하지 못했다. 공개 15개·관리자 13개 유형을 대상으로 하며 외부 배포·일반 회원·신청 접수·진행 상태 자동화는 검수 범위가 아니다.

## 실행 환경과 자료 보존

- 현재 도구 실행 환경: Windows `10.0.26300.0` x64, PowerShell `5.1.26100.9444`, Node.js `24.21.0`, npm `11.19.0`, SQLite `3.53.4` / `better-sqlite3 13.0.3`, Google Chrome `154.0.8037.98`, Git `2.54.0.windows.1`, Python `3.15.0`. 증거는 `.cache/p10-environment.json`이다. 실행 위치는 IDE에 표시된 프로젝트 경로와 같지만 사용자 실물 PC 동일성까지 확인한 것은 아니다. 과거 단계의 Python 버전 기록과 현재 검수 버전은 구분한다.
- 브라우저는 개인 프로필과 분리한 Playwright 임시 프로필이며 PC `1440×1000`, 모바일 폭 `390×844`, 좁은 폭 `320×800`으로 렌더링한다. 화면 폭 검증을 실물 휴대전화·사용자의 개인 브라우저 세션·다른 PC 검증으로 확대하지 않는다.
- 모든 등록·로그인·수정·삭제·파일 업로드·재시작·복원 시험은 `.cache`의 격리 DB·저장소·무작위 임시 관리자·루프백 포트에서 실행한다. 실제 `my_admin` 계정이나 운영 자료는 시험에 사용하지 않는다.
- 변경 전 소스 사본: `.cache/p10-before-update-20261015-eeac2a37/`. 실제 DB의 읽기 전용 SQLite 온라인 안전 사본: `var/backups/bootcamp.before-p10-11dfc354-7e1b-4cbe-9a23-e0f50ae178d1.sqlite`. 실제 DB 테이블·파일 해시 기준은 `.cache/p10-data-before.json`이다.
- 비밀번호·쿠키·비밀값은 로그에 출력하지 않는다. 인증 브라우저 시험은 trace·영상·자동 실패 화면 저장을 끄며 명시적으로 캡처한 예시 화면만 보관한다. SQLite 안전 사본과 이관 패키지는 비공개 자료이며 Git 제외 영역에 보관한다.

## 항목별 결과

| 번호 | 검수 항목 | 결과 | 실행 근거 및 범위 |
|---|---|---|---|
| 1 | PUB-01~15 / ADM-01~13의 코드·주소·동작 대응 | 통과 | 아래 화면 대응표, `pageRoutes.ts`·`App.tsx`, 실제 데이터·브라우저 직접 접속/새로고침 |
| 2 | 관리자 로그인 → 공지/교육/서식 등록 → 공개 → 수정 → 비공개 → 삭제 | 통과 | 공지·관리자·공개 목록/상세의 HTTP 및 브라우저 흐름 |
| 3 | 정상 첨부·한글명·교체·공유 참조·누락·업로드 제한 | 통과 | `files.test.ts`, `notices.test.ts`, `admin-content.test.ts`. 생성 PDF/OpenXML DOCX/PNG/JPEG/WebP의 검사와 원본 일치. 실제 한컴 HWP/HWPX 원본은 미검증 |
| 3-잔여 | 실제 한컴 작성 HWP/HWPX 원본 업로드/다운로드 | 미검증 | 원본 파일이 제공되지 않음. 합성 구조 검사를 정상 원본 호환성 증거로 계산하지 않음 |
| 4 | 미인증 변경/업로드·로그아웃 세션·비공개 직접 접근 차단 | 통과 | `auth.test.ts`, `auth-core.test.ts`, `admin-content.test.ts`, `notices.test.ts`: 서버 세션·CSRF·Origin·401/403/404·로그아웃/재설정 무효화 |
| 5 | HTML/스크립트·경로 조작의 실행/임의 파일 접근 방지 | 통과 | `notice-html.test.ts`, `files.test.ts`, `notices.test.ts`, `content-transfer*.test.ts`: 정화·관리된 이미지 ID·매개변수 질의·상대 저장키·접합점/중복/예약 경로 검사 |
| 6 | 실제 서버 재시작·백업/복원 후 콘텐츠/관계/다운로드 유지 | 통과 | `persistence.test.ts`, `notices.test.ts`, `content-transfer.test.ts`, `content-transfer-failures.test.ts`: 실제 프로세스 종료/재기동, 9개 테이블·원본 해시, 복원 후 새 관리자 편집·다운로드, 오류/강제 종료 롤백 |
| 7 | PC/모바일 메뉴·본문·표·폼·파일 버튼 실제 렌더링 | 통과 | 설치된 Chrome의 3개 뷰포트, 가로 넘침/메뉴 겹침 검사와 실제 화면 캡처 검토 |
| 8 | 검색·분류·페이지·상단 고정·관련 링크·직접 주소·새로고침 | 통과 | `notices.test.ts`, `admin-content.test.ts`, `public-catalog.spec.ts`, `public-guides.spec.ts`, `scaffold.spec.ts` |
| 9 | 초안/비공개·빈 목록·입력 오류·서버 오류 구분 | 통과 | HTTP 오류 구분·저장 실패 보존 및 브라우저의 로딩/빈 안내/오류/재시도 검증 |
| 10 | 실제 Git index/history의 비밀값·DB·업로드·백업 미포함 | 미검증 | root 작업 폴더가 Git 저장소가 아니므로 실제 추적/이력은 확인 불가. 원격 선택·root Git 초기화를 하지 않음 |
| 10-보조 | Git 제외 규칙·현재 추적 후보 위생 검사 | 통과 | 격리 Git fixture에서 포함/제외 39/39 통과. 현재 후보에서 DB/업로드/백업/환경 비밀 파일 및 제한된 비밀 패턴·실제 저장 인증값 일치 발견 0건. 실제 index/history 검증을 대신하지 않음 |

위 통과 판정은 실제 실행한 사례의 범위다. 파일 검사를 악성코드 완전 탐지로 설명하지 않으며 전원 차단 내구성·운영 HTTPS·D1/R2 호환을 검증한 것으로 보지 않는다.

## 화면별 코드·주소·동작

등록/수정 4쌍은 같은 화면 유형을 재사용하므로 총 **28개 유형 / 32개 경로 패턴**이다. 코드·DB 대응은 [PAGE_INVENTORY.md](PAGE_INVENTORY.md)를 함께 참조한다.

routeDefinitions 32개 경로를 App.tsx 선택 분기와 실제 export 함수, PAGE_INVENTORY 주소에 대조했다. 고유 ID는 공개 15개/관리자 13개이며 등록·수정 경로 4쌍이 같은 화면 함수를 사용한다. 관리자 로그인 이외 화면은 AdminAuthBoundary와 서버 세션 검사를 거친다.

공통 S1은 모든 경로의 직접 접속/새로고침·화면 폭·외부 요청 부재 검사다. S1 동적 경로의 _preview는 실제 자료가 아닌 잘못된 주소/빈 상태만 검사하므로 아래 기능 증거는 별도의 실제 저장 ID/slug 테스트를 대응했다.

증거 약어(각 spec 내부 test 선언 순서, 모든 사례 1440×1000 / 390×844 / 320×800 실행):
- S1~S6: tests/browser/scaffold.spec.ts
- N1~N3: tests/browser/notices.spec.ts
- A1~A3: tests/browser/admin-content.spec.ts
- G1~G5: tests/browser/public-guides.spec.ts
- C1~C5: tests/browser/public-catalog.spec.ts
- P10: tests/browser/p10-acceptance.spec.ts (교육/서식 실제 UI 종단 흐름·입력 검증·모바일 표/메뉴)

| ID | 실제 경로 | src/client/pages 구현 | 실제 동작 검증 | 재현 시험 |
|---|---|---|---|---|
| PUB-01 | `/` | HomePage.tsx / HomePage (PublicPages.tsx re-export) | 관리자 DB 소개·이미지·선택 콘텐츠 → 공개 메인과 교육/공지/서식 연결·빈 상태·오류 재시도 | C1, C4, C5 |
| PUB-02 | `/about/overview` | PublicContentPages.tsx / PublicInfoPage | 사업소개 관리자 저장/수정 → 익명 본문·문의처 반영, 비공개/미등록 빈 안내 | G1, G2, G4 |
| PUB-03 | `/about/organization` | PublicContentPages.tsx / PublicInfoPage | 조직/업무 관리자 수정 → 익명 이미지·본문·관련 링크 반영 | G1, G2 |
| PUB-04 | `/about/cooperation` | PublicContentPages.tsx / PublicInfoPage | 기업 협력 본문·관련 정보 수정 → 공개 반영·비공개 제외 | G1, G2 |
| PUB-05 | `/about/location` | PublicContentPages.tsx / PublicInfoPage | 위치·주소·문의처 수정 → 페이지/공통 하단 반영, 외부 지도 불필요 | G1, G2 |
| PUB-06 | `/programs/curriculum` | PublicCatalogPages.tsx / PublicListPage | 교육 수준·검색·분류·페이지 이동·검색 없음·주소 유지 | C2, C3, C5, P10 |
| PUB-07 | `/programs/curriculum/:slug` | PublicCatalogPages.tsx / PublicDetailPage | 실제 slug 직접 접속/새로고침·교육 필드·관련 공지·제목 수정 주소 유지·비공개 차단 | C1, C3, P10 |
| PUB-08 | `/programs/activities` | PublicCatalogPages.tsx / PublicListPage | 프로그램 유형·검색·분류·페이지 이동·검색 없음 | C1, C2, C3, C5 |
| PUB-09 | `/programs/activities/:slug` | PublicCatalogPages.tsx / PublicDetailPage | 실제 activity slug 직접 접속/새로고침·필드·파일 없음·잘못된 종류/주소 차단 | C1, C3, C5 |
| PUB-10 | `/programs/guide` | PublicContentPages.tsx / PublicInfoPage | 관리자 참여 안내·공지/서식 ID·기존 외부 신청 링크 반영, 자체 접수폼 없음 | G1, G2 |
| PUB-11 | `/notices` | NoticePages.tsx / NoticeListPage | 검색·분류·페이지 이동·고정 공지·관리자 수정 반영 | N1, N2 |
| PUB-12 | `/notices/:post` | NoticePages.tsx / PublicNoticeDetailPage | 실제 ID 본문·이미지·한글 원본 다운로드·교체·비공개 차단·관련 교육/서식 | N1, N3, C1 |
| PUB-13 | `/resources` | PublicCatalogPages.tsx / PublicListPage | 서식 검색·분류·수정일·페이지 이동·빈 결과 | C2, C3, P10 |
| PUB-14 | `/resources/:post` | PublicCatalogPages.tsx / PublicDetailPage | 서식 8개 안내 필드·직접 접속/새로고침·한글 PDF 원본·관련 콘텐츠·비공개/삭제 차단 | C1, C3, P10 |
| PUB-15 | `/faq` | PublicContentPages.tsx / PublicFaqPage | 관리자 FAQ/순서·공개 답변·키보드 Enter/Space·검색/페이지·직접 질문 ID·비공개 제외 | G3, G4, G5 |
| ADM-01 | `/admin/login` | AdminPages.tsx / AdminLoginPage | 실제 서버 로그인·복귀 경로·임의 브라우저 플래그 무시 | S2, S5, S6 |
| ADM-02 | `/admin` | AdminPages.tsx / AdminHomePage | 로그인 서버 보호·관리 메뉴·DB 상태/오류 재시도·로그아웃 후 이전 세션 거부 | S2, S3, S5 |
| ADM-03 | `/admin/about` | AdminContentPages.tsx / AdminContentEditorPage | 기본정보 4개 탭 저장/다시 열기/미리보기·공개 페이지 반영 | A2, G1, G2 |
| ADM-04 | `/admin/programs` | AdminContentPages.tsx / AdminContentListPage | 교육/프로그램 종류·검색 목록·등록 이동·삭제 확인·모바일 표 | A1, P10 |
| ADM-05 | `/admin/programs/new`<br>`/admin/programs/:id/edit` | AdminContentPages.tsx / AdminContentEditorPage | 교육/프로그램 필드·관련 ID·정화 미리보기·저장/재열기·취소·공개·수정·비공개·삭제 | A1, P10 |
| ADM-06 | `/admin/notices` | NoticePages.tsx / NoticeListPage(admin) | 공지 검색/필터·등록 이동·삭제 영향 확인·실제 삭제 | N1, N2 |
| ADM-07 | `/admin/notices/new`<br>`/admin/notices/:id/edit` | NoticePages.tsx / AdminNoticeEditorPage | 공지 등록·수정·게시 여부·미리보기·한글 파일/이미지 업로드·교체·관련 ID 저장 | N1, N3, C1 |
| ADM-08 | `/admin/resources` | AdminContentPages.tsx / AdminContentListPage | 서식 검색/목록·편집 이동·삭제 확인·모바일 내부 표 스크롤 | A1, P10 |
| ADM-09 | `/admin/resources/new`<br>`/admin/resources/:id/edit` | AdminContentPages.tsx / AdminContentEditorPage | 서식 전체 필드·첨부/교체·등록/수정/공개/비공개/삭제·긴 한글 파일명 | A1, P10 |
| ADM-10 | `/admin/faq` | AdminContentPages.tsx / AdminContentListPage | FAQ 검색·표시 순서 목록·신규/편집 이동·삭제 확인 | A1, G3 |
| ADM-11 | `/admin/faq/new`<br>`/admin/faq/:id/edit` | AdminContentPages.tsx / AdminContentEditorPage | 질문/답변·순서·내부/외부 링크·저장/재열기·중복 클릭·실패/동시 수정 보존 | A1, A3, G3 |
| ADM-12 | `/admin/home` | AdminContentPages.tsx / AdminContentEditorPage | 메인 소개·이미지·ID 노출·외부 바로가기 저장·미리보기 비공개·공개 반영 | A2, C1, C4 |
| ADM-13 | `/admin/guide` | AdminContentPages.tsx / AdminContentEditorPage | 참여 절차·유의사항·신청 링크 저장/재열기·공개/비공개·관련 ID 반영 | A2, G1, G2 |

## 재현 명령과 실행 근거

프로젝트 루트에서 실행한다. 기존 관리자 비밀번호를 입력하거나 실제 DB를 초기화할 필요가 없다.

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:browser -- --output=.cache/p10-browser-results
```

- 빌드: 통과, `.cache/p10-build.log`.
- 기존 서버/DB/파일/복원 시험: **122/122 통과**, 실패·건너뜀 0, `.cache/p10-server-tests.log`.
- 신규 서버 저장 실패 검증: `node --import tsx --test tests/acceptance.test.ts` **3/3 통과**. 공지·교육·서식 각각 실제 HTTP 오류 처리와 트랜잭션 롤백·재시도를 확인했다. 기존 122건과 새 3건을 별도 실행한 결과이며 125건 전체를 한 번에 재실행했다고 표시하지 않는다.
- 브라우저: 최종 **69개 고유 사례 통과**(기존 66 + 신규 3). 전체 첫 실행은 **67/69 통과·2건 실패**였다. 실패는 새 P-10 시험에서 화면 아래 표의 삭제 버튼으로 세로 스크롤하지 않은 채 뷰포트 안에 있는지 검사한 검증 코드 문제였다. `scrollIntoViewIfNeeded()`로 대상 위치로 이동한 뒤 내부 가로 스크롤과 실제 버튼 접근을 확인하도록 보완했다. 제품 코드나 CSS는 변경하지 않았다. 영향받는 P-10 시나리오만 3개 폭에서 다시 실행해 **3/3 통과**했다. 기존 66개와 최종 P-10 3개, 총 69개 고유 시나리오의 최종 결과가 통과이며 전체 69건을 다시 실행한 것으로 표시하지 않는다.
- 실행 로그: `.cache/p10-browser-tests.log`(최초 전체), `.cache/p10-browser-focused-tests.log`(P-10 한정 재검), `.cache/p10-core-targeted-tests.log`(신규 서버 3건 최초 성공 결과). 실제 렌더링은 `.cache/p10-browser-results/` 및 재검 결과 경로의 PNG로 확인했다. 상세 경로·좌표·정리 결과는 `.cache/p10-visual.json`을 따른다.
- 실제 자료 보존: `node --import tsx .cache/p10-preserve.ts --compare`. 소스/문서: `python -X utf8 .cache/p10-source-check.py`. Git 제외·후보 검사: `python -X utf8 .cache/p10-hygiene-audit.py`. 결과는 각각 `.cache/p10-data-after.json`, `.cache/p10-source-check.json`, `.cache/p10-hygiene-audit.json`이다.

## 발견 문제·수정·재검증

전체 첫 실행은 **67/69 통과·2건 실패**였다. 실패는 새 P-10 시험에서 화면 아래 표의 삭제 버튼으로 세로 스크롤하지 않은 채 뷰포트 안에 있는지 검사한 검증 코드 문제였다. `scrollIntoViewIfNeeded()`로 대상 위치로 이동한 뒤 내부 가로 스크롤과 실제 버튼 접근을 확인하도록 보완했다. 제품 코드나 CSS는 변경하지 않았다. 영향받는 P-10 시나리오만 3개 폭에서 다시 실행해 **3/3 통과**했다. 기존 66개와 최종 P-10 3개, 총 69개 고유 시나리오의 최종 결과가 통과이며 전체 69건을 다시 실행한 것으로 표시하지 않는다.

추가 서버 시험 `tests/acceptance.test.ts`는 공지·교육·서식 저장의 마지막 연결 삽입 지점에 실제 오류를 주입했다. HTTP 400/404/409/500 구분, 내부 오류/경로 비노출, 본문·revision·관계·첨부 전체 롤백과 기존 다운로드 보존, 정상 재시도를 3/3 확인했다. 시험용 트리거/함수는 격리 연결에만 설치하며 운영 코드에 우회 기능을 추가하지 않았다.

브라우저 추가 시험 `tests/browser/p10-acceptance.spec.ts`는 교육/서식의 초안→공개→익명 열람/원본 다운로드→제목/필드 수정→비공개→삭제를 실제 UI로 연결했다. 필수 제목 입력 오류가 저장을 만들지 않는지, 긴 한글 파일명과 모바일 표 내부 가로 스크롤·메뉴 열기·삭제 확인도 검사했다. 단순 색상값/고정 문구를 복제하는 시험은 추가하지 않았다.

PC의 공개 메인·관리 목록·서식 폼, 390px/320px의 공통 메뉴·표·폼·본문·첨부 영역을 캡처로 검토했다. 긴 제목/한글 파일명은 줄바꿈되고 표의 관리 버튼은 표 내부 스크롤로 접근한다. 일부 전체 화면 캡처의 ‘본문 바로가기’는 키보드 포커스 시 보이는 접근성 표시이며 상시 겹침으로 분류하지 않는다. 계정 표시는 캡처에서 가렸다.

제품 소스·스키마·의존성·잠금 파일은 수정하지 않았다. 추가 파일은 두 검증 코드와 본 문서이며 README·프로젝트 기준·화면 목록·진행기록을 갱신했다. 실제 DB 15개 테이블·기존 업로드의 해시는 작업 전후 동일하고 무결성 정상/외래키 오류 0이다. 실제 관리자·세션·콘텐츠를 보존했다.

파일 원본 해시는 업로드 기록과 내보내기/복원에서 대조한다. 다운로드 핸들러가 모든 요청에서 SHA-256을 다시 계산하는 것은 아니므로 동일 크기의 임의 디스크 변조까지 다운로드 시 탐지했다고 주장하지 않는다.

## 남은 미검증과 종료 조건

| 항목 | 현재 상태 | 남은 확인 |
|---|---|---|
| 실제 한컴 작성 HWP/HWPX | 미검증 | 개인정보 없는 실제 원본 각 1개 이상으로 격리 환경에서 관리자 업로드 → 공개 다운로드 → 원본/다운로드 SHA-256 일치 → 비공개 직접 주소 차단 → 재시작/복원 후 다운로드 확인. 합성 구조나 확장자만 바꾼 파일을 원본 증거로 사용하지 않음 |
| 실제 Git index/history | 후속 검증 통과 (2026-10-15) | 승인된 로컬 `main` 저장소의 실제 index·HEAD·도달 가능한 전체 커밋 tree/blob 검사를 수행. 아래 추가 기록 참조. P-10 당시 미검증 결과를 소급 변경하지 않음 |
| 다른 PC·실물 모바일·다른 브라우저 | 미검증 | 이번 Windows/Chrome/뷰포트 결과와 구분해 해당 환경에서 재현 |
| 운영 HTTPS·Replit·D1/R2 | 미검증 / 후속 범위 | 배포 환경 인증·영속성·파일 권한·이관 호환성은 별도 확인. 외부 배포 미수행 |

필수 한컴 원본 호환성 등 남은 확인 전에는 전체 최종 완료로 표시하지 않는다. P-11 로컬 인수인계 문서에도 이 제한과 재현 절차를 그대로 유지한다.

## P-11 새 폴더 재현 추가 기록 — 2026-10-15

위 P-10 화면표/실행 결과는 당시 기록이다. P-11은 실제 Windows/PowerShell에서 새 소스 폴더 설치·관리자·등록/공개/다운로드·재시작과 다른 소스 폴더 복원을 추가 확인했다. 전체 시험 재실행 결과가 아니다. 명령·초기 실패/수정·증거는 [BUILD_PROGRESS](BUILD_PROGRESS.md)의 P-11 절과 `.cache/p11-reproduction.json`을 따른다.

| 항목 | 결과 | 근거 / 제한 |
|---|---|---|
| 소스/버전/비밀 분리 | 통과 | 정확한 Node/npm·잠금 일치, source:package 회귀4/4·Windows 링크 경계3/3 |
| 새 폴더 설치/DB/빌드 | 통과 | node_modules 복사 없이 두 폴더 npm ci·마이그레이션·빌드. 기존 다운로드 캐시 사용; 빈 캐시/별도 PC 미검증 |
| 실제 TTY 관리자 생성/재설정 | 통과(수정 후) | 초기 idle 스트림 종료 결함 수정, auth-core11/11 및 실제 숨김 입력 후 자연 exit0 |
| 등록/공개/파일/재시작 | 통과 | 3종 콘텐츠·관계4·공통 PDF1/연결2, 크기/hash·Chrome 직접/reload·로그인/logout |
| 별도 소스 폴더 복원 | 통과 | 9개 논리 표 전체 값·관계·파일SHA-256 일치/인증 제외, 새 관리자 편집/다운로드·재시작 유지 |
| 실제 자료 보존 | 통과 | 원본 DB15표·계정/세션/파일 동일, 현재 콘텐츠9·파일0의 별도 비공개 보존본 |
| 실제 키보드 Ctrl+C | 미검증 | 도구의 문자 전송으로 Windows 콘솔 이벤트를 확인하지 못함. 소유 PID 종료 후 재시작 영속성 검증과 구분 |
| 외부 운영/남은 항목 | 미검증 / 후속 | 배포 미수행. 실제 한컴 HWP/HWPX·실제 Git index/history도 계속 미검증 |

**P-11 로컬 재현·인계 준비 완료, 전체 최종 완료 판정 보류.** 소스는 `.cache/releases/source-handoff-p11-20261015/`, 콘텐츠 보존본은 `var/backups/content-handoff-p11-20261015/`이며 합치지 않는다. 외부 준비는 [REPLIT_HANDOFF](REPLIT_HANDOFF.md)·[CLOUDFLARE_HANDOFF](CLOUDFLARE_HANDOFF.md)에 기록했다.

## 후속 승인 — 실제 Git 추적·이력 검증 (2026-10-15)

사용자가 ZIP 백업 후 **로컬 Git 저장소·커밋 정리**를 선택하고 작성자 정보를 제공했다. 이 범위로 `D:\boot_page`에 `main` 저장소를 구성했다. 소스 기준 커밋은 `9c104077f93988d3171d262abce4201bf088e556`이고 Git 검수 문서는 별도 후속 커밋으로 구분한다. 최종 SHA는 README의 `rev-parse HEAD`로 확인한다. 원격 저장소·push·외부 배포는 수행하지 않았다.

| 검증 | 결과 | 근거 / 범위 |
|---|---|---|
| 실제 index·HEAD 및 도달 가능한 전체 커밋 | 통과 | 추적 94파일. 모든 커밋 tree의 파일 경로·모드·blob을 검사하며 실제 index와 최종 HEAD 일치 확인 |
| 비밀값·실데이터·백업 제외 | 통과 | 금지 경로·비정규 파일 모드·제한된 비밀 패턴·의심 비밀 리터럴·실제 DB 인증 저장값 일치 모두 0건. 비밀값 원문은 출력하지 않음 |
| 제외 규칙 | 통과 | 실제 저장소에서 포함/제외 39/39, 실제 var/·.cache/ 파일 모두 제외, 추적 .gitignore와 작업본 일치 |
| 원본 자료와 ZIP | 통과 | 실제 DB 15표·계정/세션·업로드 그대로, integrity ok/FK0. 기존 ZIP 2개의 크기·SHA-256 일치 |
| 변경 범위 | 통과 | 로컬 소스 기준 커밋과 검수 문서 커밋. 원격 0개. 제품 코드·의존성·스키마 변경 없음 |

근거는 `.cache/git-initial-audit-index.json`(커밋 전), `.cache/git-initial-audit-baseline.json`(기준 커밋), `.cache/git-initial-audit-head.json`(최종 기록 커밋), `.cache/git-data-preservation.json`, `.cache/git-zip-preservation.json`이다. 검수 스크립트는 `python -X utf8 .cache/git-initial-audit.py --phase head`로 실행하며 감사 증거는 비공개 로컬 경로에 둔다. 검사는 현재 로컬 참조에서 도달 가능한 이력의 범위이며 알려지지 않은 모든 비밀이나 삭제된 참조에만 남은 이력을 완전히 검출한다고 주장하지 않는다.

현재 Windows/Git 환경에서 수행했다. 도구 계정과 폴더 소유자가 달라 명령마다 확인한 경로만 `-c safe.directory=D:/boot_page`로 지정했다. 전역 Git 설정·소유권은 변경하지 않았다. 이번 작업은 Git과 문서만 변경했으므로 앱/브라우저 전체 시험을 다시 실행하지 않았다. 한컴 원본·실제 키보드 Ctrl+C 등 기존 미검증 항목은 남긴다.

## 후속 승인 — GitHub 전송 확인 (2026-10-15)

사용자가 지정한 [Nawii06/boot_page](https://github.com/Nawii06/boot_page)는 초기 refs가 없는 공개 저장소이며 push 권한을 확인했다. `origin/main`으로 기존 로컬 이력을 전송했고 최초 원격 SHA `4d7c046171cea4b0f11a624268ae9b06917f0d0c`가 로컬과 일치했다. 원격 기록 문서도 별도 후속 커밋으로 전송하며 최종 SHA는 README의 Git 명령으로 확인한다.

전송 전 감사 `.cache/git-prepush-audit.json`은 실제 94파일·전체 2커밋 검사, 비밀/금지 경로 발견0, 제외 규칙39/39를 확인했다. 최종 문서 커밋의 감사 `.cache/git-postpush-audit.json`과 원격 SHA·파일 tree 일치/깨끗한 작업 트리 확인 `.cache/git-push-verification.json`을 별도 보관한다. 과거 로컬 Git 검사 시점의 원격0 기록은 변경하지 않는다. 앱/브라우저 재검·실제 HWP/HWPX 검증·외부 홈페이지 배포를 완료한 것으로 해석하지 않는다.
