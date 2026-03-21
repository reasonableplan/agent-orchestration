---
name: 비동기 생명주기 관리
description: subscribe/unsubscribe, cancelled 플래그, RAF 정리, pause/resume 레이스, MessageBus 재진입, shutdown 멱등성
type: lesson-group
category: async
lesson_count: 7
---

## 3. 이벤트 구독 정리 — subscribe 했으면 drain()에서 unsubscribe
- **실수**: BaseAgent.subscribe() 호출 후 drain()에서 정리 안 함
- **결과**: 에이전트 shutdown 후에도 MessageBus가 핸들러 참조 유지, GC 불가
- **규칙**: subscribe 호출 시 배열에 추적, drain()에서 전부 unsubscribe

## 6. async 작업 취소 — 컴포넌트 언마운트 시 cancelled 플래그 필수
- **실수**: prerenderCharactersAsync() fire-and-forget → 언마운트 후 ref 접근
- **규칙**: useEffect 안 async 작업에 `let cancelled = false` + cleanup에서 `cancelled = true`

## 7. requestAnimationFrame 정리 — setTimeout 안 RAF도 취소 대상
- **실수**: setTimeout 콜백 안에서 requestAnimationFrame 호출 → cleanup이 커버 못함
- **규칙**: RAF ID는 항상 ref에 저장, cleanup에서 cancelAnimationFrame 호출

## 21. pause()/resume() 레이스 — 이전 pollLoop 종료 대기 필수
- **실수**: resume()에서 이전 pollPromise를 await 안 함 → 두 개의 pollLoop 동시 실행
- **결과**: 같은 에이전트가 동시에 두 task를 claim
- **규칙**: resume() 진입 시 `if (this.pollPromise) await this.pollPromise` 후 새 loop 시작

## 26. MessageBus publish 재진입 방지 — handler 리스트 스냅샷
- **실수**: publish() 중 handler가 같은 타입 publish → 무한 루프 가능
- **규칙**: `const handlers = [...this.emitter.listeners(type)]` 스냅샷 후 순회

## 28. 이중 시그널 핸들러 금지 — shutdown 소유자는 하나
- **실수**: bootstrap이 SIGINT/SIGTERM 등록 + main/index.ts에서 또 등록
- **결과**: 시그널 시 cleanup() 2번 실행 → DB 커넥션 이중 해제
- **규칙**: 시그널 핸들러는 bootstrap에서만 등록, 추가 cleanup은 shutdown 콜백 체인으로

## 29. shutdown 멱등성 가드 — `shuttingDown` 플래그
- **실수**: context.shutdown() 2번 호출 시 dashboard.close() 이중 실행
- **결과**: ERR_SERVER_NOT_RUNNING 에러
- **규칙**: `let shuttingDown = false` 가드로 첫 호출만 실행
