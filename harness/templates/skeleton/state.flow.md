---
id: state.flow
name: 상태 흐름
required_when: has.complex_state
description: 상태 머신, 전이 규칙, 불변식
---

## {{section_number}}. 상태 흐름

### 엔티티별 상태 머신

#### `<엔티티 이름>` (예: Order, Habit, User)

**상태 목록**:
- `<state_a>` — <설명>
- `<state_b>` — <설명>

**전이 다이어그램**:
```
<state_a> ──<action_1>──→ <state_b>
         ──<action_2>──→ <state_c>

<state_b> ──<action_3>──→ <state_d>

<state_c> (터미널)
<state_d> (터미널)
```

**전이 규칙**:
| 현재 | 액션 | 다음 | 조건 |
|------|------|------|------|
| `<a>` | `<action_1>` | `<b>` | <precondition> |
| `<a>` | `<action_2>` | `<c>` | <precondition> |

### 도메인 계산 규칙 (예: 스트릭 계산)

```
기준일: today (서버 날짜)
완료 기록 집합: Set<date>

1. today ∈ 완료 → cursor = today
2. today ∉ 완료, (today-1) ∈ 완료 → cursor = today-1
3. 그 외 → streak = 0

cursor부터 역방향 반복:
  cursor ∈ 완료 → streak++, cursor -= 1일
  else → 종료
```

### 불변식 (Invariants)
- <예: "사용자당 같은 습관은 하루 1회만 체크 가능">
- <예: "삭제된 엔티티는 조회 목록에 포함되지 않는다">

### 동시성 / Race 조건 대응
- <예: 낙관적 잠금 vs 비관적 잠금>
- <예: idempotency key로 중복 요청 방지>

> 작성 가이드:
> - 상태는 영속 데이터와 일치 (persistence 섹션 참조)
> - 전이 규칙은 모든 경우 exhaustive 커버
> - 불변식은 테스트로 검증 가능한 형태로 기술
