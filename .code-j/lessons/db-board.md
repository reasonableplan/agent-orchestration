---
name: DB/Board 분리 작업
description: Board-first 원칙, 상태 전이 필드 동기화, TOCTOU 원자화, STATUS_PRIORITY, PR 트리거 필터
type: lesson-group
category: db-board
lesson_count: 5
---

## 2. DB/Board 분리 작업 순서 — Board 먼저, DB 나중
- **실수**: DB를 먼저 업데이트 → Board 이동 실패 시 split-brain
- **결과**: BoardWatcher가 다음 sync에서 Board 상태로 덮어씀 → retry 영구 유실
- **규칙**: Board(외부) 먼저 변경 → 성공 후 DB(내부) 업데이트

## 4. completedAt/retryCount — 상태 전이 시 관련 필드 전부 업데이트
- **실수**: onTaskComplete에서 status만 업데이트, completedAt/retryCount 누락
- **결과**: AgentStats의 avgDurationMs 항상 null, retry 통계 0 고정
- **규칙**: updateTask 호출 시 체크리스트 — status, boardColumn, completedAt, retryCount, startedAt

## 5. TOCTOU — SELECT → UPDATE는 WHERE 조건으로 원자화
- **실수**: SELECT로 현재 상태 읽고, 별도 UPDATE 실행 (트랜잭션 없음)
- **결과**: 동시 접근 시 유효하지 않은 상태 전이 통과 가능
- **규칙**: `UPDATE ... WHERE status = :expected_status` 패턴으로 원자적 CAS 구현

## 25. STATUS_PRIORITY 선형 순서의 한계
- **실수**: failed(3) < review(4)로 설정 → Board에서 Failed 이동이 DB에 반영 안 됨
- **결과**: 수동으로 Failed 처리한 task가 영원히 review 상태로 남음
- **규칙**: `ALWAYS_SYNC = new Set(['failed', 'done'])` — 우선순위 비교 무시하고 항상 동기화

## 32. checkAndTriggerPR 필터 — agent 라벨 기반 필터링
- **실수**: `!type:commit && !type:pr` 필터가 type:branch도 포함
- **결과**: 모든 코드 완료되어도 PR auto-trigger 작동 안 함
- **규칙**: 코드 이슈 필터는 `agent:backend/frontend/docs` 양성(positive) 매칭
