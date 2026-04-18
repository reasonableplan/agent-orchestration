---
id: deployment
name: 배포 설정
required_when: has.production_concerns
description: 타겟 환경, CI/CD, 헬스체크, 롤백 전략
---

## {{section_number}}. 배포 설정

### 타겟 환경
| 환경 | URL | 브랜치 | 배포 자동화 |
|------|-----|--------|:---:|
| development | `http://localhost:<port>` | — | 수동 (`uv run python -m ...`) |
| staging | `https://staging.<domain>` | `main` | ✅ push 시 |
| production | `https://<domain>` | `release` | ✅ tag push 시 |

### 빌드 / 배포
- **빌드 명령**: `<예: uv build / npm run build / docker build>`
- **배포 플랫폼**: `<예: Fly.io / Vercel / AWS ECS / Docker Hub>`
- **컨테이너 이미지**: `<예: registry.example.com/app:tag>`

### CI/CD 파이프라인
```
GitHub Actions / GitLab CI:
  1. Lint (ruff / eslint)
  2. Type check (pyright / tsc)
  3. Test (pytest / vitest) — 커버리지 report
  4. Build
  5. Deploy (staging 자동 / prod 수동 승인)
  6. Smoke test (헬스체크 + 핵심 엔드포인트)
```

### 시크릿 관리
- <예: GitHub Actions secrets / AWS Secrets Manager / 1Password>
- 로테이션 주기: `<90일>`
- 로컬 개발: `.env` (gitignore), `.env.example` 템플릿 제공

### 헬스체크 / 프로브 (컨테이너)
```yaml
# 예시
healthcheck:
  test: curl -f http://localhost:8000/healthz
  interval: 30s
  timeout: 5s
  retries: 3
```

### 롤백 전략
- **즉시 롤백 조건**: 5xx rate > 5% 또는 헬스체크 실패
- **롤백 방법**: `<예: Fly.io "fly deploy --image=<prev-tag>" / k8s rollout undo>`
- **데이터 마이그레이션 롤백**: `<마이그레이션 도구 down>` / 수동 SQL / forward-only (롤백 불가) — 정책 명시

### 블루/그린 또는 카나리
- <전략: 블루/그린 vs 롤링 vs 카나리>
- <트래픽 분배: 예 - 카나리 5% → 25% → 100%>

> 작성 가이드:
> - 시크릿 커밋 금지 — GitHub secret scanning 활성화
> - 롤백 가능한 마이그레이션만 deploy (또는 forward-only 명시)
> - 첫 배포 전에 헬스체크 먼저 수동 테스트
