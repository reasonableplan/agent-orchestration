---
name: ha-init
description: |
  HarnessAI v2 — 프로젝트 초기화 스킬.
  스택 자동 감지 + 사용자 설명 인터뷰 + 판단 → harness-plan.md + skeleton.md 생성.
  v2 인프라(profile_loader/skeleton_assembler/plan_manager) 의 첫 사용자 진입점.
  Use when: 새 프로젝트 시작, "프로젝트 시작하자", "/ha-init"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

## 역할

새 프로젝트 (또는 v2 시스템 처음 적용하는 기존 프로젝트) 의 초기화.

**입력**: 사용자가 무엇을 만들고 싶은지에 대한 자연어 설명
**출력**: `docs/harness-plan.md` + `docs/skeleton.md` (빈 템플릿)
**다음**: `/ha-design` 으로 skeleton 채우기

## 실행 순서

### 1. 프로젝트 루트 확인

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
echo "PROJECT_ROOT: $PROJECT_ROOT"
```

### 2. 프로파일 자동 감지

```bash
python ~/.claude/skills/ha-init/run.py detect "$PROJECT_ROOT"
```

출력은 JSON. 다음 정보 추출:
- `matches[]` — 감지된 프로파일 목록 (id, name, path, required/optional sections, toolchain, whitelist, gstack_recommended)

**매칭 0건 처리**:
- 사용자에게 알리고 AskUserQuestion 으로 수동 선택 옵션 제시
- 옵션: `~/.claude/harness/profiles/*.md` 의 confirmed status 프로파일 ID 목록
- 사용자 선택 후 `--profiles <id>` 로 직접 지정해서 다음 단계 진행

### 3. 사용자 설명 수집

AskUserQuestion 으로:
- "뭘 만들고 싶으세요? 한두 문장으로 설명해 주세요."
- (free text 응답)

답변이 짧고 모호하면 (50자 미만) 추가 질문 1개:
- "주요 기능 또는 사용자가 누구인지 조금 더 알려주세요."

### 4. Claude 판단 — 다음을 직접 결정한다

**4-1. 프로젝트 타입 한 줄 요약** (예: "LLM 기반 코드 분석 CLI 도구")

**4-2. 규모 결정**
- `tiny` — 주말 스크립트, 단일 기능
- `small` — 개인 도구, 핵심 기능 1~3개
- `medium` — 다중 모듈 MVP
- `large` — 멀티 서비스 또는 운영 제품

판단 기준은 사용자 설명 + 감지된 프로파일의 `required_sections` 수.

**4-3. optional 섹션 포함 여부 결정**

각 optional 섹션마다 자체 판단:
- `requirements` — 명확한 기능 목록 있으면 포함 (보통 small 이상에서 포함)
- `configuration` — 환경변수/API 키 필요 시 포함
- `persistence` — 파일/DB 저장 있으면 포함
- `auth` — 다중 사용자 / 인증 필요 시 포함
- `integrations` — 3rd party API 연동 있으면 포함
- 기타 — 사용자 설명 + 프로파일 components 기반

**4-4. 파이프라인 단계 + gstack 게이트 제안**

기본:
```
ha-init → ha-design → ha-plan → ha-build (반복) → ha-verify → ha-review
```

프로파일의 `gstack_recommended` 에 정의된 게이트 끼워넣기:
- `before_design`, `after_design`, `after_build`, `before_ship`, `after_ship`

규모가 작으면 일부 gstack 게이트 생략 권장 (예: tiny CLI 는 `/qa` 생략).

### 5. 사용자에게 제안 출력 + 승인

다음 형식으로 출력:

```
=== /ha-init 제안 ===

프로젝트 타입: <한 줄>
규모: <tiny|small|medium|large>
활성 프로파일: <id @ path> [, ...]

skeleton 섹션 (총 N개):
  required (M):  <목록>
  optional (K):  <목록>

파이프라인:
  1. /ha-init     ✅ (방금)
  2. /ha-design   ⏳
  3. (gstack) /plan-eng-review (선택)
  ...

생략 제안:
  - /office-hours: <이유>
  - /qa: <이유>
```

AskUserQuestion 으로 승인:
- `진행` — 그대로 작성
- `수정` — 어디를 어떻게 (사용자 텍스트 받아서 4-2~4-4 재조정 후 재제안. 최대 3회)
- `취소` — 저장 없이 종료

### 6. 파일 작성

승인 받으면:

```bash
python ~/.claude/skills/ha-init/run.py write \
  --project "$PROJECT_ROOT" \
  --profiles "<comma-separated profile IDs>" \
  --included "<comma-separated section IDs in order>" \
  --description "<원본 사용자 설명>" \
  --project-type "<한 줄 요약>" \
  --scale "<tiny|small|medium|large>" \
  --gstack-mode manual
```

기존 `docs/harness-plan.md` 또는 `docs/skeleton.md` 가 있으면 자동 백업 (`.backup-*`).

### 7. 다음 단계 안내

출력 예시:
```
✅ /ha-init 완료

생성된 파일:
  - <project>/docs/harness-plan.md
  - <project>/docs/skeleton.md (빈 템플릿)

다음 단계:
  1. /ha-design — Architect/Designer 가 skeleton 채움
  2. (선택) /plan-eng-review — 설계 검토 후 ha-design 결과 강화
  3. /ha-plan → /ha-build → /ha-verify → /ha-review

참고:
  - skeleton.md 직접 편집 가능 (어색한 placeholder 보완)
  - harness-plan.md 의 pipeline.skipped_steps 에 생략하고 싶은 단계 추가 가능
```

## 가드레일 — 절대 하지 마라

- `--overwrite` 플래그 없이 기존 파일 덮어쓰기 (run.py 가 자동 백업하지만 직접 Write 도구로 우회 금지)
- 사용자 설명 없이 임의로 description/project-type 결정
- 프로파일 매칭 0건인데 멋대로 진행 — 반드시 수동 선택 옵션 제시
- skeleton.md 의 fragment 본문 직접 편집 (그건 `/ha-design` 의 일)

## 환경변수

- `HARNESS_AI_HOME` — HarnessAI 레포 경로 (기본: `C:/Users/juwon/OneDrive/Desktop/agent`)
  - run.py 가 v2 모듈 (profile_loader 등) 을 import 할 때 사용

## 트러블슈팅

**`[FAIL] HARNESS_AI_HOME 의 backend/ 가 없음`**:
- HARNESS_AI_HOME 환경변수가 잘못 설정됨. agent 레포의 절대 경로로 export.

**`프로파일 'X' 로드 실패`**:
- `~/.claude/harness/profiles/X.md` 가 없거나 frontmatter 깨짐. `harness validate profiles` 로 확인.

**`detect` 가 매칭 0건**:
- 프로젝트 루트에 `pyproject.toml` / `package.json` 등 마커 파일이 없거나, `_registry.yaml` 의 paths 에 해당 위치가 없음.
- `python ~/.claude/harness/bin/harness validate registry` 로 규칙 확인.
