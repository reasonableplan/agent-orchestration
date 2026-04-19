# ADR-002: Skeleton 섹션을 번호 기반에서 ID 기반으로 전환

- **Status**: Accepted
- **Date**: 2026-04-05
- **Deciders**: reasonableplan
- **Supersedes**: v1 의 "섹션 1~19" 번호 체계

## Context

v1 skeleton.md 는 **번호 기반** 섹션 구조:

```
섹션 1  — 프로젝트 개요
섹션 2  — 기능 요구사항
섹션 3  — 기술 스택
...
섹션 7  — API 스키마
섹션 8  — UI/UX
섹션 19 — 워크플로우
```

에이전트 프롬프트는 `skeleton 섹션 7 를 읽고 ...` 식으로 번호 참조.

### 문제 증상

1. **섹션 추가/제거 시 번호 재정렬 → 모든 에이전트 프롬프트 깨짐**. 예: 섹션 5 (인증) 을 9번으로 옮기면 agent/architect/CLAUDE.md, designer/CLAUDE.md, reviewer/CLAUDE.md 전부 수정.
2. **스택별 필요 섹션이 다른데 번호 체계 강제** → CLI 프로젝트는 UI 섹션 (섹션 8) 이 빈 섹션으로 남거나 "N/A" 채움. 번호는 유지되나 의미 없음.
3. **모노레포에서 섹션 8 (UI) 이 프로파일별 다른 의미** — fastapi 에선 X, react-vite 에선 핵심. 번호 체계 하나로 둘 다 표현 불가.
4. **refactor-safety 0** — 그냥 번호가 바뀌면 끝.

## Decision

**섹션을 문자열 ID (snake_case / dot.case) 로 식별**. 20개 표준 ID:

```
overview · requirements · stack · configuration · errors · auth ·
persistence · integrations · interface.{http,cli,ipc,sdk} ·
view.{screens,components} · state.flow · core.logic ·
observability · deployment · tasks · notes
```

- 각 섹션은 `harness/templates/skeleton/<id>.md` 조각 파일로 저장
- 프로파일이 `skeleton_sections.required / optional / order` 로 포함 여부 지정
- 에이전트 프롬프트의 섹션 참조도 ID 로 전환 (`interface.http 섹션 ...`)
- `SkeletonAssembler.assemble(section_ids)` 가 `{{section_number}}` 플레이스홀더를 렌더 시점에 실제 인덱스로 치환

### Evaluated alternatives

1. **번호 유지 + alias 맵** — 리젝트. 결국 두 벌 유지 부담.
2. **Heading 텍스트 매칭** — 리젝트. Markdown H2 텍스트 변경 시 깨짐.
3. **UUID** — 리젝트. 사람이 못 읽음.
4. **snake_case / dot.case ID (채택)** — 사람/기계 양쪽에 직관적. 네임스페이스 의미 (`interface.*`, `view.*`) 가 부수 이득.

## Consequences

### Positive

- **섹션 추가/제거 자유**. 새 ID (`integrations.webhook`) 추가해도 기존 참조 영향 X.
- **프로파일별 선택 포함** — CLI 프로파일은 `interface.cli` 만, fastapi 는 `interface.http` + `persistence` + ... 로 자연스러운 선택.
- **에이전트 프롬프트 refactor-safe** — ID 참조는 이름이 명시적.
- **네임스페이스 효과** — `interface.http`, `interface.cli`, `interface.ipc`, `interface.sdk` 묶여 의미 전달.

### Negative

- **v1 마이그레이션 필요** — 기존 agents/*/CLAUDE.md 27개 섹션 참조 번호 → ID 전환 (이미 완료, commit `6749c9f`).
- **조각 파일 많아짐** (20개) — 대신 각 파일이 짧고 독립적.
- **{{section_number}} 치환 로직 필요** — `SkeletonAssembler.assemble` 이 render 시점에 1부터 순번 붙임. 번호 원하는 사용자/프롬프트 호환.

### Neutral

- 프로파일이 선언한 `order` 에 따라 번호가 달라짐 (같은 ID 가 CLI 프로젝트와 fastapi 프로젝트에서 다른 순번). 의도적 — 스택별 자연 순서 존중.

## Implementation

- 코드: `backend/src/orchestrator/skeleton_assembler.py`, `context.py::AGENT_SECTIONS_BY_ID`, `extract_section_by_id()`
- 조각 파일: `harness/templates/skeleton/<id>.md` 20개
- 테스트: `backend/tests/orchestrator/test_skeleton_assembler.py` (19 tests)
- 스키마 검증: `harness/bin/harness validate` 가 `STANDARD_SECTION_IDS` 상수로 허용 ID 화이트리스트

## References

- [ADR-001: 프로파일 기반 아키텍처](001-profile-based-architecture.md) — 프로파일이 섹션 ID 선택
- `docs/ARCHITECTURE.md` §3 "Skeleton 시스템"
- commit `924446a` (output_parser section ID 지원), `6749c9f` (agents CLAUDE.md ID 전환)
