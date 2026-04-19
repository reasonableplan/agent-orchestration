# ADR-003: 파이프라인 상태를 `docs/harness-plan.md` 단일 파일로 관리

- **Status**: Accepted
- **Date**: 2026-04-07

## Context

v1 은 Orchestra 파이프라인 상태를 `.orchestra/state.json` 에 저장. 사용자가 직접 편집 불가능한 내부 포맷.

### 문제 증상

1. **투명성 부족** — 사용자가 "지금 어느 단계냐" 확인하려면 대시보드 서버 기동 필요. CLI 만 쓸 때 블랙박스.
2. **git 친화성 부족** — JSON state 는 merge conflict 시 수동 편집 난이도 높음. diff 도 읽기 어려움.
3. **사람이 수정하고 싶은 필드가 있음** — 진행 상태 강제 rollback, 프로파일 추가/제거, skeleton 섹션 추가 등. JSON 수동 편집은 오타 위험.
4. **Claude 에이전트가 참조하기도 어려움** — 에이전트에게 상태 주입하려면 별도 프롬프트 구성 필요.

## Decision

**`docs/harness-plan.md` 를 Single Source of Truth 로**. YAML frontmatter + Markdown body 형식.

```yaml
---
harness_version: 2
schema_version: 1
project_name: ui-assistant
created_at: '2026-04-17T17:39:50+00:00'
profiles:
  - { id: fastapi, path: backend/, status: confirmed }

skeleton_sections:
  required: [overview, stack, errors, interface.http, core.logic, tasks, notes]
  optional: [...]
  included: [overview, stack, ...]

pipeline:
  steps: [ha-init, ha-design, ha-plan, ha-build, ha-verify, ha-review]
  current_step: building
  completed_steps: [ha-design, ha-plan]
  skipped_steps: []
  gstack_mode: manual

verify_history:
  - step: ha-verify
    at: '2026-04-18T01:00:00+00:00'
    passed: true
    summary: pytest 127, ruff clean

tasks:
  - { id: T-001, status: done, agent: backend_coder, ... }
---

# <마크다운 본문 — 사람용 진행 노트>
```

### 상태 전이

```
init ─▶ designed ─▶ planned ─▶ building ─▶ built ─▶ verified ─▶ reviewed ─▶ shipped
                                   │
                                   └─ (review reject) ─▶ building
```

`plan_manager.py::PlanManager` 가 전이 로직 소유 + 허용 전이 강제.

### Evaluated alternatives

1. **JSON 유지** — 리젝트. 사람 편집 어려움.
2. **SQLite DB** — 리젝트. 오버엔지니어링, git diff 불가.
3. **TOML frontmatter** — 고려. 리젝트 (YAML 이 이미 프로파일에 쓰임 — 일관성).
4. **YAML frontmatter + Markdown (채택)** — 기계 파싱 (frontmatter) + 사람 노트 (본문) 동시 가능.

## Consequences

### Positive

- **git diff 로 상태 변화 추적 가능** — 커밋 로그가 곧 프로젝트 타임라인.
- **사람이 편집 가능** — rollback, 프로파일 추가 등 수동 개입 쉬움.
- **에이전트 컨텍스트 주입 간단** — 파일 전체를 프롬프트에 포함.
- **`harness validate --plan` 으로 스키마 강제** — 수동 편집 오류 감지.
- **프로젝트별 SSOT** — `docs/` 에 저장하므로 프로젝트 repo 에 자연스레 커밋.

### Negative

- **동시 쓰기 위험** — Orchestra 가 쓸 때 사용자도 편집 중이면 race. 대응: `plan_manager.save()` 가 read-modify-write + 실패 시 재시도.
- **frontmatter 크기 증가 시 가독성 저하** — tasks 100+ 쌓이면 YAML 이 길어짐. 대응: body 로 이동 고려 (향후).
- **YAML 파싱 의존** — PyYAML 런타임 필요.

### Neutral

- 사람이 뭘 고치든 `harness validate --plan` 만 통과하면 OK. 실수 유도는 문서 + 린트 체크로.

## Implementation

- 스키마 정의: `backend/src/orchestrator/plan_manager.py::HarnessPlan`
- 전이 로직: `PlanManager.transition(new_state, completed_step=...)`
- 검증: `harness/bin/harness validate --plan <path>`
- 상태 전이 테스트: `backend/tests/orchestrator/test_plan_manager.py`

## References

- `docs/ARCHITECTURE.md` §4 "State Machine"
- commit `45e4b62` (plan_manager 신규)
