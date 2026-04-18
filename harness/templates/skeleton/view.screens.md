---
id: view.screens
name: 화면 목록
required_when: has.ui
description: 경로 → 컨테이너 매핑, 사용자 흐름
---

## {{section_number}}. 화면 목록

### 경로 매핑
| 경로 | 화면명 | 컨테이너 | Auth | 비고 |
|------|--------|----------|:---:|------|
| `/login` | 로그인 | `LoginContainer` | ❌ | |
| `/register` | 회원가입 | `RegisterContainer` | ❌ | |
| `/` | 홈 | `HomeContainer` | ✅ | |
| `/<resource>` | <목록> | `<Container>` | ✅ | |
| `/<resource>/:id` | <상세> | `<Container>` | ✅ | |

### 사용자 흐름

#### 미인증
```
/login → 로그인 성공 → /
/register → 가입 + 자동 로그인 → /
```

#### 메인 흐름
```
홈 (/)
  ├─ <액션 1> → <결과 화면>
  ├─ <액션 2> → <모달/시트>
  └─ 로그아웃 → /login
```

#### 에러 케이스
- 401 → 토큰 갱신 → 실패 시 `/login`
- 403 → toast "권한이 없습니다"
- 404 → NotFound 화면 또는 toast
- 5xx → toast "잠시 후 다시 시도"

### 반응형 / 접근성
- 모바일 우선 / 데스크탑 우선: `<정책>`
- 최대 폭: `<예: 448px / 1280px>`
- 접근성: WCAG 2.1 AA 준수 (키보드 네비, 콘트라스트, aria 라벨)

> 작성 가이드:
> - 각 경로에 Auth 표시 (auth 섹션과 일치)
> - 흐름은 단방향 화살표 + 분기만
> - 모달/시트는 경로 없이 컨테이너 이름만
