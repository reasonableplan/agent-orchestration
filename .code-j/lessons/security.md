---
name: 보안
description: 프롬프트 인젝션 XML 딜리미터, 프로세스 인자 토큰 노출 금지
type: lesson-group
category: security
lesson_count: 2
---

## 16. 프롬프트 인젝션 방어 — 모든 사용자 입력에 XML 딜리미터
- **실수**: code-generator에서 task.title/description 직접 삽입
- **규칙**: `<task><title>${title}</title></task>` 패턴 일관 적용
- **적용**: backend/frontend/docs code-generator의 buildUserMessage

## 20. 프로세스 인자로 토큰 노출 금지
- **실수**: git CLI에 `-c http.extraHeader=Authorization: Bearer <token>` 전달
- **결과**: ps aux, /proc에서 토큰 노출
- **규칙**: GIT_ASKPASS 또는 credential helper 사용, CLI 인자에 시크릿 전달 금지
