---
id: interface.sdk
name: Public API (SDK)
required_when: has.sdk_surface
description: export 함수/클래스, 타입, 버전 호환성
---

## {{section_number}}. Public API (SDK)

### 패키지 정보
- 패키지명: `<예: @scope/name 또는 pypi_name>`
- 현재 버전: `<0.1.0>`
- 배포: `<PyPI / npm / crates.io>`
- 설치: `<pip install name / npm install @scope/name>`

### Export 목록

#### 함수
| 이름 | 시그니처 | 용도 |
|------|----------|------|
| `<fn>` | `(arg: T) -> U` | <한 줄 설명> |

#### 클래스
| 이름 | 메서드 | 용도 |
|------|--------|------|
| `<Class>` | `.method_a(), .method_b()` | <한 줄> |

#### 타입 / 인터페이스
| 이름 | 정의 |
|------|------|
| `<TypeName>` | `{ field: type }` |

### 사용 예시
```<언어>
import { <fn> } from '<pkg>'

const result = <fn>({ foo: 'bar' })
```

### 버전 호환성
- **Semver 준수**: `MAJOR.MINOR.PATCH`
- Breaking change = MAJOR 증가 + CHANGELOG에 명시
- 최소 지원 언어/런타임 버전: `<예: Python 3.10+, Node 18+>`

### 공개 표면 경계 (public vs private)
- **Public**: `__init__.py` / `index.ts`에서 export된 것만
- **Private**: 밑줄 prefix (`_internal`) 또는 `lib/` 내부
- Private은 언제든 변경 가능. Public은 semver 규칙 적용.

### Deprecation 정책
- 제거 예정 API: `@deprecated` 태그 + CHANGELOG에 대안 명시
- MAJOR 1회 건너뛰고 삭제 (예: v1에서 deprecated → v3에서 삭제)

> 작성 가이드:
> - Public API는 문서화 필수 (docstring / JSDoc / TSDoc)
> - 타입 정의는 별도 파일로 export (types.ts 또는 __init__.pyi)
> - 사용 예시는 실제 실행 가능한 코드로
