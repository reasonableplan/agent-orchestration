---
name: 설정 및 환경
description: 환경변수 3곳 동기화, CRLF 호환 정규식, Windows process.emit, event-mapper 동기화
type: lesson-group
category: config-env
lesson_count: 4
---

## 13. 환경변수 이름 일관성 — config.ts와 .env.example 동기화
- **실수**: config.ts는 `CORS_ALLOWED_ORIGINS`, .env.example은 `CORS_ORIGINS`
- **결과**: 배포 환경에서 CORS 설정 무시
- **규칙**: 환경변수 추가/변경 시 config.ts + .env.example + MEMORY.md 3곳 동기화

## 31. CRLF 호환 정규식 — `\n` 대신 `\r?\n`
- **실수**: `### Dependencies\n`이 GitHub Web UI의 CRLF 본문과 미매칭
- **결과**: 의존성 파싱 실패 → task 순서 무시
- **규칙**: 외부 입력 파싱 정규식에서 `\n` → `\r?\n`

## 33. Windows process.kill 대신 process.emit
- **실수**: `process.kill(pid, 'SIGINT')`는 Windows에서 TerminateProcess 호출
- **결과**: graceful shutdown 건너뛰고 즉시 종료
- **규칙**: `process.emit('SIGINT', 'SIGINT')`로 리스너 직접 트리거

## 39. event-mapper — 모든 MESSAGE_TYPES에 대한 매핑 확인
- **실수**: REVIEW_FEEDBACK 타입이 switch에서 누락
- **결과**: 에이전트 리뷰 사이클이 UI에서 보이지 않음
- **규칙**: MESSAGE_TYPES에 새 타입 추가 시 event-mapper switch case도 함께 추가
