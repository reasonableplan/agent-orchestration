---
id: auth
name: 인증 / 권한
required_when: has.users
description: 인증 방식, 토큰/세션 수명, 보호 리소스, 권한 모델
---

## {{section_number}}. 인증 / 권한

### 인증 방식
- 방식: `<JWT / 세션 쿠키 / OAuth 2.0 / API Key / mTLS / ...>`
- 선택 근거: `<이 방식을 고른 이유>`

### 자격 증명 수명
| 항목 | 수명 | 저장 위치 |
|------|------|----------|
| Access token | `<예: 24시간>` | `<localStorage / cookie / memory>` |
| Refresh token | `<예: 7일>` | `<httpOnly cookie / secure storage>` |

### 인증 흐름
핵심 시나리오별 시퀀스:

```
로그인:        <클라이언트 → 서버 → 발급>
토큰 갱신:      <401 → refresh → 재시도>
로그아웃:      <토큰 폐기 / 블랙리스트>
비밀번호 재설정: <있을 시 절차>
```

### 보호 라우트 / 리소스
- 인증 필요: `<리스트>`
- 인증 불필요 (public): `<리스트>`
- 익명 접근 가능하지만 인증하면 다르게 응답: `<리스트>`

### 권한 모델
| 역할 | 권한 |
|------|------|
| `user` | 자신의 리소스 CRUD |
| `admin` | 모든 리소스 + 관리 기능 |

**권한 검증 지점**: `<어디서 권한을 확인하는가 — 미들웨어 / 서비스 레이어 / 쿼리 필터>`

### 시크릿 관리
- JWT 서명 키: `<환경변수 이름>` (configuration 섹션 참조)
- 로테이션 정책: `<예: 분기별>`
- 비상 폐기 절차: `<키 교체 시 기존 토큰 전부 무효화>`

### 보안 원칙 체크리스트
- [ ] 비밀번호 해시 (bcrypt / argon2, cost/memory 적절)
- [ ] 타이밍 공격 방지 (`hmac.compare_digest` 또는 등가)
- [ ] CSRF 방어 (쿠키 인증 시)
- [ ] Rate limit (무차별 대입 방어)

> 작성 가이드:
> - 인증 프레임워크 구체 사용법은 프로파일 본문 참조 (예: FastAPI의 `Depends(get_current_user)`)
> - 비밀값 이름은 configuration 섹션의 환경변수 목록과 1:1 일치
> - OAuth 공급자 목록은 integrations 섹션에 기록
> - 모든 시크릿은 절대 커밋 금지 — `.env` + `.env.example` 분리
