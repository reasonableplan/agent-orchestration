---
name: plan
description: Implementation planning — think before coding, design before implementing
---

<Purpose>
구현 전에 설계 계획을 세운다. 어떤 파일을 수정해야 하는지, 어떤 순서로 해야 하는지, 어떤 엣지 케이스가 있는지 미리 파악한다.
</Purpose>

<Use_When>
- 구현 전 계획: "계획 세워줘", "/plan"
- 복잡한 기능 추가 전
- 리팩토링 범위 파악
</Use_When>

<Do_Not_Use_When>
- 단순 버그 픽스 (바로 고치면 됨)
- 한 파일만 수정하면 되는 변경
</Do_Not_Use_When>

<Steps>
1. **요구사항 파악**: 사용자 요청 분석, 모호한 부분은 질문
2. **코드베이스 탐색**: 관련 파일, 기존 패턴, 의존성 파악
3. **계획 수립**: 구체적 구현 단계 작성

### 출력 형식
```
## Implementation Plan: [제목]

### 요구사항
- [명확한 요구사항 리스트]

### 수정 대상 파일
1. `file.py` — [무엇을 변경하고 왜]

### 구현 순서
1. [첫 번째 단계] — 이유: [왜 이 순서인지]

### 엣지 케이스
- [놓치기 쉬운 케이스들]

### 리스크
- [잘못될 수 있는 것들과 대응]

### 검증 방법
- [어떻게 완료를 확인할지]
```
</Steps>
