---
name: 테스트 및 Mock 규칙
description: Drizzle ORM mock 체인, interface 변경 시 mock 동기화, vitest alias
type: lesson-group
category: testing
lesson_count: 2
---

## Mock 작성 시 주의사항
- **Drizzle ORM mock**: `select().from().where()` 전체 체인을 반드시 mock
  - 패턴: `_queueSelectResults()` 클로저 방식으로 순차적 쿼리 결과 제공
  - `update().set().where()` 체인도 동일하게 mock 필요
- **IGitService mock**: `addComment` 메서드 빠뜨리지 말 것
- interface에 메서드 추가하면 **모든 mock 파일**을 즉시 업데이트할 것

## 테스트 작성 원칙
- 새 기능 추가 시 테스트도 같이 작성
- interface 변경 시 관련 mock 전부 업데이트
- vitest alias: 새 @agent/* 패키지 추가 시 vitest.config.ts에 alias 추가
- SQL 필터 추가하면 테스트 mock도 해당 체인 지원하도록 업데이트
