---
name: explain-diff
description: Explain code changes for learning — WHY each change was needed and what principle it follows
---

<Purpose>
git diff를 분석하여 각 변경이 왜 필요했고, 어떤 원리에 기반했는지 학습용으로 상세 설명한다.
</Purpose>

<Use_When>
- 변경사항 이해: "이 변경 설명해줘", "왜 이렇게 바꿨어?", "/explain-diff"
- 다른 사람의 커밋 학습
- 자신의 변경사항 복습
</Use_When>

<Steps>
1. **변경사항 수집**: 인자가 있으면 해당 커밋/범위, 없으면 `git diff HEAD`
2. **파일별 분석**: 각 파일의 변경을 읽고 맥락 파악
3. **학습 설명 작성**: 변경마다 why + what + principle 설명

### 출력 형식
```
## Diff Explanation: [대상]

### `filename.py` (N줄 변경)

#### 변경 1: [변경 요약] — line X-Y
**Before**: [이전 코드 간략]
**After**: [변경 후 코드 간략]
**왜 바꿨나**: [이유 — 보안, 성능, 정확성, 가독성 등]
**원리**: [적용된 프로그래밍 원칙]
**배울 점**: [핵심 교훈]

---

### 전체 요약
- **주요 테마**: [공통 주제]
- **적용된 원칙**: [사용된 원칙들]
- **학습 포인트**: [가장 중요한 N가지 교훈]
```
</Steps>
