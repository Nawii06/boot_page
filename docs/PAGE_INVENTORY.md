# 화면 목록과 구현 상태

작성일: 2026-10-14 (Asia/Seoul)  
갱신일: 2026-10-15 (Asia/Seoul)  
현재 단계: **P-11 로컬 재현·인계 준비 완료, 전체 최종 판정 보류**. 공개 15개 + 관리자 13개 = **28개 화면 유형, 32개 경로 패턴**을 유지한다. 등록·수정 경로 4쌍이 각각 같은 편집 화면을 재사용한다. 실제 HWP/HWPX 원본 호환성은 별도 미검증 항목이다.

**실제 DB·서버 인증 위에 관리자 13개 유형과 공개 15개 유형을 연결한다.** 로그인 이외의 관리자 화면은 서버 세션 확인 후에만 표시한다. 메인·교육/프로그램·서식과 공지 간 연결은 아래 P-08 증거로 검증한다. HWP/HWPX의 내용 검사 코드는 구현했지만 한컴 작성 원본 호환성은 아직 미검증이며 현재 단계와 구분한다.

P-01 기록: 28개 화면 유형 모두 미구현이었으며 URL만 설계했다. P-02에서 해당 설계를 유지해 화면 틀과 공통 컴포넌트를 추가했다. P-03에서는 화면 ID·명칭·URL을 바꾸지 않고 DB/API 기반을 추가했다. 경로 원본은 [pageRoutes.ts](../src/shared/pageRoutes.ts)의 `routeDefinitions`, 화면 선택은 [App.tsx](../src/client/App.tsx)의 `App`, 공통 레이아웃은 [layouts.tsx](../src/client/layouts.tsx)의 `PublicLayout`·`AdminLayout`이다.

P-03 공통 데이터 계층은 [contentRepository.ts](../src/server/repositories/contentRepository.ts), 공개 API는 [publicContents.ts](../src/server/http/publicContents.ts), 화면용 호출 모듈은 [content.ts](../src/client/api/content.ts)에 있다. 공개 조회는 `publication=public`만 반환하고 관련 ID·메인 노출 대상·분류도 같은 기준으로 걸러낸다. 이전 단계의 “화면 DB 미연결” 기록은 당시 화면이 아직 API를 호출하지 않았다는 뜻이다.

## 공개 화면

| ID | 화면 | 등록 URL | DB 대응 및 관리 화면 | 현재 화면 코드·함수 | 구현/검수 |
|---|---|---|---|---|---|
| PUB-01 | 메인페이지 | `/` | page:home, home_items, 공개 공지·교육·서식 / ADM-12 | [HomePage.tsx](../src/client/pages/HomePage.tsx) · `HomePage` | DB 소개·이미지·주요/최근 공지·교육/프로그램·서식·바로가기, 빈 안내·재시도 |
| PUB-02 | 사업소개 | `/about/overview` | page:overview / ADM-03 | [PublicContentPages.tsx](../src/client/pages/PublicContentPages.tsx) · `PublicInfoPage` | 공개 본문·문의처·첨부·관련 ID 연결, 목적·교육 분야·추진내용을 관리자 본문으로 표현 |
| PUB-03 | 조직 및 담당업무 | `/about/organization` | page:organization / ADM-03 | [PublicContentPages.tsx](../src/client/pages/PublicContentPages.tsx) · `PublicInfoPage` | 공개 조직도 이미지/표·업무 본문·문의처 연결, 임의 조직 정보 없음 |
| PUB-04 | 기업 협력 안내 | `/about/cooperation` | page:cooperation / ADM-03 | [PublicContentPages.tsx](../src/client/pages/PublicContentPages.tsx) · `PublicInfoPage` | 공개 협력 분야·참여 방식·문의 절차 본문 및 관련 안내 연결 |
| PUB-05 | 오시는 길 | `/about/location` | page:location, contact_details / ADM-03 | [PublicContentPages.tsx](../src/client/pages/PublicContentPages.tsx) · `PublicInfoPage` | 공개 방문 안내·주소·문의처, 공통 하단 문의처 재사용, 외부 지도 자동 접속 없음 |
| PUB-06 | 교육과정 목록·현황 | `/programs/curriculum` | curriculum, program_details / ADM-04·05 | [PublicCatalogPages.tsx](../src/client/pages/PublicCatalogPages.tsx) · `PublicListPage` | DB 수준별 목록·검색·공개 분류·페이지 이동·수정일, 진행 상태 없음 |
| PUB-07 | 교육과정 상세 | `/programs/curriculum/:slug` | curriculum, 관련 공지·서식·파일 메타데이터 / ADM-05 | [PublicCatalogPages.tsx](../src/client/pages/PublicCatalogPages.tsx) · `PublicDetailPage` | 종류+slug 조회, 소개·수준/대상/운영/이수요건·첨부·관련 ID, 404/오류 구분 |
| PUB-08 | 비교과·산학 프로그램 목록·현황 | `/programs/activities` | activity, program_details / ADM-04·05 | [PublicCatalogPages.tsx](../src/client/pages/PublicCatalogPages.tsx) · `PublicListPage` | DB 유형별 목록·검색·공개 분류·페이지 이동·수정일, 진행 상태 없음 |
| PUB-09 | 프로그램 상세 | `/programs/activities/:slug` | activity, 관련 공지·서식·파일 메타데이터 / ADM-05 | [PublicCatalogPages.tsx](../src/client/pages/PublicCatalogPages.tsx) · `PublicDetailPage` | 종류+slug 조회, 유형/대상/운영/이수요건·본문·첨부·관련 ID, 기존 주소 유지 |
| PUB-10 | 참여 및 신청 안내 | `/programs/guide` | page:guide, 관련 공지·서식 / ADM-13 | [PublicContentPages.tsx](../src/client/pages/PublicContentPages.tsx) · `PublicInfoPage` | 공개 절차·유의사항·공지/서식 ID·기존 외부 신청 경로 표시, 자체 접수폼 없음 |
| PUB-11 | 공지사항 목록 | `/notices` | notice, 고정·검색·분류·페이지 이동 / ADM-06·07 | [NoticePages.tsx](../src/client/pages/NoticePages.tsx) · `NoticeListPage` | DB 연결·공개 필터·검색·분류·페이지 이동·새로고침 검증 |
| PUB-12 | 공지 상세 | `/notices/:post` | notice, 문의처·관련 ID·파일 / ADM-07 | [NoticePages.tsx](../src/client/pages/NoticePages.tsx) · `PublicNoticeDetailPage` | 정화 본문·이미지·원본 다운로드·비공개 차단·관련 교육/서식/공지 연결 / 실 HWP·HWPX 미검증 |
| PUB-13 | 신청·제출 서식 목록 | `/resources` | resource, 분류·검색·수정일 / ADM-08·09 | [PublicCatalogPages.tsx](../src/client/pages/PublicCatalogPages.tsx) · `PublicListPage` | DB 목록·공개 분류·검색·수정일·10건 페이지 이동, 검색 조건 주소 유지 |
| PUB-14 | 서식 안내 상세 | `/resources/:post` | resource_details, 관련 ID·파일 메타데이터 / ADM-09 | [PublicCatalogPages.tsx](../src/client/pages/PublicCatalogPages.tsx) · `PublicDetailPage` | UUID/종류 검증, 대상·서류·작성/제출·연도·문의처·본문·원본 다운로드·관련 ID |
| PUB-15 | 자주 묻는 질문 | `/faq` | faq, 순서·관련 링크 / ADM-10·11 | [PublicContentPages.tsx](../src/client/pages/PublicContentPages.tsx) · `PublicFaqPage` | 공개 순서·검색·페이지 이동, 키보드 펼침, 정화 답변·첨부·관련 ID, `?item=ID` 직접 열람 |

## 관리자 화면

| ID | 화면 | 등록 URL | 목표 역할 / 공개 대응 | 현재 코드·함수 | 구현/검수 |
|---|---|---|---|---|---|
| ADM-01 | 관리자 로그인 | `/admin/login` | 서버 인증, 일반 가입 없음 | [AdminPages.tsx](../src/client/pages/AdminPages.tsx) · `AdminLoginPage` | 실제 로그인·실패/제한 안내·내부 복귀 경로 구현 |
| ADM-02 | 관리자 메인 | `/admin` | 관리 메뉴·작업 바로가기·로그아웃, 통계 없음 | [AdminPages.tsx](../src/client/pages/AdminPages.tsx) · `AdminHomePage` | 서버 세션 보호·관리 메뉴·실제 DB 상태·로그아웃 구현 |
| ADM-03 | 사업단 기본정보 편집 | `/admin/about` | 소개·조직·협력·위치/문의처 구역 / PUB-02~05 | [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx) · `AdminContentEditorPage` | 4개 항목별 본문·문의처·관련 ID·게시 여부 저장, 미리보기·취소·삭제 영향 |
| ADM-04 | 교육·프로그램 관리 목록 | `/admin/programs` | 교육/프로그램 종류, 검색·등록·편집·삭제 / PUB-06~09 | [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx) · `AdminContentListPage` | 종류·검색·분류·게시 여부·페이지 이동·등록/수정·삭제 영향 |
| ADM-05 | 교육·프로그램 등록·수정 | `/admin/programs/new`, `/admin/programs/:id/edit` | 공통 폼, 종류·소개·대상·이수요건·관련 공지/서식 / PUB-07·09 | [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx) · `AdminContentEditorPage` | 교육/프로그램 상세·관련 ID·본문/첨부 저장·미리보기·취소·삭제 |
| ADM-06 | 공지사항 관리 목록 | `/admin/notices` | 검색·게시 여부·등록·편집·삭제 / PUB-11 | [NoticePages.tsx](../src/client/pages/NoticePages.tsx) · `NoticeListPage(admin)` | 서버 보호·DB 검색/분류/게시 여부·삭제 영향/실제 삭제 검증 |
| ADM-07 | 공지사항 등록·수정 | `/admin/notices/new`, `/admin/notices/:id/edit` | 본문·분류·게시일·문의처·고정·첨부·관련 ID / PUB-12 | [NoticePages.tsx](../src/client/pages/NoticePages.tsx) · `AdminNoticeEditorPage` | 실제 저장/수정·공개 전환·미리보기·업로드/교체/미연결 정리·관련 콘텐츠 선택 / 실 HWP·HWPX 미검증 |
| ADM-08 | 서식 관리 목록 | `/admin/resources` | 검색·분류·등록·편집·삭제 / PUB-13 | [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx) · `AdminContentListPage` | 검색·분류·게시 여부·페이지 이동·등록/수정·삭제 영향 |
| ADM-09 | 서식 등록·수정 | `/admin/resources/new`, `/admin/resources/:id/edit` | 공통 폼, 대상·작성/제출 안내·연도·파일 교체 / PUB-14 | [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx) · `AdminContentEditorPage` | 서식 상세·본문·첨부/교체·관련 ID·게시 여부 저장, 수정일 자동 기록 |
| ADM-10 | 질문·답변 관리 목록 | `/admin/faq` | 검색·순서·등록·편집·삭제 / PUB-15 | [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx) · `AdminContentListPage` | 검색·표시 순서·게시 여부·등록/수정·삭제 영향 |
| ADM-11 | 질문·답변 등록·수정 | `/admin/faq/new`, `/admin/faq/:id/edit` | 질문·답변·표시 순서·관련 링크 / PUB-15 | [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx) · `AdminContentEditorPage` | 질문·답변·순서·내부 ID·안전한 외부 링크 저장·미리보기·취소 |
| ADM-12 | 메인페이지 편집 | `/admin/home` | 문구·이미지·주요 안내·노출 콘텐츠 ID·바로가기 / PUB-01 | [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx) · `AdminContentEditorPage` | 본문·메인 이미지·4개 노출 구역 ID 선택·바로가기 동시 저장·미리보기 |
| ADM-13 | 참여 및 신청 안내 편집 | `/admin/guide` | 절차·기존 신청 경로·제출 유의사항·관련 콘텐츠 / PUB-10 | [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx) · `AdminContentEditorPage` | 참여 안내 본문·문의처·ID/외부 링크·게시 여부 저장·미리보기·취소·삭제 |

## P-02 실행·화면 검증 기록

- 실제 Google Chrome(headless)을 Playwright로 실행해 PC `1440×1000`, 모바일 폭 `390×844`, 좁은 모바일 폭 `320×800`에서 검증했다. 각 크기에서 32개 경로 모두 직접 접속하고 새로고침했다. 동적 경로에는 `_preview`를 사용했으며 이는 실제 게시물 ID가 아닌 화면 틀 확인용이다.
- 전체 12개 브라우저 검증이 통과했다. 전체 경로, 공개·관리자 메뉴 이동, 준비 중 입력 제어, 존재하지 않는 주소의 404 안내, 키보드 메뉴 조작, 관리자 메인의 실제 `/api/health` 연결과 로딩·실패·재시도 표시를 확인했다.
- 빈 목록의 안내 문구가 모바일에서 가로로 잘리는 현상을 수정했다. 수정 후 3개 크기의 전체 경로 검증 3개를 재실행해 모두 통과했고, `320px` 스크린샷에서 안내 문구 표시를 확인했다. 데이터 행이 있는 관리자 메뉴 표는 표 영역 안에서 가로스크롤한다.
- 공통 UI는 [ui.tsx](../src/client/components/ui.tsx)의 `Button`·`LinkButton`·`DataTable`·`SearchForm`·`Field`·`FileDisplay`·`Notice`·`EmptyState`·`LoadingState`를 재사용한다. 버튼·검색·입력·파일표시의 준비 상태, 오류·빈 목록·로딩 표시를 실제 화면에 연결했다. 토큰과 반응형 규칙은 [styles.css](../src/client/styles.css)에 정의했다.
- 이 결과는 로컬 브라우저에서 실행한 P-02 검증 이력이다. 실제 모바일 단말이나 다른 브라우저, DB 영속성, 서버 인증·권한, 게시물 CRUD, 실제 첨부파일 업로드/다운로드의 통과를 의미하지 않는다. DB 영속성은 아래 P-03 별도 테스트로 검증하고 나머지는 배정 단계에서 수행한다.

## P-03 데이터 계층 검증 기록

- 최종 타입 검사·빌드와 서버/DB 테스트 24개가 통과했다. 저장소·seed 9개, 마이그레이션 6개, 실제 서버 프로세스 2개, HTTP 서버 7개로 구성한다. 실제 서버 프로세스 종료/재시작 이후 저장·수정한 데이터 조회가 유지되는지 검증했다.
- 공개 조회 목록·상세·고정 페이지·프로그램·메인에서 초안/비공개와 비공개 관련 링크를 제외한다. 실제 SQLite 제약, 수정 충돌, 관계/파일 메타데이터, seed 반복 정책, 마이그레이션 백업·실패 롤백을 격리 DB로 검사했다.
- 관리자 메인은 `/api/health`의 실제 DB 질의 결과에 따라 DB 연결 확인을 표시한다. 해당 API 응답은 `stage=P-03`이며 인증·파일 기능이 준비 중임을 화면에 함께 표시한다. 공개 본문과 목록은 아직 API를 호출하지 않으며 DB 예시 데이터를 화면에 자동 노출하지 않는다.
- 기본 작업 DB에 마이그레이션과 예시 9건을 적용하고 재실행 시 중복·변경 없음을 확인했다. P-03에서는 관리자 DB 연결·오류/재시도 및 메뉴 이동을 3개 화면 폭에서 6개 브라우저 테스트로, 개발 서버에서도 DB 연결 흐름 1개로 검수했다. 상세 명령·포트·완료 판정은 [BUILD_PROGRESS.md](BUILD_PROGRESS.md)에 기록했다. P-02 전체 화면 검수와 이번 변경 범위의 검수를 구분한다.

## P-04 인증·화면 검증 기록

- ADM-01 로그인·ADM-02 관리 홈과 모든 관리자 보호 경로를 구현했다. [AdminAuth.tsx](../src/client/auth/AdminAuth.tsx)는 서버 세션 확인·만료·로그아웃·안전한 내부 복귀 경로를 처리하고 [auth.ts](../src/server/http/auth.ts)는 서버 권한·쿠키·CSRF·Origin을 검사한다.
- 서버/DB 42개와 빌드, 실제 Chrome 18개를 통과했다. 1440·390·320px에서 전체 32개 경로를 익명/인증 상태에 맞춰 직접 접속·새로고침하고 실제 로그인/로그아웃·임의 플래그·만료·키보드·로딩/오류/재시도를 검사했다. ADM-01/02 화면을 육안 확인했으며 헤더·메뉴 겹침이 없다.
- Vite 개발 프록시에서도 별도 시험 DB로 로그인 200·미인증 변경 401·로그아웃 204·기존 세션 401을 확인했다. 실사용 DB의 관리자 계정은 임의 생성하지 않았다.
- ADM-03~13의 서버 보호와 콘텐츠 저장 기능 완성을 구분한다. 편집/삭제/업로드는 권한 통과 후에도 501이며 UI는 준비 중이다. 실제 DB 변경 허용 여부는 같은 운영 미들웨어를 붙인 시험 전용 경로로 검증했다. 상세 증거와 환경 한계는 [BUILD_PROGRESS.md](BUILD_PROGRESS.md)의 P-04 기록을 따른다.

## P-05 공지·첨부 검증 기록

- PUB-11/12·ADM-06/07을 [NoticePages.tsx](../src/client/pages/NoticePages.tsx)와 [공지 API 모듈](../src/client/api/notices.ts)에 연결했다. 등록/수정은 같은 편집 화면을 사용한다. 추가 계정·일반 가입·교육 진행 상태·별도 파일 관리 페이지를 만들지 않았다.
- 공지 제목·분류·HTML 본문·게시일·문의처·고정·게시 여부·첨부를 실제 저장한다. 관리자 검색·편집·삭제 영향/확인, 공개 검색·분류·페이지 이동, 서버 정화 미리보기·본문 이미지·한글 원본 다운로드·교체·미연결 정리를 구현했다.
- 서버/DB/파일/정화 시험 65개, 빌드와 Chrome 전체 24개가 통과했다. 이후 같은 이미지의 첨부/본문 역할별 수정·해제·교체와 UUID가 있는 다른 본문 링크 보존을 확인하는 새 시험 3개도 통과했다. 1440·390·320px에서 공지 작성·미리보기·원본 다운로드·본문 이미지 설명·파일 교체·비공개 전환·삭제와 공개 검색·분류·페이지 이동·새로고침을 확인했다. 본문과 첨부가 있는 상세의 PC/320px 캡처를 육안 확인했다. 27개를 한 번에 실행한 결과로 합산하지 않는다.
- Vite 개발 프록시에서도 별도 DB·임시 계정으로 한글 PDF multipart 업로드 → 공개 공지 저장 → 원본 바이트/파일명 일치 → 비공개 URL 404를 확인했다. 실제 DB·관리자 계정은 변경하지 않았다. 자세한 보존·명령·환경 제한은 [BUILD_PROGRESS.md](BUILD_PROGRESS.md)를 따른다.
- **실제 한컴 작성 HWP/HWPX 호환성은 미검증**이다. 합성 구조의 검사 코드 시험과 확장자 위장 거부를 정상 한컴 원본 통과로 기록하지 않는다. 해당 원본 검증 전에는 P-05 최종 완료 판정을 보류한다.

## P-06 관리자 기능 검증 기록

- ADM-03/04/05/08/09/10/11/12/13을 [AdminContentPages.tsx](../src/client/pages/AdminContentPages.tsx), [관리자 API 모듈](../src/client/api/adminContents.ts), [공통 편집 도구](../src/client/components/contentEditing.tsx)에 연결했다. 기존 공지의 파일·HTML·인증 모듈을 재사용하며 ADM-01~13이 모두 실제 기능에 연결된다.
- 타입 검사·빌드, 서버 **72/72**, Chrome **36/36**을 통과했다. 1440·390·320px에서 목록형 4개 종류·기본정보 4개·참여 안내·메인의 저장/재열기/새로고침, 관련 ID·서식 파일 교체·취소·삭제·미리보기·저장 실패·중복 클릭·충돌 안내를 확인했다. 기존 전체 경로·공지·인증도 같은 전체 실행에서 회귀 검증했다.
- 실제 서버 프로세스를 종료/재시작해 모든 유형의 상세·메인 선택·파일 원본이 유지됨을 확인했다. 새 변경/비공개 조회 API의 서버 인증과 CSRF·로그아웃 무효화, 메인 동시 저장 롤백·비공개 대상 제외, HTML 정화·공유 원본 보존을 검증했다.
- Vite 개발 프록시에서도 격리 DB로 새 API 저장·권한·한글 PDF 원본·편집 재조회가 통과했다. PC·모바일 서식/메인 캡처에서 메뉴·폼·버튼 겹침을 발견하지 않았다. 실제 DB·관리자·기존 자료를 보존했다. 상세 실행 증거와 환경 한계는 [BUILD_PROGRESS.md](BUILD_PROGRESS.md)를 따른다.
- 공개 공지 외 PUB 화면은 다음 단계에서 연결한다. 실제 한컴 작성 HWP/HWPX 시험은 별도 남은 항목이며 이번 P-06 검증에 포함하거나 차단 조건으로 삼지 않는다.

## P-07 공개 안내 검증 기록

- PUB-02~05·10·15를 [PublicContentPages.tsx](../src/client/pages/PublicContentPages.tsx)와 [공개 표시 도구](../src/client/components/publicContent.tsx)에 연결했다. 기존 [공개 API 모듈](../src/client/api/content.ts)을 사용하며 DB·스키마·의존성을 추가하지 않았다.
- 사업소개·조직/업무·기업 협력·오시는 길·참여 안내는 관리자가 공개 저장한 본문·문의처·첨부·관련 ID를 표시한다. 페이지별 구성은 관리자 본문에서 작성하며 주소·사업정보를 임의 입력하지 않는다. 공통 하단은 공개된 위치 안내의 문의처만 읽고 외부 지도는 자동 접속하지 않는다.
- FAQ는 표시 순서·검색·10건 페이지 이동·개별 ID 주소와 키보드 Enter/Space 열람을 지원한다. 이동·새로고침·탭 복귀·답변 재열기에 재조회하며 비공개·미등록을 정상 빈 안내, 조회 실패를 재시도 가능한 오류로 구분한다. 참여 안내의 관련 공지·서식은 내부 ID로 연결하고 P-08 대상 상세는 준비 상태를 명시한다. 자체 접수폼은 없다.
- 최종 타입 검사·빌드, 서버 **72/72**, Chrome **51/51**을 통과했다. 기존 36개 회귀와 새 공개 안내 시나리오 5개 × 3개 폭을 한 번의 최종 전체 실행에서 확인했다. 1440·390·320px의 관리자 작성/수정 반영·비공개 제외·직접 접속·새로고침·메뉴·FAQ 키보드/검색/페이지 이동·로딩/오류/빈 안내와 PC·모바일 캡처를 확인했다.
- Vite 개발 프록시에서도 격리 DB로 6개 화면, 관리자 변경 반영, 조직도 로컬 이미지·한글 PDF 원본, 비공개 파일 404·문의처 숨김을 확인했다. 실제 DB·`my_admin` 계정·기존 자료를 보존했다. 회귀 검사에서 발견한 공지 이미지 업로드의 포커스 문제를 보완하고 재검증했다. 초기 실패·수정과 환경 한계는 [BUILD_PROGRESS.md](BUILD_PROGRESS.md)의 P-07 기록을 따른다.
- 남은 공개 화면은 P-08의 PUB-01·06~09·13·14다. 실제 HWP/HWPX 원본 호환성은 이번 공개 안내 검증에 포함하지 않았다.

## P-08 전체 공개 연결 검증 기록

- PUB-01은 [HomePage.tsx](../src/client/pages/HomePage.tsx), PUB-06~09·13·14는 [PublicCatalogPages.tsx](../src/client/pages/PublicCatalogPages.tsx)에서 실제 DB를 읽는다. 기존 PUB-11/12 공지와 P-07 안내/FAQ도 [공통 공개 표시 도구](../src/client/components/publicContent.tsx)의 주소·첨부·관련 링크를 공유한다. 공개 15개 유형이 모두 DB에 연결되며 새 화면 유형·경로 패턴은 만들지 않았다.
- 메인은 관리자 소개·선정 콘텐츠와 최신 공개 공지를 조합한다. 교육/프로그램은 DB 수준/유형별 목록과 상세, 서식은 검색·분류·수정일과 작성/제출 안내·원본 파일을 제공한다. 비공개·삭제·잘못된 종류/주소·빈 결과·파일 없음·서버 오류를 처리한다.
- ADM-07에도 관련 콘텐츠 ID 선택을 추가했다. 교육/프로그램은 기존 종류+slug, 공지/서식은 UUID 주소를 사용한다. 제목을 수정해도 주소가 유지되고 공개 대상만 링크된다. 양방향 안내는 양쪽 콘텐츠에서 상대 ID를 선택한다.
- 최종 타입 검사·빌드, 서버 **73/73**, Chrome **66/66**을 통과했다. 1440·390·320px에서 메인 → 교육 상세 → 공지 → 서식 → 한글 PDF 원본 다운로드·파일명/바이트 일치, 관리자 수정 반영·관련 ID 저장, 직접 접속·새로고침·검색/분류/페이지·비공개/삭제·오류 재시도를 확인했다. 기존 P-07·관리자·파일·인증 검증도 포함했다.
- 별도 Vite 개발 환경에서도 같은 전체 흐름·주소 유지·비공개 파일/메인 이미지 차단을 확인했다. 320px의 긴 소개 1,930자와 각 영역 6건의 선정 목록에서 키보드 펼침·전체 본문/18개 상세 접근·상단 서식 바로가기·가로 넘침 없음도 확인했다. PC·390·320px 공개 캡처를 육안 검토했다.
- 실제 DB·`my_admin` 계정·기존 자료·주소·패키지/잠금 파일·마이그레이션·seed를 보존했다. 원본 HWP/HWPX·실물 모바일·다른 브라우저·운영 HTTPS·외부 배포는 이번 검증에 포함하지 않았다. 상세 증거는 [BUILD_PROGRESS.md](BUILD_PROGRESS.md)의 P-08 기록을 따른다. 다음 단계는 P-09 콘텐츠 백업·복원이다.

## P-09 콘텐츠 백업·복원 검증 기록

- 화면·경로·관리자 메뉴를 추가하지 않고 `scripts/content.ts`의 `content:export`/`content:import`를 제공한다. 공개 15개·관리자 13개 유형 및 기존 인증/다운로드 정책을 유지한다.
- 별도 빈 환경에 모든 종류·고정 안내·메인·참여 안내·FAQ·관계·파일 역할을 복원하고 9개 논리 테이블의 본문/게시 여부/식별자와 원본 해시를 대조했다. 새 관리자 생성·비밀번호 재설정 후 기존 관리자 API 편집과 공개/비공개 다운로드를 확인했다.
- 빌드 및 서버/DB/이관 **122/122** 통과. 실제 작업 DB 콘텐츠 9건의 CLI 왕복 복원과 원본 DB 15개 테이블/업로드/계정 보존도 확인했다. UI 수정이 없어 P-08 브라우저 66건은 이번 단계에서 재실행하지 않았다.
- 패키지 형식·실행·새 환경 계정 설정은 [README](../README.md#콘텐츠-내보내기빈-환경-복원), 상세 검증과 제한은 [진행기록](BUILD_PROGRESS.md)의 P-09 절을 따른다. HWP/HWPX 한컴 원본 호환성은 계속 별도 미검증이며 다음 단계는 P-10 통합 검수·오류 수정이다.

## P-10 통합 검수 기록

- [LOCAL_ACCEPTANCE.md](LOCAL_ACCEPTANCE.md)에 28개 ID / 32개 경로의 실제 export 함수·주소·동작·재현 시험을 대응했다. 동적 `_preview`의 빈 상태 확인과 실제 저장 ID/slug의 상세/편집 검증을 구분한다.
- 빌드 통과, 기존 서버 122/122 + 추가 공지/교육/서식 오류 복구 3/3, 브라우저 69개 고유 사례 최종 통과. 브라우저 최초 실행의 새 검사에서 누락된 스크롤을 보완하고 P-10 시나리오 3개 폭만 재검했다. 제품 코드·화면·경로는 변경하지 않았다.
- PC 1440×1000·모바일 폭 390×844/320×800에서 실제 렌더링·폼·표·긴 한글 파일명·메뉴·다운로드·삭제까지 확인했다. 실물 모바일이나 다른 PC 검증으로 표시하지 않는다.
- 실제 한컴 HWP/HWPX 원본과 실제 Git index/history는 미검증이다. 로컬 검수 기록을 완료했지만 전체 최종 완료 판정은 보류하며 다음 P-11 인수인계에 남은 항목을 포함한다.

## P-11 인계 확인

- 화면28개/경로32개 및 위 구현 대응은 변경하지 않았다. 전체 검수는 [LOCAL_ACCEPTANCE](LOCAL_ACCEPTANCE.md)의 P-10 실행 결과를 유지한다.
- 새 소스 폴더 관리자 CLI→공지/교육/서식 등록→공개 상세/관계/공유 한글 PDF→재시작을 확인했다. 다른 소스 폴더 복원 후 새 관리자 생성/재설정·편집·공개/다운로드·다시 재시작도 확인했다.
- CLI 종료 수정·소스 패키징만 추가했고 화면/API/스키마는 변경하지 않았다. P-11에서 28개 전체 UI 시험을 다시 수행한 것으로 표시하지 않는다.
- 실제 한컴 원본·실제 Git은 미검증이다. 외부 배포 없이 [Replit](REPLIT_HANDOFF.md)·[Cloudflare](CLOUDFLARE_HANDOFF.md) 인계를 제공한다. 범위/증거/환경 제한은 [진행기록](BUILD_PROGRESS.md)의 P-11 절을 따른다.

## P-11 이후 로컬 Git 확인

- 사용자 승인으로 `main`에 소스 기준 커밋 `9c104077f93988d3171d262abce4201bf088e556`과 검수 문서 커밋을 구분해 기록했다. 실제 index·HEAD·도달 가능한 전체 커밋 검사를 통과했다. 상세 근거는 [LOCAL_ACCEPTANCE](LOCAL_ACCEPTANCE.md)의 추가 기록을 따른다.
- 화면·API·스키마는 변경하지 않았고 28개 화면 대응은 유지한다. 기존 P-10/P-11의 Git 미검증 기록은 당시 결과이며 이번 후속 검사와 구분한다. 한컴 원본 미검증과 전체 최종 판정 보류는 유지한다. 원격 저장소·외부 배포는 수행하지 않았다.

## 공통 규칙과 단계 배정

- 공개 상위 메뉴는 홈 / 사업단 소개 / 교육·참여 프로그램 / 공지·자료실이다. FAQ는 공지·자료실 하위에 둔다.
- `:post`와 관리자 `:id`는 안정적인 콘텐츠 ID다. 교육/프로그램 `:slug`는 생성 후 제목 수정으로 바꾸지 않는다. 고정 `/new` 경로는 동적 ID 경로보다 먼저 구분한다.
- 로그인 이외의 모든 관리자 화면은 P-04의 서버 세션 확인을 거친다. 경로 이동·포커스·만료 시 다시 확인하며 localStorage 플래그로 권한을 부여하지 않는다. 기존 P-02/P-03 기록은 당시 검증 범위다.
- 공개 조회는 초안/비공개 상세·관련 링크·해당 첨부 메타데이터를 반환하지 않는다. 관리자 상세는 인증 후 비공개를 허용한다. P-05 파일 전송은 ID 연결/게시 여부 또는 관리자 권한을 매 요청 확인한다. 공지 편집 미리보기의 미연결 파일은 관리자 전용이다. 공지의 잘못된 ID는 실제 오류 안내를 표시하며 `_preview`를 가짜 자료로 사용하지 않는다.
- 빈 목록, 파일 없음, 오류, 저장 결과, 삭제 영향/확인은 공통 UI다. 28개 유형 외의 별도 상위 화면으로 세지 않는다. P-05 공지 편집 내부에 서버 미리보기·미연결 파일 정리를 제공한다. P-06의 모든 편집기도 같은 서버 파일 업로드/권한·역할별 연결 처리와 본문 편집 도구를 재사용한다.
- 관리자 생성/재설정·백업/복원은 로컬 명령이며 관리자 메뉴를 추가하지 않는다.
- P-02 전체 라우트/공통 틀 → P-03 DB → P-04 ADM-01·02/보호 → P-05 PUB-11·12/ADM-06·07 → P-06 나머지 관리자 → P-07 PUB-02~05·10·15 → P-08 PUB-01·06~09·13·14와 전체 연결 → P-09 백업 → P-10 전체 검수 → P-11 인수인계.
- `현재 화면 코드·함수`는 실제 화면 구현을 가리킨다. 화면 존재·서버 데이터 계층·화면 DB 연결·기능 검수 완료를 구분하며 미실행 항목은 계속 미검증으로 남긴다.
