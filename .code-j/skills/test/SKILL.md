---
name: test
description: TDD workflow — write failing test first, then minimal implementation
---

<Purpose>
TDD 워크플로우를 실행한다. 테스트를 먼저 작성하고, 실패를 확인한 후, 최소한의 코드로 통과시킨다.
</Purpose>

<Use_When>
- 새 기능에 테스트 필요: "테스트 작성해줘", "/test"
- 커버리지 보강
- TDD로 구현하고 싶을 때
</Use_When>

<Steps>
1. **기존 테스트 파악**: 프레임워크, 구조, 네이밍 패턴 확인
2. **테스트 엔지니어 실행**: `Agent(subagent_type="code-j:test-engineer")` 로 TDD 수행

### TDD 사이클
```
1. RED   — 실패하는 테스트 작성 → 실행 → 실패 확인
2. GREEN — 테스트 통과할 최소한의 코드 작성 → 실행 → 통과 확인
3. REFACTOR — 코드 정리 → 실행 → 여전히 통과 확인
4. REPEAT
```

### 출력 형식
```
## Test Report

**커버리지**: [현재]% -> [목표]%

### 작성한 테스트
- `test_file.py::test_name` — [테스트하는 동작]

### 커버리지 갭
- `module.py:42-80` — [미테스트 로직] — 리스크: High/Medium/Low

### 검증
- 테스트 실행: [명령어] -> [N개 통과, 0개 실패]
```
</Steps>
