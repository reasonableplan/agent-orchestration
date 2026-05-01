---
id: external_deps
name: 외부 의존 (External Dependencies)
required_when: has.external_deps
description: 3rd-party 서비스 SLA + 폴백 정책 + 계약. 외부 의존 1개 죽으면 우리도 죽는지 / graceful degrade 인지. Phase 2-b 활성 조건 — has.external_deps (변동 없음, 표준 vocab 와 일치).
---

## {{section_number}}. 외부 의존 (External Dependencies)

### 의존 서비스 목록

| 서비스 | 용도 | 중요도 | SLA (제공) | 비용 모델 |
|--------|------|:------:|-----------|----------|
| `<Stripe>` | 결제 처리 | Critical | 99.99% | 거래당 % |
| `<SendGrid / SES>` | 이메일 발송 | High | 99.95% | 발송당 |
| `<OAuth (Google/Apple)>` | 소셜 로그인 | High | 99.9% | 무료 |
| `<S3 / R2>` | 파일 저장 | High | 99.99% | 저장 + 트래픽 |
| `<Twilio / Aligo>` | SMS / OTP | Medium | 99.9% | 발송당 |
| `<Sentry / Datadog>` | 에러 / APM | Medium (관측) | 99.9% | seat / 이벤트 |

**중요도** 정의:
- **Critical** — 다운 시 핵심 기능 중단 (수익 직결)
- **High** — 일부 기능 저하, 폴백으로 부분 동작
- **Medium** — 운영 어려움, 사용자 영향 제한적

### 폴백 정책 (Graceful Degradation)

| 의존 | 다운 시 행동 | 사용자 경험 | 복구 후 |
|------|--------------|-------------|---------|
| `<Stripe>` | 결제 시도 → 큐 + "처리 중" 안내 | 즉시 결제 불가, 주문은 보류 | 큐 재처리 |
| `<SendGrid>` | 이메일 큐에 적재 | 알림 지연 | 큐 flush |
| `<OAuth>` | 비번 로그인으로 fallback | 일부 로그인 경로 차단 | 자동 |
| `<SMS / OTP>` | 이메일 OTP 로 우회 | OTP 채널 변경 알림 | 자동 |
| `<S3>` | 임시 파일시스템 + 비동기 업로드 | 업로드 즉시 응답 지연 | 큐 flush |

### Webhook 처리

- **idempotency**: 모든 webhook 은 `event_id` 로 멱등 처리 — 중복 수신 안전
- **재시도 정책**: 외부 webhook 의 재시도 룰 확인 (Stripe: 3일간 점진적)
- **순서**: webhook 순서 보장 안 됨 — 시각 기반 처리 또는 sequence 컬럼
- **검증**: 서명 검증 (signing secret) 필수 — 위조 webhook 방어 (`threat_model` 참조)
- **저장**: 처리 전 raw payload 저장 — 디버깅 + 재처리

### API 버저닝

#### 우리가 호출하는 외부 API
- 버전 픽싱 정책: <메이저 버전 명시 / 자동 업그레이드 금지>
- 새 버전 마이그레이션 절차: <샌드박스 검증 → staging → prod>
- breaking change 대응: <`test_strategy` 의 contract test 로 CI 차단>

#### 우리가 노출하는 API
- 버저닝 전략: <URL path (`/v1/`, `/v2/`) vs Header>
- deprecation 정책: <N개월 유예 + Sunset 헤더 + 마이그레이션 가이드>
- breaking change 룰: <메이저 버전 변경에서만 / 이외엔 backward-compat>

### 타임아웃 / 재시도 / Circuit Breaker

| 의존 | Connect timeout | Read timeout | 재시도 | Circuit breaker |
|------|----------------|--------------|--------|-----------------|
| `<Stripe>` | 5s | 30s | 3회 (지수 백오프) | 50% 실패 1분 → open |
| `<S3 upload>` | 10s | 5분 | 3회 | 30% 실패 → open |

- 재시도는 **idempotent 작업만** — POST 결제 호출 등은 idempotency key 필수
- circuit breaker open 시 폴백 정책으로 즉시 fallback

### 의존 비용 모니터링

- 월별 외부 서비스 비용 추적 (capacity_cost — Phase 3)
- 비정상 spike 알람 (예: SendGrid 발송량 평소 10x → 누군가 abuse)

> 작성 가이드:
> - 모든 critical 의존에 폴백 정책 — "그냥 다운" 은 답이 아님
> - webhook idempotency 누락은 흔한 사고 (중복 결제 / 중복 알림)
> - 외부 API 버전 자동 업그레이드 금지 — breaking change 가 운영 중 터짐
> - timeout 무한대 / 재시도 무한대 절대 금지 (CLAUDE.md 외부 API 호출 룰)
> - `runbook` 의 "외부 의존 다운" 시나리오 와 결합
