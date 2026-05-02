---
id: audit_log
name: 감사 로그 (Audit Log)
required_when: data_sensitivity in [pii, payment]
description: 누가 / 언제 / 무엇을 / 결과 — 컴플라이언스 + 보안 사고 조사용. 출시 후 retrofit 거의 불가능.
---

## {{section_number}}. 감사 로그 (Audit Log)

### 감사 대상 액션

| 카테고리 | 액션 예시 | 항상 로깅 |
|----------|----------|:---------:|
| 인증 | login / logout / password_reset / 2FA_enroll | ✅ |
| 권한 | role_grant / role_revoke / permission_change | ✅ |
| PII 접근 | user_data_export / pii_field_view (관리자 액션) | ✅ |
| PII 변경 | email_update / phone_update / address_update | ✅ |
| 결제 | payment_create / refund_issue / subscription_change | ✅ |
| 데이터 삭제 | hard_delete / GDPR 요청 | ✅ |

### 로그 스키마

| 필드 | 타입 | Null | 비고 |
|------|------|:---:|------|
| `id` | UUID | ❌ | PK |
| `at` | TIMESTAMP TZ | ❌ | 발생 시각 |
| `actor_id` | UUID | ❌ | 행위자 (시스템 액션은 `system`) |
| `actor_role` | string | ❌ | 행위 시점의 역할 |
| `action` | string | ❌ | 위 카테고리에서 정의 |
| `resource_type` | string | ❌ | `user` / `order` / `role` / ... |
| `resource_id` | UUID | ✔️ | (전역 액션은 NULL) |
| `result` | enum | ❌ | `success` / `denied` / `error` |
| `source_ip` | inet | ✔️ | (시스템 액션은 NULL) |
| `user_agent` | string | ✔️ | |
| `metadata` | JSONB | ✔️ | before/after 값 등 (PII 마스킹 후) |

### 무결성

- **append-only** — UPDATE / DELETE 금지 (DB 레벨 RLS 또는 trigger 로 강제)
- **hash chain** — `prev_hash` 컬럼으로 위변조 탐지 (옵션, 컴플라이언스 요구 시)
- **별도 저장소** — 운영 DB 와 분리 가능 (S3 + Glacier / 전용 audit DB)

### 보존 정책

| 카테고리 | 보존 기간 | 근거 |
|----------|----------|------|
| 인증 / 권한 | <최소 1년> | 보안 사고 조사 |
| 결제 | <7년> | 세무 / 회계 의무 (한국 5년~) |
| PII 접근 | <법령 + 1년> | GDPR / PIPA |

### 조회 / 알람

- **수동 조회**: 관리자 대시보드 — 시간/액터/리소스로 필터
- **자동 알람**:
  - 단시간 다수 인증 실패 → 계정 잠금
  - 비정상 PII 접근 패턴 → 보안팀 페이지
  - 권한 승격 → 즉시 알림

> 작성 가이드:
> - 모든 액션에 `result` 명시 — denied 도 로깅 (공격 탐지)
> - PII 값 자체를 metadata 에 넣지 말 것 — 변경 사실만 (`field=email_changed`, 새 값/옛 값은 마스킹)
> - 로그에 `actor_id`, `actor_role` 둘 다 — 사후 역할 변경되어도 시점 정보 보존
> - `authorization_matrix` 의 권한 변경 액션은 자동으로 audit 대상
> - threat_model 에서 정의한 위협 시나리오의 탐지 신호는 audit_log 쿼리로 가능해야 함
