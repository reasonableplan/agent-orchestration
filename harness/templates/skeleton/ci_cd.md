---
id: ci_cd
name: CI/CD 파이프라인
required_when: lifecycle in [mvp, ga]
description: 빌드 → 검증 → 배포 단계 + 환경 분리 + 롤백. deployment 가 "어디에" 라면 ci_cd 는 "어떻게 거기까지". poc 단계엔 비활성.
---

## {{section_number}}. CI/CD 파이프라인

### 파이프라인 단계

```
PR 생성 / push:
  [1] checkout
  [2] dependency install (cache)
  [3] lint        ─→ 실패 시 차단
  [4] type check  ─→ 실패 시 차단
  [5] unit test   ─→ 실패 시 차단
  [6] integration test (실 DB)
  [7] security scan (SCA / SAST)
  [8] build artifact

main 머지:
  [9] e2e test (staging 배포 후)
  [10] deploy to staging
  [11] smoke test (헬스체크 + 핵심 시나리오)

릴리스 태그:
  [12] deploy to prod (canary / blue-green)
  [13] post-deploy 검증 (canary 모니터)
  [14] 트래픽 100% 전환 또는 자동 롤백
```

### 환경 분리

| 환경 | 용도 | 데이터 | Secret | 트래픽 |
|------|------|--------|--------|--------|
| `local` | 개발자 머신 | seed / mock | `.env.example` 기반 | 0 |
| `dev` | 통합 개발 | seed | dev secret store | 0 |
| `staging` | 운영 전 검증 | prod-like (마스킹) | staging secret store | 내부 + QA |
| `prod` | 운영 | 실제 | prod secret store | 100% |

**환경 간 격리 룰**:
- secret 절대 공유 금지 (env 별 별도 store)
- prod DB 직접 접근 금지 (read-replica 또는 마스킹된 staging 만)
- 환경 변수 변경 시 `.env.example` 동기화 (CLAUDE.md)

### 배포 전략

| 전략 | 적용 시점 | 롤백 시간 | 비고 |
|------|----------|----------|------|
| Rolling | 일반 배포 | <분 단위> | 점진적 인스턴스 교체 |
| Blue-Green | 큰 변경 / 마이그레이션 동반 | <초 단위> | 트래픽 스위치 |
| Canary | risky 변경 | <분 단위> | 1-5% 트래픽 → 100% |

### 롤백 절차

- **자동 롤백 트리거**:
  - 배포 후 5분 내 `error_rate > 5%`
  - 헬스체크 실패 3회 연속
  - p95 latency 가 SLO 의 2배 초과
- **수동 롤백**: <commit revert + 재배포 / 이전 artifact 재배포> 두 경로 모두 문서화
- **DB 마이그레이션 동반 시**: 코드 롤백 ≠ 스키마 롤백 — `data_model` 의 마이그레이션 정책 참조

### Feature Flag (배포 ↔ 릴리즈 분리)

- **도구**: `<LaunchDarkly / Unleash / 자체 구현>`
- **목적**: 코드는 배포되었지만 사용자에게 노출 안 됨 → 단계적 릴리즈
- **수명 정책**: 플래그는 임시 — `<릴리즈 후 N주 내 제거>`
- **클린업**: 분기별 플래그 정리 — dead 플래그는 ai-slop 게이트 후보

### Secret 관리

- **저장**: <Vault / AWS Secrets Manager / GitHub Actions secrets>
- **CI 주입**: 환경변수로만 — CLI 인자 절대 금지 (CLAUDE.md 보안 룰)
- **회전**: <분기별 / 사고 시 즉시>
- **만료 모니터링**: <알람 — TLS 인증서 / API 키>

> 작성 가이드:
> - 모든 단계에 명시적 실패 정책 — "통과하면 다음" 만 적지 말 것
> - 환경 분리는 secret 분리부터 — 같은 키 공유 시 격리 의미 없음
> - 롤백은 항상 한 명령으로 가능해야 — 사고 시 5분 안에 실행 가능한지 분기별 훈련
> - Feature flag 는 도입 시 클린업 정책 동시 정의 — 영구 플래그는 부채
> - `runbook` 의 "배포 직후 에러" 시나리오와 직접 연결
