---
id: test_strategy
name: 테스트 전략
required_when: always
description: Test pyramid + 데이터 전략 + 계약 테스트 + CI 통합. "테스트가 있냐" 가 아니라 "테스트 전략이 있냐". Phase 2-b 활성 조건 — lifecycle in [mvp, ga] (poc 는 비활성).
---

## {{section_number}}. 테스트 전략

### Test Pyramid

| 계층 | 비율 (목표) | 도구 | 실행 시간 | CI 단계 |
|------|------------|------|----------|--------|
| Unit | <70%> | <pytest / vitest / jest> | <초 단위> | 모든 PR |
| Integration | <20%> | <pytest + 실제 DB / API> | <분 단위> | 모든 PR |
| E2E (UI / 시나리오) | <10%> | <Playwright / Cypress> | <수 분> | main / staging |
| 부하 / 카오스 | (별도) | <k6 / Locust / chaos-mesh> | <수십 분> | 주간 / 릴리스 전 |

> 비율은 **개수** 가 아니라 **커버 영역의 깊이**. 단순 비율 강제 금지.

### 테스트 데이터 전략

- **Fixture vs Factory**:
  - 정적 fixture: <간단한 lookup 데이터, 변경 거의 없음>
  - factory (Factory Boy / faker / msw): <복잡한 객체, 변동 필요한 필드>
- **DB seed**:
  - dev / staging seed 스크립트 위치: `<scripts/seed/>`
  - production-like 데이터 (마스킹 후) 사용 정책: <예: staging 만 / 절대 금지>
- **테스트 격리**:
  - 트랜잭션 롤백 (pytest-django / SQLAlchemy session) — 권장
  - DB truncate (느림, 마지막 수단)

### 계약 테스트 (Contract Test)

외부 의존이 있는 경우 — `external_deps` 와 결합:

| 외부 서비스 | 계약 정의 위치 | 테스트 방식 |
|------------|---------------|------------|
| `<Stripe>` | <OpenAPI 스펙 / Pact> | <샌드박스 호출 + recorded fixture> |
| `<우리 API 를 호출하는 클라이언트>` | <OpenAPI / Pact provider> | <CI 에서 consumer 테스트> |

목적: 외부 API breaking change 가 운영 사고 되기 전에 CI 에서 잡기.

### 부하 / 카오스 테스트 (해당 시)

- **부하 테스트 시나리오**: <slo 의 피크 부하 × 1.5 까지 검증>
- **카오스 시나리오** (옵션): <DB primary 다운 / 네트워크 지연 / 외부 의존 다운>
- **실행 주기**: <주간 / 릴리스 전 / 분기별>

### CI 통합

```
PR 생성        → unit + integration + lint + type → 모두 통과해야 머지
main 머지      → 위 + e2e (staging 배포 후)        → 실패 시 롤백
릴리스 태그    → 위 + 부하 테스트 (별도 환경)
```

### 커버리지 목표

- **목표 line coverage**: <80%> — 강제는 아님, 신호
- **branch coverage**: <70%>
- **빠진 영역 명시**: <legacy code / vendor / migration scripts — 의도적 제외 목록>

> 작성 가이드:
> - 새 함수에 테스트 먼저 (CLAUDE.md 원칙)
> - mock 만으로 검증 가능한 게 아닌 핵심 로직은 실제 동작 검증 (LESSON: mock 으로 prod 마이그레이션 실패 사례 다수)
> - 테스트 데이터에 PII 절대 금지 — `audit_log` 와 같은 마스킹 정책 적용
> - 외부 API 호출은 contract test 로 — 단순 mock 은 drift 못 잡음
> - LESSON-013 (test-distribution) — 모든 src 모듈에 테스트 1개 이상 (게이트 강제)
