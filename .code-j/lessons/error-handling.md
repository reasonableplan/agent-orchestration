---
name: 에러 처리
description: 빈 catch 금지, NOT_FOUND만 삼킴, Promise.allSettled, server listen reject, config requireAll
type: lesson-group
category: error-handling
lesson_count: 5
---

## 12. 에러 삼킴 금지 — catch {} 에서 에러 종류 구분
- **실수**: project-setup에서 모든 에러를 catch → null 반환 → 중복 프로젝트 생성
- **결과**: 일시적 네트워크 오류가 "not found"로 처리됨
- **규칙**: catch에서 NOT_FOUND/404만 삼키고, 나머지는 re-throw

## 23. retryCount 이중 증가 금지 — 단일 소유자 원칙
- **실수**: onTaskComplete에서 retryCount++, retryOrFail에서도 retryCount++
- **결과**: 3회 재시도 예산이 실제로는 1~2회만 사용 가능
- **규칙**: retryCount 증가는 한 곳(retryOrFail)에서만

## 24. Promise.all vs Promise.allSettled — DB 배치 쿼리에는 allSettled
- **실수**: hook-registry dispatch()에서 Promise.all → 하나 실패 시 전체 무력화
- **결과**: DB 일시 오류 시 모든 hook 침묵
- **규칙**: 독립적 DB 쿼리 배치는 `Promise.allSettled` + 개별 실패 로깅

## 30. server listen() reject — EADDRINUSE 처리
- **실수**: `new Promise(resolve)` only → 포트 충돌 시 Promise never settles
- **규칙**: `httpServer.once('error', reject)` 추가, 성공 시 removeListener

## 38. config requireAll — fallback이 있어도 프로덕션에서는 검증
- **실수**: `requireAll && !fallback` 조건으로 fallback 있으면 검증 스킵
- **규칙**: `requireAll`이면 무조건 검증. fallback은 개발 환경 편의용
