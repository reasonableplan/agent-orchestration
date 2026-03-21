---
name: GraphQL API 안전성
description: GraphQL node() null 체크, pagination endCursor, rate limit 감지, mutation 존재 확인
type: lesson-group
category: graphql
lesson_count: 4
---

## 1. GraphQL null 응답 — 반드시 `result.node?.` 체크
- **실수**: `node(id: $projectId)` 쿼리에서 `result.node`가 null일 수 있는데 직접 접근
- **결과**: project ID 무효/삭제/권한 없음 시 TypeError 크래시
- **규칙**: GraphQL `node()` 쿼리 결과는 항상 optional chaining + null 시 throw/return
- **적용**: board-operations, issue-manager, project-setup 모든 GraphQL 호출

## 8. GraphQL pagination — endCursor null 체크 필수
- **실수**: `hasNextPage=true`인데 `endCursor=null`인 경우 미처리
- **결과**: 같은 첫 페이지 무한 반복 → API rate limit 소진
- **규칙**: `hasNextPage = page.pageInfo.hasNextPage && !!page.pageInfo.endCursor`

## 10. GraphQL RATE_LIMITED 감지 — HTTP 상태코드가 아닌 errors[].type 확인
- **실수**: HTTP 429만 체크, GraphQL `{ type: "RATE_LIMITED" }` 미감지
- **결과**: GraphQL rate limit 시 retry 없이 즉시 실패
- **규칙**: isRetryable에 `errors?.some(e => e.type === 'RATE_LIMITED')` 추가

## 19. 비존재 GraphQL mutation 사용 금지
- **실수**: `createProjectV2FieldOption` mutation은 GitHub API에 존재하지 않음
- **결과**: ensureColumns 항상 실패
- **규칙**: GraphQL mutation 작성 전 GitHub API schema/docs 확인 필수
