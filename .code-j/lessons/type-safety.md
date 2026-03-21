---
name: 타입 안전성
description: as 캐스트 최소화, readonly mutation 금지, DB 스키마 동기화, WS payload spread 금지
type: lesson-group
category: type-safety
lesson_count: 4
---

## 14. readonly 필드 mutation 금지 — as 캐스트로 우회하지 말 것
- **실수**: `readonly config`를 `as Record<string, unknown>`으로 캐스트해서 변경
- **결과**: 타입 시스템 무효화, 런타임 버그 추적 불가
- **규칙**: mutable 런타임 상태는 별도 `private _runtimeConfig` 필드로 분리

## 36. WS payload 타입 안전성 — raw spread 금지
- **실수**: `updateTask(id, payload as Record<string, unknown>)` → 서버 필드 누수
- **결과**: TaskState에 알 수 없는 키 삽입, 타입 무결성 파괴
- **규칙**: WS 메시지에서 알려진 필드만 destructure하여 store에 전달

## 40. AgentConfig 타입 일관성 — DB 스키마와 동기화
- **실수**: `taskTimeoutMs`, `pollIntervalMs`가 AgentConfig에서 optional, AgentConfigRow에서 required
- **결과**: 타입 불일치로 `?? default` 가드 남발
- **규칙**: DB에 NOT NULL + DEFAULT가 있는 필드는 타입에서도 required로 선언

## 기타. claimTask rowCount / taskRowToTask status 캐스트
- **규칙**: `(result as { rowCount?: number }).rowCount ?? 0` — 안전한 캐스트 패턴
- **규칙**: `(row.status as Task['status']) ?? 'in-progress'` — DB값 보존
- **규칙**: null guard: `if (!this.workDir) return [];` 같은 방어 코드
