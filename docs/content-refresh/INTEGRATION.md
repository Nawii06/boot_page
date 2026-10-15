# Replit 기준 main 통합 기록

- 요청일: 2026-10-15. 사용자가 Replit 브랜치를 main에 통합하고 이후 작업의 기준으로 사용하도록 요청.
- 이전 main: 90d7de6b9704113035fb8bb24444e29fa5003103.
- Replit 기준: c4746e74d25e11266d543f90693106e8bfaf6769 (replit-content-snapshot-20261015).
- 방법: Replit tree에 문서 보존·안내·Git 제외 규칙만 추가하는 두 부모 통합 커밋. 첫 부모는 이전 main, 둘째 부모는 Replit HEAD. 공통 조상이 없는 두 이력을 보존한다.
- 실제 앱: artifacts/knut-ai-bootcamp/. 공유 DB: lib/db/. 콘텐츠 작업 기록: 루트 docs/content-refresh/.

## 보존과 영향

| 통합 전 | 통합 후 |
|---|---|
| 루트 docs/BUILD_PROGRESS.md 사용자 수정 | 앱 docs/BUILD_PROGRESS.md에 원본 바이트 보존 |
| 루트 로컬 제작 순서 및 VS Code Codex 실행 프롬프트.md 사용자 수정 | 앱 폴더 같은 이름에 원본 바이트 보존 |
| 게시 후 콘텐츠 작업계획 | 루트 같은 이름에 원본 바이트 보존 |
| 비교 기준·진행기록 | 루트 docs/content-refresh에 유지, 후속 기록 추가 |
| 기존 루트 var·DB·첨부·백업 | 위치·내용 유지, 운영 데이터로 자동 이관하지 않음 |
| root node_modules·dist | 그대로 보존. 새 workspace의 검증된 산출물은 아님 |
| 두 원본 Git 이력 | 각각 통합 커밋의 부모로 보존 |

문서 사본·해시·Git bundle·검증 결과는 Git 제외 경로 .cache/replit-main-20261015-a5b7a5df/에 보관한다. 기존 변경은 지정 경로의 Git stash에도 남겨 복구 근거로 보존한다. 이 보존본은 Replit 운영 데이터의 백업을 뜻하지 않는다.

Replit 루트 .gitignore에 기존 비공개 상태 제외 규칙을 추가했다. 전체 파일 자동 추가 대신 Replit tree와 문서 허용 목록으로 통합 내용을 구성한다.

## 검증과 한계

- 두 원본이 통합 결과의 조상인지, Replit 대비 변경이 문서·.gitignore에 한정되는지 확인.
- 사용자 문서 바이트 및 기존 런타임 22파일의 SHA-256·크기를 통합 전후 대조.
- 금지 경로·고신뢰 비밀 패턴·JSON 구문·충돌 표식·문서 링크·제외 규칙 확인. 비밀 원문은 기록하지 않음.
- Replit 신규 19커밋 / 최종 291경로 / 355고유 blob의 제한 검사: 실제 금지 경로 및 비밀 패턴 발견 0. 시험용 URL 오탐은 구분. 이 검사는 모든 비밀의 부재를 보장하지 않음.
- 원격 main 반영 여부는 마지막 push·원격 커밋 대조 결과로 판단.
- Windows 로컬에서 소스 통합만 수행. 설치·빌드·앱·브라우저·DB·파일 API 시험 및 postMerge·DB push·Publish는 미실행.

## 남은 문제와 다음 작업

[비교 보고서](BASELINE.md)의 관리자 필드명·인증 동시성·파일 확정·관리형 백업·Windows 설치/포장 문제는 남아 있다. 통합은 기준을 정하는 작업이며 결함 수정이나 시험 재통과를 뜻하지 않는다.

다음 작업은 Replit 기준에서 운영 데이터·파일 기준본 확보 및 격리 검증이다. 기존 자료를 덮어쓰거나 seed를 운영에 재주입하지 않는다. Replit 내 동기화 시 postMerge가 스키마 push를 호출하므로 대상과 영향을 먼저 확인한다.
