---
name: React/Canvas 대시보드
description: useEffect 무한루프, RAF 정리, Canvas 매직넘버, 슬롯 bounds check, WS 재연결
type: lesson-group
category: react-canvas
lesson_count: 4
---

## 17. useEffect deps — 상태를 effect 안에서 읽으면 deps에 포함
- **실수**: CharacterOverlay에서 `positions` Map을 effect 안에서 비교하는데 deps에 미포함
- **결과**: 매 프레임 불필요한 setPositions 호출 (stale closure)
- **규칙**: ESLint exhaustive-deps 규칙 활성화, 의도적 제외 시 주석으로 사유 기록

## 34. useEffect에서 state 읽기 + set → 무한 루프 패턴
- **실수**: `positions` state를 effect 안에서 비교 후 setPositions → deps에 positions 포함
- **결과**: set → re-render → effect → set → 무한 루프
- **규칙**: effect 안에서 비교용 state는 별도 ref로 추적, state를 deps에서 제외

## 35. Canvas 좌표 매직넘버 금지 — 상수 사용
- **실수**: `CHAR_H + 8` 하드코딩 (실제 PADDING은 16)
- **규칙**: `CHAR_H + PADDING` 형태로 상수 참조, 매직넘버 사용 시 주석 필수

## 37. 슬롯 할당 bounds check — 배열 범위 초과 방지
- **실수**: `while (usedSlots.has(nextSlot))` 루프에 `< DESK_SLOTS.length` 가드 없음
- **결과**: 슬롯 8 이상 할당 → DESK_SLOTS[8] = undefined → 위치 계산 실패
- **규칙**: 인덱스 증가 루프에 항상 배열 길이 상한 체크

## 18. WebSocket 영구 차단 방지
- **실수**: 20회 실패 후 영구 차단, 서버 기동 후에도 재연결 불가
- **규칙**: max retry 도달 시 "Retry" 버튼 표시 또는 reconnectAttempt 리셋 경로 제공
