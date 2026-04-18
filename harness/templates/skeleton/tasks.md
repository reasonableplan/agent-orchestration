---
id: tasks
name: 태스크 분해
required_when: always
description: /ha-plan이 채운다 — skeleton의 타 섹션을 읽어 구현 태스크 목록 생성
---

## {{section_number}}. 태스크 분해

> 이 섹션은 `/ha-plan` 스킬이 자동으로 채웁니다. 직접 편집하지 마세요.
> 수동 변경이 필요하면 `/ha-plan --reset` 후 재생성하세요.

### 태스크 목록
| ID | Component | Path | Depends | Description | Status |
|----|-----------|------|---------|-------------|--------|
| T-001 | <component_id> | <path> | — | <한 줄 설명> | pending |

### 의존성 그래프
```
(ha-plan이 생성)
```

### 병렬 실행 가능 조합
(ha-plan이 생성)

### 진행 상태
- `pending` — 아직 시작 안 함
- `in-progress` — `/ha-build` 실행 중
- `done` — 구현 + 검증 완료
- `blocked` — 의존성 미해결 또는 실패 지속
