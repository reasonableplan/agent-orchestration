# Code Standards — All Agents Must Follow

## 1. Language & Framework Conventions

### TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`
- No `any` — use `unknown` + type guards when needed
- No `as` casts unless unavoidable — add `// Reason: ...` comment
- Prefer `interface` over `type` for object shapes (extendable)
- Use `readonly` for properties that should not be mutated
- Enum → `as const` object preferred (tree-shakeable)

### Naming
- Files: `kebab-case.ts` (e.g., `user-service.ts`)
- Classes: `PascalCase` (e.g., `UserService`)
- Functions/variables: `camelCase` (e.g., `getUserById`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_COUNT`)
- Interfaces: `PascalCase`, no `I` prefix (e.g., `UserRepository`, not `IUserRepository`)
- Boolean variables: `is/has/can/should` prefix (e.g., `isActive`, `hasPermission`)
- Event handlers: `on` + noun + verb (e.g., `onUserCreate`, `onTaskComplete`)

### Formatting (Prettier)
- Single quotes, no semicolons, trailing commas (`es5`)
- Print width: 100, tab width: 2
- All agents MUST produce code that passes `prettier --check` without modifications

### ESLint
- No `console.log` in production code — use structured logger
- No unused variables (prefix with `_` only if callback signature requires it)
- No floating promises — always `await` or explicitly handle with `.catch()`

## 2. Architecture Principles

### SOLID
- **S**ingle Responsibility: One module = one reason to change
- **O**pen-Closed: Extend via composition, not modification
- **L**iskov Substitution: Subtypes must be substitutable
- **I**nterface Segregation: Small, focused interfaces (not god-interfaces)
- **D**ependency Inversion: Depend on abstractions, inject dependencies

### Clean Architecture Layers
```
Controller/Route → Service → Repository → Database
                          ↘ External APIs
```
- Controllers: HTTP parsing, validation, response formatting only
- Services: Business logic, orchestration, no HTTP/DB concerns
- Repositories: Data access only, no business logic
- No layer may import from a layer above it

### Error Handling
- Custom error classes with error codes (e.g., `NotFoundError`, `ValidationError`)
- Never catch and swallow — at minimum log with context
- API errors: consistent JSON format `{ error: { code, message, details? } }`
- Operational errors (expected) vs Programmer errors (bugs) — handle differently
- Retry only on transient failures (network, rate limit) — not on validation errors

### Testing
- Unit tests: isolated, fast, mock external dependencies
- Integration tests: real database, real HTTP calls to local server
- Test naming: `describe('ClassName')` → `it('should [expected behavior] when [condition]')`
- Arrange-Act-Assert pattern
- No test interdependence — each test sets up and tears down its own state
- Coverage target: >80% line coverage for business logic

## 3. API Design Standards (REST)

### URL Patterns
- `GET /api/v1/users` — list (with pagination)
- `GET /api/v1/users/:id` — get single
- `POST /api/v1/users` — create
- `PUT /api/v1/users/:id` — full update
- `PATCH /api/v1/users/:id` — partial update
- `DELETE /api/v1/users/:id` — delete
- Nested: `GET /api/v1/users/:id/projects` — user's projects

### Request/Response
- Request body: `camelCase` JSON
- Response: `{ data: T }` for single, `{ data: T[], meta: { total, page, limit } }` for lists
- Error: `{ error: { code: string, message: string, details?: unknown } }`
- HTTP status codes: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 500 Internal Server Error

### Validation
- Validate at API boundary using Zod schemas
- Share validation schemas between frontend and backend via shared package
- Never trust client input — validate, sanitize, escape

## 4. Database Standards

### Schema Design
- Table names: `snake_case`, plural (e.g., `user_accounts`)
- Column names: `snake_case` (e.g., `created_at`, `is_active`)
- Primary key: `id` (UUID preferred for distributed systems, serial for simple apps)
- Timestamps: `created_at`, `updated_at` on every table (NOT NULL, DEFAULT NOW())
- Soft delete: `deleted_at` nullable timestamp (when applicable)
- Foreign keys: always named (`fk_tasks_user_id`), always indexed
- Indexes: on foreign keys, frequently queried columns, unique constraints

### Migrations
- One migration per schema change
- Forward-only (no editing past migrations)
- Migration names: `NNNN_description.sql` (e.g., `0001_create_users.sql`)
- Always test rollback

## 5. Git Conventions

### Commits
- Conventional Commits: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`
- Scope: feature area (e.g., `auth`, `dashboard`, `api`)
- Description: imperative mood, lowercase, no period (e.g., `add user login endpoint`)
- Body: explain WHY, not WHAT (the diff shows what)

### Branches
- `main` — production-ready, protected
- `feat/description` — feature branches
- `fix/description` — bug fix branches
- `refactor/description` — refactoring branches

## 6. Security Baseline

- No secrets in code, env files committed, or logs
- Input validation on all external boundaries
- SQL injection prevention: parameterized queries only (Drizzle ORM handles this)
- XSS prevention: escape user content in templates, use React (auto-escapes JSX)
- CSRF: SameSite cookies + CSRF token for state-changing operations
- Authentication: JWT with short expiry + refresh token rotation
- Authorization: role-based or attribute-based, checked at service layer
- Rate limiting on authentication endpoints
- CORS: explicit origin whitelist, no `*` in production

## 7. Performance Baseline

- Database queries: no N+1, use joins or batch queries
- Pagination: cursor-based for large datasets, offset for admin panels
- Caching: consider cache invalidation strategy before adding cache
- Bundle size: lazy load routes, code split at feature boundaries
- Images: optimize, use modern formats (WebP), lazy load below fold
- API responses: return only needed fields, no over-fetching

## 8. Project Scope

**모든 에이전트는 로컬에서 실행 가능한 수준까지만 구현한다.**
- 클라우드 배포, 프로덕션 환경, 호스팅, 도메인, SSL 설정 하지 않음
- Docker Compose로 로컬 DB 등 인프라 실행
- `pnpm dev`로 개발 서버 실행 가능해야 함
- 로컬 실행 가이드를 README.md에 명확히 기술

## 9. Shared Types & API Contract

- API 요청/응답 타입 + Zod 스키마는 공유 패키지에 정의
- Backend가 스키마 정의 → Frontend가 동일 스키마 import
- 타입 변경 = Breaking Change → Director 승인 필수
- 컴파일 타임에 불일치를 잡아 런타임 에러 방지
