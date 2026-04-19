# ADR-001: 프로파일 기반 아키텍처로의 전환

- **Status**: Accepted
- **Date**: 2026-04-02
- **Deciders**: reasonableplan
- **Supersedes**: (v1 하드코딩 스택 방식)

## Context

HarnessAI v1 은 `fastapi / nextjs / react-native / electron` 4개 스택을 **구현 스킬마다 하드코딩** 했다. `/my-db`, `/my-api`, `/my-ui`, `/my-logic` 각각에 스택 분기가 있어 분기마다 중복 로직.

### 문제 증상

1. **새 스택 추가 비용**: Python CLI 지원 추가하려면 4개 스킬 본문을 각각 수정. 라이브러리·모바일·데스크탑 확장 시 4개 × N stacks 행렬.
2. **중복 유지보수**: 허용 라이브러리 화이트리스트, 컨벤션, toolchain 명령이 각 스킬마다 복사되어 있어 일관성 drift.
3. **모노레포 불가**: FE+BE 동시 프로젝트는 스킬 실행 전 "어느 스택이냐" 명확히 구분해야 함 — 실전에서 빈번하게 실패.
4. **실제 사례**: code-hijack (순수 Python CLI) 은 v1 4스택 어디에도 안 맞아서 프로젝트 자체 진행 불가했음.

## Decision

**스택 규칙을 1 개 파일로 선언 + 스킬은 프로파일을 읽는 방식으로 전환**.

- `~/.claude/harness/profiles/<stack>.md` 한 파일이 스택 하나의 **모든 규칙** 을 담는다:
  - 감지 규칙 (`detect.files`, `detect.contains`)
  - 컴포넌트 목록 (`components` — 필수/선택)
  - skeleton 섹션 요구 (`skeleton_sections`)
  - toolchain 명령 (test/lint/type/format)
  - 허용 의존성 (`whitelist.runtime`, `whitelist.dev`)
  - 과거 실수 적용 (`lessons_applied`)
- 프로파일들은 `_base.md` 를 상속 (YAML frontmatter `extends: _base`).
- `_registry.yaml` 에 전역 감지 순서/우선순위.
- 스킬 (`/ha-init`, `/ha-design`, ...) 은 **스택 분기 없음** — 프로파일을 동적으로 로드해 사용.

### Evaluated alternatives

1. **기존 v1 유지 + 스택마다 스킬 추가** — 리젝트. 행렬 폭발.
2. **단일 "generic" 스킬 + LLM 이 스택 판단** — 리젝트. 매번 다르게 판단할 위험.
3. **JSON schema 기반 설정** — 고려. 리젝트 (사람이 편집하기 힘듦, Markdown body 부족).
4. **프로파일 기반 (채택)** — YAML frontmatter (기계 파싱) + Markdown body (사람 설명) 겸용. `harness validate` CLI 로 스키마 강제.

## Consequences

### Positive

- **새 스택 추가 비용 → 1 파일**. flutter / swift-ui / rust-axum 등 확장 가능.
- **모노레포 자연 지원** — `profile_loader.detect()` 가 여러 프로파일 매칭 반환 (backend/ → fastapi, frontend/ → react-vite).
- **스킬 코드 감소** — `/my-*` 12개가 `/ha-*` 7개로 축소 (Phase 4 에서 /my-* 완전 삭제).
- **Claude 에이전트에 주입할 컨텍스트 단일 소스** — 프로파일 body 가 그대로 시스템 프롬프트에 포함.

### Negative

- **스키마 drift 위험** — 프로파일 파일마다 frontmatter 형식 차이 발생 가능. 대응: `harness validate` CLI 로 CI 수준 검증.
- **프로파일 수정은 전역 영향** — 한 프로파일 버그가 그 스택 모든 프로젝트에 파급. 대응: 로컬 override (`{project}/.claude/harness/profiles/<stack>.md`) 지원.
- **감지 규칙의 모호성** — 같은 `pyproject.toml` 에 fastapi + python-cli 키워드 모두 있으면 둘 다 매칭. 대응: `not_contains` 규칙 + `status: confirmed/draft` 필드로 우선순위.

### Neutral

- `/my-*` 12개는 Phase 4 까지 병행 유지 (backward compat). 이후 삭제 (ADR-005).
- v1 프로젝트 마이그레이션은 수동 — skeleton 번호 → ID 매핑 (ADR-002) 이 단일 큰 변환.

## Implementation

- 코드: `backend/src/orchestrator/profile_loader.py::ProfileLoader`
- 스키마 검증: `harness/bin/harness validate profiles`
- 본 레포 내 프로파일: `harness/profiles/` 5개 (fastapi, react-vite, python-cli, python-lib, claude-skill)
- 테스트: `backend/tests/orchestrator/test_profile_loader.py`

## References

- [ADR-002: Skeleton section ID 체계](002-skeleton-section-ids.md) — 이 ADR 의 `skeleton_sections` 필드 전제
- [ADR-005: /my-* → /ha-* cut-over](005-ha-skills-cut-over.md) — v1 스킬 삭제 계획
- `docs/ARCHITECTURE.md` §2 "프로파일 시스템"
- `docs/harness-v2-design.md` §3 (설계 배경 상세)
