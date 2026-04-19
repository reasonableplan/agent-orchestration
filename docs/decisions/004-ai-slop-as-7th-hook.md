# ADR-004: ai-slop 감지를 Reviewer 의 7번째 훅으로 통합

- **Status**: Accepted
- **Date**: 2026-04-15
- **Related**: oh-my-claudecode 의 `/ai-slop-cleaner` 외부 스킬

## Context

Claude (및 다른 LLM) 으로 생성한 코드에는 **고유한 저품질 패턴** 이 있음:

- 장황한 docstring (코드보다 긴 설명)
- 의미 없는 try/except re-raise
- 쓰지 않는 `@click.pass_context` + `ctx` 파라미터
- 호출자 없는 helper 함수
- 이슈 번호 없는 TODO / FIXME 산재
- `_unused_` prefix 함수
- 임시 `pass  # later` 흔적
- 일관성 깨진 진행 표시 `[3/4]` (2/4 없음)

oh-my-claudecode 에 `/ai-slop-cleaner` 라는 외부 스킬이 있어 이를 통합할지 논의.

### 문제 증상 (code-hijack 1차 E2E 실제 발견)

- LLM 분석 카테고리별 진행 안 보임 (`[3/4] LLM 분석...` 만 찍고 10분 멈춤)
- `_BACKOFF_SECONDS = (1.0, 2.0, 4.0)` 정의 + `max_retries=2` 로 3번째 값 dead
- `@click.pass_context` + 안 쓰는 ctx 파라미터
- git clone stderr 을 사용자에게 그대로 노출

정리하면 **`/ha-review` 시점에 자동 감지** 가 필요.

## Decision

**ai-slop 감지를 `/ha-review` 의 7번째 훅으로 내장**. 기존 보안 훅 6개 (`security_hooks.py`) 와 대등한 위치.

### 구조

- 위치: `skills/ha-review/run.py::_AI_SLOP_PATTERNS` (정규식 리스트)
- 대상: `git diff main...HEAD` 또는 working tree diff
- 제외: docs/\*.md, templates/\*, .harness-backup-\* (false positive 차단 — commit `273fdb5` 에서 HTML 태그 + 백틱 인라인 추가 제외)
- 심각도: WARN / BLOCK (예: 임시 pass 는 BLOCK)

### 현재 7 패턴

| 패턴 | 심각도 | LESSON 연결 |
|---|---|---|
| 장황한 docstring (>200자) | WARN | — |
| 의미 없는 try/except (re-raise만) | WARN | — |
| 신규 TODO/FIXME (이슈번호 없음) | WARN | — |
| unused 함수 prefix (`_unused_`) | WARN | — |
| 임시 pass `# later` | **BLOCK** | — |
| dead 상수 | WARN | LESSON-018 |
| *(+ HTML/백틱 예외 필터 적용)* | | |

### Evaluated alternatives

1. **외부 `/ai-slop-cleaner` 스킬로 위임** — 리젝트. `/ha-review` 하나로 종합 리뷰 받고 싶음. 사용자가 스킬 2개 돌려야 하면 UX 악화.
2. **Reviewer LLM 이 판단 (텍스트만)** — 리젝트. LLM 은 이런 패턴을 LESSON 에 적어놔도 자주 놓침. 정규식 자동 감지가 확실.
3. **별도 CI 도구 (ruff plugin 등)** — 리젝트. 사용자가 추가 설치해야 함 + Python 외 언어 지원 안 됨.
4. **7번째 훅으로 내장 (채택)** — LLM 판단 (LESSON 텍스트 참조) + 정규식 자동 감지 하이브리드.

## Consequences

### Positive

- **사용자 워크플로우 단일** — `/ha-review` 하나로 보안 + LESSON + ai-slop 종합.
- **LESSON 과 자연 연계** — LESSON-018 처럼 "LESSON 에 적고 동시에 정규식 패턴도 등록" 가능.
- **언어 무관** — 정규식이라 Python/JS/TS/Go 등 공통 적용 (단 일부 패턴은 언어 특화).
- **외부 의존 0** — 레포 내에서 완결.

### Negative

- **정규식 fragility** — 실전에서 false positive 발생 (code-hijack 때 docs placeholder, ui-assistant 때 HTML 태그). 대응: `_strip_non_code_from_diff()` + `_HTML_TAGS` blacklist + inline-backtick 제거. 발견 시 즉시 제외 규칙 추가.
- **패턴 목록 유지 부담** — 새 AI slop 발견 시 수동 추가. 대응: LESSON 추가 루틴과 동일 (문서 + 정규식 pair).
- **언어 특화 패턴 제한** — 현재 패턴은 Python 편향. JS/TS 특화 슬롭 (예: React 과도한 useEffect) 은 별도 패턴 필요.

### Neutral

- 향후 LLM 기반 판단 추가 가능 — 지금은 정규식 only. 정규식으로 못 잡는 문맥 의존 슬롭은 Reviewer 에이전트 프롬프트가 보강.

## Implementation

- 코드: `skills/ha-review/run.py::_AI_SLOP_PATTERNS` + `_strip_non_code_from_diff` + `_ai_slop_scan`
- HTML/SVG 태그 제외: `_HTML_TAGS` frozenset (85개)
- 회귀 테스트: `backend/tests/orchestrator/test_skeleton_assembler.py` (`find_placeholders` 가 공유하는 로직)
- 프로파일 연계: `lessons_applied: [LESSON-018]` 선언 시 패턴 자동 적용

## References

- [ADR-002: Skeleton 섹션 ID](002-skeleton-section-ids.md) — ai-slop 이 diff 에서 docs/ 제외하는 이유와 관련
- `backend/docs/shared-lessons.md` LESSON-018/019/020
- commit `caaebf9` (LESSON-018~020 + ai-slop 패턴 7번째), `273fdb5` (HTML/백틱 false positive fix)
- 참고: oh-my-claudecode `/ai-slop-cleaner` (외부 스킬 — 본 구현의 영감)
