---
id: threat_model
name: 위협 모델 (Threat Model)
required_when: always
description: STRIDE / OWASP 위협 시나리오 + 완화 + 수용 위험. auth 가 "어떻게 인증" / threat_model 은 "무엇을 막을지". Phase 2-b 활성 조건 (vocabulary 확장 후) — data_sensitivity in [pii, payment] or availability == high.
---

## {{section_number}}. 위협 모델 (Threat Model)

### 보호 대상 자산

| 자산 | 분류 | 손상 시 영향 | 6축 `data_sensitivity` 매핑 |
|------|------|--------------|-----------------------------|
| 사용자 PII (이메일/이름/전화) | 민감 | 법적 책임 + 신뢰 손상 | pii |
| 결제 정보 / 카드 토큰 | 매우 민감 | 직접 금전 손해 + 컴플라이언스 위반 | payment |
| 인증 자격증명 (해시 / 토큰) | 매우 민감 | 계정 탈취 → 연쇄 피해 | (always) |
| 비즈니스 데이터 (주문/결제 이력) | 중요 | 운영 마비 | varies |

### STRIDE 위협 시나리오

| 위협 | 시나리오 | 완화 수단 | 잔여 위험 |
|------|---------|----------|-----------|
| **S**poofing (위장) | <탈취된 토큰으로 다른 사용자 행세> | <짧은 토큰 만료 + refresh + IP 검증> | <장기 세션 토큰 탈취> |
| **T**ampering (변조) | <요청 페이로드 변조 / DB 직접 수정> | <서명된 토큰 / DB RLS / audit_log> | <DB 관리자 권한 오용> |
| **R**epudiation (부인) | <"나는 그 결제 안 했다"> | <audit_log + 법적 효력 있는 로그> | <로그 자체 위변조 (hash chain 으로 탐지)> |
| **I**nformation disclosure (유출) | <SQL injection / IDOR / 로그 PII> | <ORM + row-level + 로그 PII 마스킹> | <개발자 실수로 PII 노출> |
| **D**enial of service | <대량 요청 / slow loris> | <rate limiting / WAF / autoscale> | <분산 공격 (DDoS) 은 외부 서비스 의존> |
| **E**levation of privilege | <user → admin 승격> | <`authorization_matrix` 행렬 강제 + audit_log> | <소셜 엔지니어링> |

### 공격 벡터

| 벡터 | 가능성 | 완화 |
|------|-------|------|
| 외부 인터넷 (HTTP) | 높음 | TLS 강제 / WAF / rate limit / input validation |
| 인증된 일반 사용자의 권한 남용 | 중간 | row-level 권한 + audit_log |
| 인증된 관리자의 오용 / 탈취 | 낮지만 치명적 | 2FA + 권한 분리 + audit_log + 행동 기반 알람 |
| 내부 인프라 침투 (서버 / DB) | 낮지만 치명적 | network 분리 + secret 회전 + bastion |
| 공급망 (의존 패키지 / CI) | 낮지만 치명적 | dependency-check 게이트 + SCA + lockfile |

### 완화 수단 매핑

| 수단 | 위치 | 어디 정의 |
|------|------|----------|
| 입력 검증 | API gateway + 컨트롤러 | (이 fragment 또는 interface.http) |
| Rate limiting | Edge / API gateway | (rate_limiting 또는 ci_cd 인프라) |
| 권한 검증 | 미들웨어 + 컨트롤러 + DB RLS | `authorization_matrix` |
| 감사 추적 | 모든 PII / 권한 액션 | `audit_log` |
| Secret 격리 | Vault / KMS | (secret_management — Phase 3) |
| 모니터링 | 알람 / 행동 기반 | `runbook` |

### 수용 위험 (Accepted Risk)

명시적으로 수용하는 위험 (의식적 결정):

| 위험 | 이유 | 완화 부족 시 plan B |
|------|------|---------------------|
| <예: DDoS 대규모 공격> | <CDN 의존 / 자체 방어 비용 큼> | <서비스 중단 안내 + 복구> |
| <예: 0-day 의존 취약점> | <탐지 자체가 어려움> | <빠른 패치 정책 + audit_log 모니터링> |

> 작성 가이드:
> - 자산 → 위협 → 완화 → 잔여 위험 의 4단계 구조 유지
> - 모든 STRIDE 카테고리에 시나리오 1개 이상 — 빈 칸은 "고려 안 함" 의 신호
> - 잔여 위험은 "0" 으로 표기 금지 — 완벽한 시스템은 없음
> - audit_log / authorization_matrix / runbook 과 cross-reference 필수 (어느 한쪽만 정의되면 의미 약함)
> - 6축 `data_sensitivity == payment` 면 PCI-DSS 컴플라이언스 별도 검토 필요
