---
id: interface.cli
name: CLI 커맨드
required_when: has.cli_entrypoint
description: 커맨드 목록, 인자, 옵션, 예시
---

## {{section_number}}. CLI 커맨드

### 엔트리포인트
- 실행 명령: `<예: hijack>` 또는 `python -m <package>`
- 프레임워크: `<click / argparse / typer>`

### 공통 옵션
| 옵션 | 축약 | 설명 |
|------|-----|------|
| `--verbose` | `-v` | 상세 로그 |
| `--quiet` | `-q` | 출력 최소화 |
| `--help` | `-h` | 도움말 |
| `--version` | | 버전 표시 |

### 커맨드

#### `<cmd_1>`
```
사용법: <app> <cmd_1> [옵션] <인자>

인자:
  <ARG>    <설명 — 필수/선택>

옵션:
  --<opt> <type>  <설명>

예시:
  <app> <cmd_1> foo --bar=1
  → <기대 출력>

에러:
  exit 2: 인자 누락 / 형식 오류
  exit 3: 내부 처리 실패
```

#### `<cmd_2>`
...

### 서브커맨드 그룹 (있을 때)
```
<app>
├─ <group_a>
│   ├─ list
│   ├─ add
│   └─ remove
└─ <group_b>
```

### 출력 형식
- 기본: 사람이 읽는 텍스트 (rich/컬러 OK)
- `--json` 옵션 시: JSON (스크립트 연동용)
- 에러: stderr, 결과: stdout (파이프 호환성)

> 작성 가이드:
> - 모든 커맨드에 최소 1개 실행 예시
> - exit code는 `errors` 섹션과 일치
> - `print()` 직접 호출 대신 click.echo 등 프레임워크 API 사용
