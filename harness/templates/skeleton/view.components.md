---
id: view.components
name: 컴포넌트 트리
required_when: has.ui + scale.small_or_larger
description: App 컴포넌트 계층, 공용 컴포넌트, 디자인 가이드
---

## {{section_number}}. 컴포넌트 트리

### App 계층
```
App
├─ <Provider/Router>
│   ├─ ProtectedRoute
│   │   ├─ <HomeContainer /> (/)
│   │   │   ├─ <Header />
│   │   │   ├─ <HabitList>
│   │   │   │   └─ <HabitCard />[]
│   │   │   └─ <AddHabitSheet />
│   │   └─ ...
│   └─ <AuthLayout>
│       ├─ <LoginContainer /> (/login)
│       └─ <RegisterContainer /> (/register)
```

### 공용 컴포넌트 (shared/components)
| 컴포넌트 | 용도 | props |
|----------|------|-------|
| `<Button>` | 버튼 | `variant, size, onClick` |
| `<Input>` | 입력 | `value, onChange, error` |
| `<Modal>` | 모달 | `open, onClose, title` |
| `<Sheet>` | 바텀 시트 (모바일) | `open, onClose` |
| `<Toast>` | 알림 | `type, message` |

### 디자인 가이드

**색상 (CSS 변수)**
```css
--bg-base:       <#0f1117>
--bg-surface:    <#1a1d27>
--text-primary:  <#f1f3fa>
--text-secondary:<#9ca3c4>
--accent:        <#4f76f6>
--success:       <#22c55e>
--error:         <#ef4444>
```

**타이포그래피**
- 제목: <폰트 패밀리, 크기>
- 본문: <...>

**스타일 규칙**
- CVA + `index.style.ts` 분리
- 인라인 Tailwind 2개 이상 금지
- `type="number"` 금지 → `type="text" inputMode="numeric"` (LESSON-006)
- 폼 submit 아닌 버튼: `type="button"` 명시

### 상태 관리 매핑
| Store | 담당 | 경로 |
|-------|------|------|
| `authStore` | 인증/사용자 | `shared/store/auth.store.ts` |
| `<domainStore>` | <도메인> | `containers/<domain>/store/` |

> 작성 가이드:
> - 계층은 실제 JSX 구조와 1:1 일치
> - 공용 컴포넌트는 도메인 로직 0 — 순수 UI만
> - 컨테이너는 store와 직접 연결, 프레젠테이션 컴포넌트는 props로만
