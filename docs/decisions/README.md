# Architecture Decision Records (ADR)

HarnessAI 의 **주요 설계 결정** 을 구조적으로 기록. 각 ADR 은 Michael Nygard 스타일 (Context / Decision / Consequences) 을 따름.

> 상위 아키텍처는 [docs/ARCHITECTURE.md](../ARCHITECTURE.md) 참조. ADR 은 "왜 이렇게 결정했나" 를 상세히.

## 목록

| # | 제목 | Status | Date |
|---|---|---|---|
| [001](001-profile-based-architecture.md) | 프로파일 기반 아키텍처로의 전환 | Accepted | 2026-04-02 |
| [002](002-skeleton-section-ids.md) | Skeleton 섹션을 번호 기반 → ID 기반으로 | Accepted | 2026-04-05 |
| [003](003-harness-plan-state-machine.md) | 파이프라인 상태를 `harness-plan.md` 단일 파일로 | Accepted | 2026-04-07 |
| [004](004-ai-slop-as-7th-hook.md) | ai-slop 감지를 Reviewer 의 7번째 훅으로 통합 | Accepted | 2026-04-15 |
| [005](005-ha-skills-cut-over.md) | /my-\* 스킬 완전 삭제, /ha-\* 로 single cut-over | Proposed (Phase 4) | 2026-04-10 |

## 형식

새 ADR 추가 시:

```markdown
# ADR-NNN: <제목>

- **Status**: Proposed | Accepted | Deprecated | Superseded by ADR-XXX
- **Date**: YYYY-MM-DD
- **Deciders**: <이름>
- **Supersedes**: (선택) ADR-XXX

## Context
<문제 배경 + 증상>

## Decision
<결정 내용 + Evaluated alternatives>

## Consequences
### Positive / Negative / Neutral
<트레이드오프>

## Implementation
<코드 위치 + 검증 방법>

## References
<관련 ADR / 커밋 / 문서>
```

- 파일명: `NNN-kebab-case-title.md`
- 번호는 연속 증가, 한번 할당되면 재사용 X (Deprecated 돼도 파일 유지)
- Status 변경 시 Date 필드 옆에 "(updated: YYYY-MM-DD)" 추가
