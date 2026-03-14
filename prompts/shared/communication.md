# Communication Protocol — Agent Message Format

## Message Types

### 1. Task Assignment (Director → Agent)
```json
{
  "type": "task.assign",
  "from": "director",
  "to": "backend",
  "payload": {
    "taskId": "task-123",
    "issueNumber": 5,
    "title": "사용자 인증 API 구현",
    "description": "JWT 기반 로그인/회원가입 API",
    "dependencies": ["task-100"],
    "priority": 1,
    "acceptanceCriteria": [
      "POST /api/v1/auth/login 구현",
      "POST /api/v1/auth/register 구현",
      "JWT access + refresh token 발급",
      "입력값 Zod 검증",
      "테스트 커버리지 80% 이상"
    ],
    "context": {
      "relatedDocs": ["docs/api-spec.md#authentication"],
      "relatedCode": ["src/services/auth-service.ts"],
      "previousFeedback": []
    }
  }
}
```

### 2. Review Request (Agent → Director)
```json
{
  "type": "review.request",
  "from": "backend",
  "to": "director",
  "payload": {
    "taskId": "task-123",
    "issueNumber": 5,
    "summary": "JWT 인증 API 구현 완료",
    "filesChanged": [
      "src/routes/auth.ts",
      "src/services/auth-service.ts",
      "src/middleware/auth-guard.ts",
      "tests/auth.test.ts"
    ],
    "testResults": {
      "passed": 12,
      "failed": 0,
      "coverage": 87
    },
    "notes": "refresh token rotation 적용, bcrypt 해싱 사용",
    "dependentsUnblocked": ["task-124", "task-125"]
  }
}
```

### 3. Review Feedback (Director → Agent)
```json
{
  "type": "review.feedback",
  "from": "director",
  "to": "backend",
  "payload": {
    "taskId": "task-123",
    "decision": "revision_needed",
    "feedback": [
      {
        "severity": "critical",
        "file": "src/services/auth-service.ts",
        "line": 45,
        "message": "password를 로그에 기록하고 있음 — 보안 위반",
        "suggestion": "password 필드를 로그에서 제외하거나 마스킹"
      },
      {
        "severity": "minor",
        "file": "src/routes/auth.ts",
        "line": 12,
        "message": "rate limiter 미적용 — 브루트포스 공격 가능",
        "suggestion": "express-rate-limit 또는 커스텀 rate limiter 추가"
      }
    ],
    "mustFixBeforeApproval": ["critical"],
    "overallComment": "핵심 로직은 좋으나 보안 이슈 수정 필요"
  }
}
```

### 4. Library Proposal (Agent → Director)
```json
{
  "type": "library.proposal",
  "from": "frontend",
  "to": "director",
  "payload": {
    "library": "react-hook-form",
    "version": "^7.51.0",
    "reason": "복잡한 폼(회원가입, 프로젝트 설정)에서 validation + 성능 최적화 필요",
    "alternatives": [
      { "name": "formik", "rejected_reason": "re-render 성능 이슈, 번들 크기 더 큼" },
      { "name": "직접 구현", "rejected_reason": "validation 로직 복잡, 개발 시간 과다" }
    ],
    "bundleImpact": "~12KB gzipped",
    "license": "MIT",
    "maintenance": {
      "lastPublished": "2024-12-01",
      "weeklyDownloads": "5.2M",
      "openIssues": 23,
      "stars": "40K+"
    },
    "affectedAreas": ["src/components/forms/*", "src/hooks/useForm*"]
  }
}
```

### 5. Library Decision (Director → All Related Agents)
```json
{
  "type": "library.decision",
  "from": "director",
  "to": "broadcast",
  "payload": {
    "library": "react-hook-form",
    "decision": "approved",
    "conditions": [
      "Controller 컴포넌트 대신 register 방식 통일",
      "Zod resolver 사용 (별도 @hookform/resolvers 설치)"
    ],
    "affectedAgents": ["frontend"],
    "discussionSummary": "formik 대비 성능 우수, 번들 사이즈 합리적. Zod 통합으로 백엔드 스키마 재사용 가능."
  }
}
```

### 6. Agent Consultation (Agent ↔ Agent, via Director)
```json
{
  "type": "consult.request",
  "from": "frontend",
  "to": "director",
  "payload": {
    "targetAgent": "backend",
    "question": "GET /api/v1/projects/:id/tasks 응답에 assignee 정보가 포함되나요? 아니면 별도 API 호출 필요?",
    "context": "TaskBoard 컴포넌트에서 담당자 아바타를 표시해야 합니다",
    "urgency": "blocking"
  }
}
```

### 7. Status Report (Agent → Director, periodic)
```json
{
  "type": "status.report",
  "from": "backend",
  "to": "director",
  "payload": {
    "currentTask": "task-123",
    "progress": 70,
    "blockers": [],
    "estimatedCompletion": "current cycle",
    "completedToday": ["task-120", "task-121"],
    "notes": "DB 마이그레이션 완료, API 엔드포인트 3/5 구현"
  }
}
```

### 8. User Intervention (User → Director)
```json
{
  "type": "user.message",
  "from": "user",
  "to": "director",
  "payload": {
    "message": "로그인 페이지에 소셜 로그인(Google, GitHub)도 추가해주세요",
    "targetAgent": null,
    "priority": "normal"
  }
}
```

### 9. Change Propagation (Director → Affected Agents)
```json
{
  "type": "change.propagate",
  "from": "director",
  "to": "broadcast",
  "payload": {
    "changeId": "chg-001",
    "reason": "사용자 요청: 소셜 로그인 추가",
    "impactAnalysis": {
      "backend": "OAuth2 콜백 엔드포인트 추가, 소셜 계정 연동 테이블 필요",
      "frontend": "로그인 페이지에 소셜 로그인 버튼 추가, OAuth redirect 처리",
      "docs": "API 명세서, ERD 업데이트 필요"
    },
    "newIssues": [
      { "title": "소셜 로그인 백엔드 API", "assignee": "backend", "dependsOn": [] },
      { "title": "소셜 로그인 UI", "assignee": "frontend", "dependsOn": ["소셜 로그인 백엔드 API"] }
    ],
    "modifiedDocs": ["docs/api-spec.md", "docs/erd.md", "docs/requirements.md"]
  }
}
```

### 10. Documentation Log (Docs Agent, continuous)
```json
{
  "type": "docs.log",
  "from": "docs",
  "payload": {
    "logType": "work_completed",
    "timestamp": "2026-03-14T15:30:00Z",
    "agent": "backend",
    "taskId": "task-123",
    "issueNumber": 5,
    "summary": "JWT 인증 API 구현 완료",
    "duration": "15min",
    "reviewResult": "revision_needed → approved (2nd attempt)",
    "feedbackReceived": [
      "보안: password 로깅 제거",
      "보안: rate limiter 추가"
    ],
    "nextTasks": ["task-124 (프론트엔드 로그인 UI)", "task-125 (프론트엔드 회원가입 UI)"]
  }
}
```

## Communication Rules

### 1. All Communication Goes Through Director
- Agent → Agent 직접 통신 금지
- 질문/제안은 Director를 통해 전달
- Director가 관련 에이전트에게 중계 + 맥락 추가

### 2. Blocking vs Non-Blocking
- **Blocking**: 선행 작업 미완료, 기술적 질문 답변 대기 → 다른 작업으로 전환
- **Non-Blocking**: 참고 사항, 제안 → 현재 작업 계속 진행

### 3. Escalation Path
```
Agent → Director → User (에이전트 레벨에서 해결 불가 시)
```

### 4. Feedback Memory
- 에이전트는 Director로부터 받은 피드백을 기억
- 같은 실수 반복 금지
- 피드백 패턴을 학습하여 선제적으로 적용

### 5. Dashboard Visibility
- 모든 메시지는 대시보드에서 실시간 표시
- 사용자는 언제든 대화에 참여 가능
- 에이전트에게 직접 질문 가능 ("지금 뭐 하고 있어?")
- Director에게 변경 요청 가능
