# 국립한국교통대학교 부트캠프(AI)사업단 홈페이지

현재 작업 기준은 Replit에서 마무리한 **replit-content-snapshot-20261015 / c4746e7**을 통합한 **main / pnpm workspace**입니다. 이후 콘텐츠·시각화 작업은 이 구조를 사용합니다.

| 위치 | 용도 |
|---|---|
| [artifacts/knut-ai-bootcamp](artifacts/knut-ai-bootcamp/) | 실제 홈페이지 프런트·관리자·API·테스트 |
| [lib/db](lib/db/) | 공유 PostgreSQL 스키마·연결 |
| [Replit 실행 안내](artifacts/knut-ai-bootcamp/docs/REPLIT_SETUP.md) | 현재 실행 모드와 명령의 적용 범위 |
| [기존 로컬 기록](artifacts/knut-ai-bootcamp/docs/BUILD_PROGRESS.md) | P-01~P-11 및 기존 사용자 수정 보존 |
| [작업 기준](docs/content-refresh/BASELINE.md) / [진행기록](docs/content-refresh/PROGRESS.md) | 다음 콘텐츠 입력·시각화 작업 |
| [통합 기록](docs/content-refresh/INTEGRATION.md) | 비교 기준·보존·검증·남은 문제 |

## 실행 기준

설치·workspace 명령은 저장소 루트에서 사용합니다. Replit 구성의 설치 명령은 pnpm install --frozen-lockfile이며 서비스 정의는 [artifact 설정](artifacts/knut-ai-bootcamp/.replit-artifact/artifact.toml)에 있습니다. **이번 통합에서는 설치·빌드·앱 실행을 수행하지 않았습니다.** 기존 루트 node_modules·dist가 남아 있더라도 현재 workspace의 검증된 산출물로 간주하지 않습니다.

기존 앱 README의 Windows/npm 독립 실행 절차와 P-11 결과는 당시 로컬 버전의 기록입니다. 새 workspace의 Windows 설치·소스 포장·관리형 백업을 검증했다는 의미가 아닙니다. 현재 불일치는 [비교 보고서](docs/content-refresh/BASELINE.md)에 남겨 두었습니다.

서버는 DATABASE_URL이 있으면 PostgreSQL·App Storage, 없으면 SQLite·로컬 파일 저장을 선택합니다. 실제 게시 환경의 설정·자료는 별도 확인 대상입니다. db:migrate는 DATABASE_URL이 있으면 개발 PostgreSQL에 스키마 push를 수행하므로 읽기 전용 확인 명령으로 사용하지 않습니다. Replit postMerge에도 DB push 명령이 등록되어 있습니다.

## 보존 범위

기존 루트 var·DB·업로드·백업은 위치와 내용을 유지하고 Git에서 제외했습니다. 새 앱 폴더로 복사하거나 운영 데이터로 자동 이관하지 않았습니다. 기존 content:export/import는 SQLite·로컬 파일용이므로 Replit 관리형 저장소의 백업으로 사용한 것으로 보고하지 않습니다.

이번 main 통합은 소스·문서 통합입니다. 원격 DB 변경·Replit 재배포와 구분합니다. 기존 PUB-01~15 / ADM-01~13 관리번호와 관리자 편집 기능을 유지하여 다음 작업을 진행합니다.
