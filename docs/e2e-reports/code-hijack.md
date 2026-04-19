# E2E 1차: code-hijack (Python CLI)

HarnessAI v2 의 **첫 실전 검증**. 시스템이 만들어지자마자 그 시스템으로 만든 첫 프로젝트.

## 프로젝트

- **이름**: code-hijack
- **목적**: 시니어 코드베이스를 LLM 으로 분석해 AI 에이전트용 코딩 규칙 자동 추출
- **스택**: Python 3.12, click (CLI), anthropic SDK, pytest
- **위치**: `C:/Users/juwon/OneDrive/Desktop/code-hijack`
- **프로파일**: `python-cli`
- **규모**: small (Phase 1 MVP + Phase 2 확장)

## 타임라인

| 날짜 | 이벤트 | 결과 |
|---|---|---|
| 2026-04-17 03:13 | `/ha-init` — 프로파일 감지 + skeleton 생성 | python-cli 단일 프로파일 |
| 2026-04-17 04~11 | `/ha-design` → `/ha-plan` → `/ha-build` | Phase 1 MVP 태스크 완주 |
| 2026-04-17 11:38 | **`/ha-verify` #1** | pytest 127 passed, ruff clean |
| 2026-04-17 11:40 | **`/ha-review` #1** | APPROVE — 0 BLOCK, 1 WARN (false positive), **4 권장사항** |
| 2026-04-17 11~12 | Phase 2 확장 태스크 | 추가 기능 구현 |
| 2026-04-17 11:59 | **`/ha-verify` #2** | pytest **169** passed, ruff clean |
| 2026-04-17 12:00 | **`/ha-review` #2** | APPROVE — 0 BLOCK, 0 WARN (source), 4 non-blocking 권장 |

## 발견된 이슈 (Phase 1 리뷰)

`/ha-review` 가 잡은 4개 + 1 false positive. 이 중 **5개가 HarnessAI v2 개선의 직접 원인**:

### 1. `<pkg>` 플레이스홀더 가짜 양성 (false positive)

skeleton.md 의 TODO 템플릿에 있는 `<pkg>` 를 ai-slop 이 실제 placeholder 로 잘못 감지 (1 WARN).

**HarnessAI 반영**: `_strip_non_code_from_diff` 함수 추가. docs/*.md, templates/* 는 ai-slop 스캔 제외. (commit `caaebf9` 이전 작업)

### 2. OUTPUT_001 예외 문서화 부실

CLI 가 `OUTPUT_001` 에러를 던지는데 사용자에게 보이는 메시지가 "출력 디렉토리 이미 존재 — 덮어쓰려면 --force" 없이 그냥 코드만 노출. LESSON-019 (stderr 사용자 친화 번역) 의 원형.

**HarnessAI 반영**: [LESSON-019](../../backend/docs/shared-lessons.md) 신규. fastapi + python-cli 프로파일에 `lessons_applied` 로 강제 적용.

### 3. `@click.pass_context` + 안 쓰는 `ctx` 파라미터

데코레이터는 붙였는데 함수 본문에서 ctx 미사용. 전형적 AI slop 패턴 (LLM 이 템플릿 답습).

**HarnessAI 반영**: ai-slop 훅에 "unused ctx" 류 패턴 추가 예정 (LESSON-018 "dead constants" 와 유사 계열). 현재는 LESSON 텍스트 기반 리뷰어 판단.

### 4. `build_layer_stats()` — 호출자 없는 helper

정의는 됐으나 어디서도 호출 안 함. Dead code.

**HarnessAI 반영**: `/ha-review` 에 dead code 감지 자체는 기존. 하지만 **dead 상수** (LESSON-018 `_BACKOFF_SECONDS = (1.0, 2.0, 4.0)` + `max_retries=2` → 3번째 값 사용 안 됨) 는 ai-slop 정규식으로 자동 감지 가능. 이 발견이 [LESSON-018](../../backend/docs/shared-lessons.md) 의 직접 계기.

### 5. 진행 표시 `[N/4]` 작동 안 함

`click.echo("[3/4] LLM 분석 중...")` 출력 후 내부에서 90% 시간 소요. 사용자는 멈춘 줄 착각.

**HarnessAI 반영**: [LESSON-020](../../backend/docs/shared-lessons.md) 신규. 2초+ 걸리는 단계는 내부 진행 표시 필수 (예: `[3/4] LLM 분석 (architecture 1/3)`).

## Phase 2 추가 발견 (v2 개선 후 재검증)

Phase 1 반영본으로 Phase 2 리뷰 돌린 결과:
- **0 BLOCK / 0 WARN (source 기준)** — 자가 개선 성공.
- 다만 "진행표시 [2/4] 지속 미반영" — **LESSON-020 이 존재해도 반복됨**. 시사점: LESSON 이 있어도 Reviewer LLM 이 매번 catch 하진 못함. 이게 ai-slop 자동 감지 필요성의 증거.

## HarnessAI 에 반영한 산출물

Phase 1 의 5 갭 → v2 에 **직접 반영** (Phase 3 후처리 + 본 세션 A1-A7):

| code-hijack 발견 | HarnessAI 반영 | 커밋 |
|---|---|---|
| 1. skeleton TODO false positive | `_strip_non_code_from_diff` | (Phase 3 후처리) |
| 2. stderr 번역 부실 | **LESSON-019** | `caaebf9` |
| 3. 진행 표시 껍데기 | **LESSON-020** | `caaebf9` |
| 4. dead 상수 | **LESSON-018** + ai-slop 정규식 (7번째 훅) | `caaebf9` |
| 설정 하드코딩 6곳 분산 | **_base.md §10 설정 중앙화** + python-cli/fastapi 구체화 | `caaebf9` 이후 |
| skeleton `io/` 선언 vs 실제 `core/` | **harness integrity 게이트** 신규 (A5) | `715f585` |

## 정량 지표

| 지표 | Phase 1 | Phase 2 |
|---|---|---|
| pytest passed | 127 | **169** |
| ruff | clean (13 auto-fixed) | clean |
| `/ha-review` verdict | APPROVE | APPROVE |
| BLOCK 이슈 | 0 | 0 |
| WARN 이슈 | 1 (false positive) | 0 (source) |
| 권장사항 | 4 | 4 non-blocking |
| 소요 시간 (design → review) | ~8h | ~1.5h (증분) |

## 교훈 (meta)

### 1. false positive 는 실전에서만 발견된다

skeleton TODO placeholder → ai-slop 오탐. 개발 중 단위 테스트로는 못 잡음. **실제 프로젝트 적용 → 즉시 드러남**. 이후 2차 (ui-assistant) 에서 HTML 태그 + 백틱 인라인 false positive 도 같은 방식으로 발견.

### 2. LESSON 텍스트만으론 부족. 자동 감지 필요.

LESSON-020 (진행 표시) 이 Phase 1 에서 정립됐는데 Phase 2 에서도 같은 실수 반복. Reviewer LLM 이 매번 모든 LESSON 을 정확히 참조하진 못함. **정규식 기반 자동 감지 (ai-slop 훅 7번째)** 가 LESSON-018 부터 적용된 이유.

### 3. "시스템이 자기 실수로 학습한다" 가 실제로 가능

code-hijack 발견 → v2 코드 반영 → ui-assistant 에서 같은 실수 자동 차단. **피드백 루프 증명**. 포트폴리오에 보여줄 수 있는 단단한 증거.

### 4. 프로파일 기반 아키텍처 ([ADR-001](../decisions/001-profile-based-architecture.md)) 이 없었다면 시작 자체 불가

code-hijack 은 순수 Python CLI. v1 의 하드코딩 4스택 (fastapi/nextjs/react-native/electron) 어디에도 안 맞음. 프로파일 시스템 (python-cli.md) 이 있어서 진행 가능. **v1 이라면 프로젝트가 시작도 못 했다**.

## 관련 자료

- **code-hijack 레포**: `C:/Users/juwon/OneDrive/Desktop/code-hijack` (사용자 로컬)
- **HarnessAI 반영 커밋**: `caaebf9`, `715f585`, `d06c037`, ...
- **관련 LESSON**: [018/019/020](../../backend/docs/shared-lessons.md)
- **관련 ADR**: [001](../decisions/001-profile-based-architecture.md), [004](../decisions/004-ai-slop-as-7th-hook.md)
- **이번 세션 전체 흐름**: [CHANGELOG.md](../../CHANGELOG.md)
