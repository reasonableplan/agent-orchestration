# Quality Gates — 정량적 품질 기준

## 1. Performance Budget

### API (Backend)
| Metric | Target | Hard Limit |
|--------|--------|------------|
| Response time (p95) | < 200ms | < 500ms |
| DB queries per request | ≤ 3 | ≤ 5 |
| Response payload size | < 50KB | < 200KB |
| Connection pool usage | < 70% | < 90% |

### Frontend
| Metric | Target | Hard Limit |
|--------|--------|------------|
| Largest Contentful Paint (LCP) | < 2.0s | < 2.5s |
| First Input Delay (FID) | < 50ms | < 100ms |
| Cumulative Layout Shift (CLS) | < 0.05 | < 0.1 |
| Initial JS bundle (gzipped) | < 150KB | < 200KB |
| Per-route chunk (gzipped) | < 50KB | < 80KB |
| Total page weight | < 500KB | < 1MB |
| Time to Interactive (TTI) | < 3.0s | < 5.0s |

### Database
| Metric | Target | Hard Limit |
|--------|--------|------------|
| Single query execution | < 50ms | < 200ms |
| Migration execution | < 10s | < 30s |
| Index scan ratio | > 95% | > 90% |

## 2. Test Coverage Requirements

| Code Area | Minimum Coverage |
|-----------|-----------------|
| Business logic (services) | 90% line coverage |
| API routes (controllers) | 80% line coverage |
| Utility functions | 95% line coverage |
| UI components (critical) | 80% line coverage |
| UI components (common) | 70% line coverage |
| Database repositories | 80% line coverage |
| Overall project | 80% line coverage |

### Test Quality Rules
- 0 skipped tests in CI (no `it.skip` or `xit`)
- 0 flaky tests (tests that sometimes pass, sometimes fail)
- Test execution time: full suite < 60 seconds
- No test interdependence (randomized order must still pass)

## 3. Security Checklist (OWASP Top 10, Concrete)

### A01: Broken Access Control
- [ ] Every API endpoint checks authentication (middleware)
- [ ] Every data-modifying endpoint checks authorization (ownership/role)
- [ ] No direct object reference without ownership check (IDOR)
- [ ] Admin endpoints separated and additionally protected
- [ ] CORS configured with explicit origins (no `*`)

### A02: Cryptographic Failures
- [ ] Passwords hashed with bcrypt (cost ≥ 10) or argon2
- [ ] No sensitive data in JWT payload (only user ID, role)
- [ ] JWT secret is strong (≥ 256 bits) and from environment variable
- [ ] HTTPS enforced in production (note: local dev is HTTP, OK)
- [ ] No sensitive data in URL query parameters

### A03: Injection
- [ ] All SQL through ORM (Drizzle) — no raw string queries
- [ ] User input validated with Zod before processing
- [ ] No `eval()`, `new Function()`, or template literals with user input
- [ ] File paths from user input sanitized (no path traversal)

### A04: Insecure Design
- [ ] Rate limiting on login/register endpoints (5 attempts/min)
- [ ] Account lockout after repeated failures
- [ ] Password strength requirements enforced
- [ ] Sensitive operations require re-authentication

### A05: Security Misconfiguration
- [ ] Error responses don't expose stack traces or internal paths
- [ ] Default credentials removed
- [ ] Security headers set (X-Content-Type-Options, X-Frame-Options, etc.)
- [ ] Debug mode disabled in non-development builds

### A06: Vulnerable Components
- [ ] `pnpm audit` shows 0 high/critical vulnerabilities
- [ ] Dependencies pinned to specific versions (not `*` or `latest`)
- [ ] Library approval process followed (Director approval)

### A07: Authentication Failures
- [ ] JWT expiry enforced (access token ≤ 15 min)
- [ ] Refresh token rotation (single-use refresh tokens)
- [ ] Logout invalidates tokens (blocklist or rotation)
- [ ] Session fixation prevented

### A08: Data Integrity Failures
- [ ] API inputs validated server-side (never trust client)
- [ ] File uploads validated (type, size, content)
- [ ] Database constraints enforce data integrity

### A09: Logging & Monitoring
- [ ] Authentication failures logged
- [ ] Authorization failures logged
- [ ] Input validation failures logged
- [ ] No sensitive data in logs (passwords, tokens, PII masked)
- [ ] Structured logging with request context (requestId, userId)

### A10: Server-Side Request Forgery (SSRF)
- [ ] No user-controlled URLs used in server-side HTTP requests
- [ ] If URL input needed: whitelist allowed domains
- [ ] Internal service URLs not exposed to clients

## 4. Code Quality Gates (CI Must Pass)

```
✅ TypeScript: 0 errors (strict mode)
✅ ESLint: 0 errors, 0 warnings
✅ Prettier: 0 formatting issues
✅ Tests: 100% pass rate
✅ Coverage: meets per-area minimums
✅ Build: compiles without errors
✅ pnpm audit: 0 high/critical vulnerabilities
```

## 5. Technical Debt Management

### 기술 부채 분류
| Level | 이름 | 설명 | 처리 기한 |
|-------|------|------|----------|
| TD-1 | Critical | 보안 위험 또는 데이터 손실 가능 | 즉시 (현재 스프린트) |
| TD-2 | Major | 기능 동작에 영향, 버그 유발 가능 | 다음 마일스톤 |
| TD-3 | Minor | 코드 품질, 리팩토링 필요 | 백로그 |
| TD-4 | Cosmetic | 네이밍, 주석, 문서 개선 | 여유 시 |

### 기술 부채 기록 규칙
- 에이전트가 "나중에 고쳐야 할 것"을 발견하면 → `docs/tech-debt.md`에 기록
- 형식:
  ```markdown
  ## TD-XXX: [제목]
  - **Level**: TD-2
  - **Filed by**: Backend Agent
  - **Date**: 2026-03-14
  - **Location**: src/services/auth-service.ts:45
  - **Description**: refresh token 만료 시 DB에서 삭제하지 않음. 현재는 동작하지만 장기적으로 DB에 만료된 토큰이 쌓임
  - **Proposed fix**: cron job으로 주기적 정리, 또는 Redis TTL 사용
  - **Status**: Open
  ```
- Director가 마일스톤 회고 시 기술 부채 목록 검토
- TD-1은 발견 즉시 Director에게 보고 → 현재 작업 중단하고 수정

## 6. Agent Conflict Resolution Protocol

에이전트 간 기술적 의견 충돌 시:

### Step 1: 각자 근거 제시 (via Director)
```
Backend: "API 응답에 nested object 사용 — 데이터 구조가 자연스러움"
Frontend: "flat object 선호 — 렌더링 시 depth 접근이 번거로움"
```

### Step 2: Director가 평가 기준 적용
1. **사용자 경험에 영향**: 사용자에게 더 좋은 쪽 → 우선
2. **코드 복잡도**: 더 단순한 쪽 → 우선
3. **업계 관행**: 표준이 있으면 → 표준 따름
4. **성능**: 측정 가능한 차이가 있으면 → 빠른 쪽
5. **유지보수**: 변경에 더 유연한 쪽 → 우선

### Step 3: 결정 + 기록
- Director가 최종 결정 (근거 포함)
- Docs Agent가 `docs/tech-decisions.md`에 토론 과정 + 결정 기록
- 패배한 쪽 에이전트도 결정에 따라 구현

### Step 4: 동일 유형 충돌 방지
- 결정이 패턴화되면 → `code-standards.md`에 규칙으로 추가
- 예: "API 응답은 1-depth flat object를 기본으로 하되, 명확한 소속 관계가 있으면 nested 허용"

## 7. Code Consistency Protocol (Anchor Pattern)

여러 에이전트가 같은 영역(Backend, Frontend)에서 작업할 때 코드 스타일을 통일하는 방법:

### Anchor Code (앵커 코드)
1. 첫 번째 작업의 코드가 **앵커(기준점)**이 된다
2. Director가 첫 작업 리뷰 시 패턴을 명시적으로 승인:
   - "이 에러 핸들링 패턴을 전체 API에 적용"
   - "이 컴포넌트 구조를 모든 페이지에 적용"
3. 이후 에이전트들은 앵커 코드의 패턴을 따른다

### Consistency Checklist
- [ ] 함수 시그니처 스타일 동일 (async/await vs Promise)
- [ ] 에러 처리 패턴 동일 (try/catch 위치, 에러 클래스)
- [ ] 파일 구조 동일 (imports 순서, export 방식)
- [ ] 변수 명명 규칙 동일 (동사+명사 조합)
- [ ] 주석 스타일 동일 (JSDoc vs inline)
- [ ] 테스트 구조 동일 (describe/it 조직, setup/teardown)

### Director의 역할
- 첫 작업 리뷰 시 "이것을 앵커로 삼는다" 선언
- 이후 작업에서 앵커와 다른 패턴 발견 시 → 앵커 패턴으로 수정 요청
- 앵커 패턴 자체가 문제라면 → 전체 리팩토링 태스크 생성

## 8. Error Recovery Protocol

에이전트 작업 실패 시 복구 전략:

### 코드 생성 실패
1. Claude API 에러 → 자동 재시도 (최대 3회, 지수 백오프)
2. 파싱 에러 → 프롬프트 조정 후 재시도
3. 3회 실패 → Director에게 보고, 작업 `Failed` 처리

### 반만 완성된 작업
1. 파일이 일부만 생성됨 → Git에서 변경 사항 되돌림 (clean state 복원)
2. DB 마이그레이션 중 실패 → 롤백 실행
3. 절대로 반만 완성된 코드를 커밋하지 않음

### 테스트 실패
1. 에이전트가 자체적으로 수정 시도 (최대 2회)
2. 2회 실패 → Director에게 보고 + 구체적 에러 내용 첨부
3. Director가 다른 에이전트에게 도움 요청하거나 접근 방식 변경 지시

### Git 충돌
1. Git Agent가 자동 해결 시도 (명확한 경우만)
2. 코드 로직 충돌 → Director에게 보고
3. Director가 관련 에이전트 소집 → 어떤 쪽을 유지할지 결정
