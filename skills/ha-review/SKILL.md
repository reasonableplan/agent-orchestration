---
name: ha-review
description: |
  HarnessAI v2 — 보안 훅 + LESSON 패턴 + AI 슬롭 + convention 종합 리뷰 (Reviewer 역할).
  ai-slop-cleaner 패턴이 7번째 훅으로 통합됨.
  Use when: /ha-verify 통과 후, "리뷰해줘", "/ha-review"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

## 역할

`/ha-verify` 통과 후 코드 품질의 마지막 게이트. APPROVE 또는 REJECT (구체적 위반 사항 + 수정 방법).

**입력**: 변경된 코드 (verified 상태) + git diff
**출력**: 리뷰 결과 (APPROVE/REJECT) + verify_history 기록
**다음**: APPROVE 시 reviewed 상태 (배포 가능). REJECT 시 building 으로 회귀.

## 실행 순서

### 1. 사전 조건 + git diff
```bash
python ~/.claude/skills/ha-review/run.py prepare
```
JSON 출력: 활성 프로파일들 (whitelist + lessons_applied), git diff 변경 파일 목록, 보안 훅 + ai-slop 패턴 목록.

### 2. 6개 보안 훅 + ai-slop (7번째)
backend 의 `security_hooks.SecurityHooks.from_profile(<primary_profile>).run_all(<diff_text>, is_frontend=...)` 호출.

다음 훅들이 자동 실행됨:
1. **secret-filter** — 하드코딩 시크릿 탐지
2. **command-guard** — 위험 명령 (rm -rf, eval, DROP TABLE)
3. **db-guard** — raw SQL, f-string SQL, WHERE 없는 DELETE
4. **dependency-check** — 화이트리스트 외 import/install
5. **code-quality** — TS any, 빈 except, console.log, print
6. **contract-validator** — skeleton 외 엔드포인트
7. **ai-slop** (신규) — 아래 패턴들 (Bash + Grep 으로 보조):
   - 과도한 추상화 (단일 호출자만 있는 helper)
   - 의미 없는 try/except (re-raise 만)
   - 장황한 docstring (>5줄에 정보 X)
   - dead code (정의됐는데 안 쓰임)
   - 임시 핵 흔적 (TODO/FIXME 신규 추가)

각 훅의 BLOCK/WARN finding 수집.

### 3. LESSON 패턴 점검
`<HARNESS_AI_HOME>/backend/docs/shared-lessons.md` 의 LESSON-XXX 패턴 중 활성 프로파일에 적용되는 것들 (`profile.lessons_applied`):
- 각 LESSON 의 패턴(보통 정규식이나 anti-pattern 설명)을 변경 파일에서 검색
- 발견 시 위반으로 기록 (LESSON-NNN 번호 포함)

### 4. 프로파일 convention 점검
프로파일 본문(.md) 의 "금지 사항" 섹션을 읽고 변경 파일에서 위반 검색.

### 5. APPROVE / REJECT 판정
- BLOCK 1건 이상 → REJECT
- WARN 만 있고 BLOCK 0건 → APPROVE (with notes)
- BLOCK 0 + WARN 0 → APPROVE (clean)

출력 형식 (Reviewer agent 출력 규격):
```
## Review Result: APPROVE | REJECT

### 위반 사항 (REJECT 시)
1. [훅명/LESSON-N번 위반] 파일:라인 — 설명 — 수정 방법
2. ...

### 권장 사항
1. 파일:라인 — 개선 제안 (선택)

### shared-lessons 확인
- 패턴 반복 여부: 없음 / 있음 (LESSON-XXX)

### AI Slop 점검
- 발견: 0 / N건
```

### 6. 결과 기록
```bash
python ~/.claude/skills/ha-review/run.py record \
  --verdict approve|reject \
  --summary "<요약>" \
  --violations "<\"위반1\",\"위반2\"...>" (REJECT 시)
```
run.py 가:
- `verify_history` 에 새 엔트리 (step="ha-review")
- APPROVE → "verified" → "reviewed" 전이
- REJECT → "building" 으로 회귀

### 7. 다음 안내
```
✅ APPROVE — clean.
다음: (선택) /review (gstack pre-PR), /ship 또는 사용자 결정

또는

❌ REJECT — N건 위반.
다음: 위반 사항 수정 후 /ha-verify → /ha-review 재실행
       또는 /ha-build <T-ID> 로 해당 태스크 재작업
```

## 가드레일

- 코드 직접 수정 X (리뷰 코멘트만)
- BLOCK 무시하고 APPROVE 금지
- 모호한 reject 금지 — 반드시 파일:라인 + 수정 방법
- skeleton 계약 무시한 자기 기준 판단 금지
