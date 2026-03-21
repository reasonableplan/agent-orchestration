# code-J

시니어 수준의 코딩 어시스턴트 Claude Code 플러그인. 실전으로 배우고, 같은 실수를 반복하지 않는다.

## 기능

### 에이전트 (7개)
| 에이전트 | 역할 | 모델 |
|----------|------|------|
| `coder` | 테스트 우선, 프로덕션 수준 코드 생성 | Sonnet |
| `reviewer` | 학습 중심 코드 리뷰 (WHY 설명 + 심각도 등급) | Opus |
| `debugger` | 재현 우선, 근본 원인 분석 | Sonnet |
| `refactor` | 동작 보존하면서 코드 단순화 | Sonnet |
| `architect` | 아키텍처 분석/설계 가이드 (읽기 전용) | Opus |
| `test-engineer` | TDD 워크플로우 강제, 테스트 전략 | Sonnet |
| `lessons` | 실수 패턴 추적 및 반복 방지 | Sonnet |

### 스킬 (8개 슬래시 커맨드)
| 명령어 | 설명 |
|--------|------|
| `/spec [키워드]` | 프로젝트 문서 키워드 검색 |
| `/review [파일]` | 변경사항 또는 특정 파일 코드 리뷰 |
| `/lessons-learned [키워드]` | 과거 실수와 교훈 조회 |
| `/update-lessons` | 새로운 교훈 기록 |
| `/explain-diff [커밋]` | 코드 변경사항 학습용 설명 |
| `/impact [심볼]` | 변경 전 영향도 분석 |
| `/plan [기능]` | 구현 전 설계 계획 수립 |
| `/test [대상]` | TDD 워크플로우 실행 |

### MCP 도구
| 도구 | 설명 |
|------|------|
| `lessons_search` | 교훈 DB 키워드 검색 |
| `lessons_add` | 새 교훈 추가 |
| `impact_analyze` | 심볼 참조 검색 및 변경 영향도 분석 |

### 훅
| 이벤트 | 스크립트 | 목적 |
|--------|----------|------|
| UserPromptSubmit | `language-injector.mjs` | config의 언어 설정을 컨텍스트에 주입 |
| SessionStart | `session-start.mjs` | 교훈 요약을 세션에 로드 |
| PreToolUse(Bash) | `pre-bash-guard.mjs` | 위험한 명령어 경고 |
| PostToolUse(Write/Edit) | `post-write-check.mjs` | 흔한 실수 패턴 감지 |

### 교훈 데이터베이스
`lessons/` 디렉토리에 카테고리별 교훈 기록. 카테고리는 자동 생성됨 — `/update-lessons`로 추가, `/lessons-learned`로 조회.

## 설정

`config.json`에서 선호 언어를 설정:
```json
{
  "language": "ko"
}
```

지원 언어: `ko` (한국어), `en` (English), `ja` (日本語), `zh` (中文).

## 설치

`.code-j/` 디렉토리를 프로젝트 루트에 복사하면 됩니다. Claude Code가 `.claude-plugin/plugin.json` 매니페스트를 자동 감지합니다.

프로젝트별 규칙은 `CLAUDE.md`에서 자동으로 읽어옵니다. `lessons/`의 교훈은 프로젝트별로 관리하거나 공유할 수 있습니다.
