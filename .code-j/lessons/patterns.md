---
name: 핵심 구현 패턴
description: extractJSON bracket-matching, ClaudeClient 로컬 복사본, race condition 방지, 동시 접근 가드
type: lesson-group
category: patterns
lesson_count: 3
---

## extractJSON 패턴
- greedy regex 대신 **bracket-matching 알고리즘** 사용
- `extractBalancedJSON()`: depth 카운팅 + string escape 처리
- 모든 ClaudeClient에 동일하게 적용

## ClaudeClient 패턴
- 각 패키지에 ClaudeClient 로컬 복사본 유지 (다른 패키지에서 import하지 말 것)
- `isRetryable()`: 401/403/invalid는 non-retryable, 나머지는 retryable
- `withRetry()`: 로거로 retry 시도 로깅 필수, jitter 추가 필수
- 로거 이름: 패키지별 고유 이름

## Race Condition 방지
- BoardWatcher: `syncing` 플래그로 동시 sync() 방지
- BaseAgent: `setTimeout` 재귀 (setInterval X)
- StateStore.claimTask(): 낙관적 잠금 (UPDATE WHERE status='ready')
- BaseAgent.findNextTask(): claimTask 후 GitHub API 실패 시 DB 롤백 필수

## 11. 동시 접근 가드 — check-then-act에 Map<key, Promise> 패턴
- **실수**: workspace-manager에서 같은 epicId 동시 clone → 충돌
- **규칙**: `inProgress = new Map<string, Promise>()` — 같은 키 요청은 기존 Promise 재사용
