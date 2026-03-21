---
name: 재시도 및 회복력
description: withRetry 일관성, off-by-one, consecutiveErrors 리셋, CircuitBreaker 상태 전이
type: lesson-group
category: retry-resilience
lesson_count: 4
---

## 9. withRetry 일관성 — 모든 외부 API 호출에 적용
- **실수**: getIssue, createBranch, createPR, getAllProjectItems에 withRetry 누락
- **결과**: 일시적 네트워크 오류로 전체 작업 실패
- **규칙**: 외부 API 호출(REST/GraphQL) 추가 시 반드시 withRetry 래핑 확인
- **체크리스트**: `octokit.rest.*`, `graphqlWithAuth()` 호출 → withRetry 있는지?

## 15. off-by-one in retry — `< maxRetries` vs `< maxRetries - 1`
- **실수**: `retryCount < 3`이 4번 실행을 허용 (0, 1, 2 → 3번째까지 재시도)
- **규칙**: "최대 N회 시도" = `retryCount < N - 1` (초기 시도 1 + 재시도 N-1)

## 22. consecutiveErrors 리셋 타이밍 — 성공적 poll 후 즉시 리셋
- **실수**: task를 찾아서 완료했을 때만 리셋 → task 없는 정상 poll에서도 backoff 유지
- **결과**: 일시 오류 후 복구해도 불필요하게 느린 폴링 지속
- **규칙**: findNextTask()가 throw 없이 반환하면 즉시 `consecutiveErrors = 0`

## 27. CircuitBreaker HALF_OPEN 전이 시 failures 리셋
- **실수**: OPEN→HALF_OPEN 전이 시 failures 카운터를 리셋하지 않음
- **결과**: probe 실패 후 failures 값이 누적되어 메트릭 무의미
- **규칙**: 상태 전이 시 관련 카운터 전부 초기화
