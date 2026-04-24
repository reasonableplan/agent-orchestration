---
name: ha-plan
description: |
  HarnessAI v2 — 채워진 skeleton 으로부터 태스크 분해 (Orchestrator 역할).
  의존성 그래프 + 컴포넌트별 구현 태스크 → tasks.md 생성.
  Use when: /ha-design 완료 후, "태스크 분해", "/ha-plan"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---

## 역할

채워진 skeleton 을 읽어 구현 태스크 목록 (`tasks.md`) 을 생성. 또한 skeleton 의 `tasks` 섹션도 동시 갱신.

**입력**: `docs/skeleton.md` (designed)
**출력**: `docs/tasks.md` + skeleton.md 의 `tasks` 섹션
**다음**: `/ha-build T-XXX`

## 실행 순서

### 1. 사전 조건 + 컨텍스트
```bash
python ~/.claude/skills/ha-plan/run.py prepare
```
JSON 출력: profile components, skeleton 섹션 채워짐 여부, orchestrator 프롬프트 경로.

### 2. Orchestrator 프롬프트 + skeleton 로드
- `<HARNESS_AI_HOME>/backend/agents/orchestrator/CLAUDE.md` 읽기
- 채워진 `docs/skeleton.md` 전체 읽기
- 활성 프로파일들의 `components` (각 component 가 한 태스크 후보)

### 3. 태스크 분해 (Orchestrator 역할)

**Phase 분리 우선** (orchestrator/CLAUDE.md 의 Phase 1=MVP / Phase 2+=확장 규칙):
- Phase 1: 핵심 사용자 흐름이 동작하는 최소 기능
- Phase 2+: 부가 기능

**각 Phase 내 태스크 순서**:
1. persistence 모델 (해당 시)
2. interface.* 구현 (HTTP/CLI/IPC/SDK)
3. core.logic
4. view.* (해당 시)
5. integrations (해당 시)

**태스크 단위**: 1 PR = 1 태스크. 너무 크면 분리, 너무 작으면 병합.

**테스트 태스크 동반** (필수 — `/ha-review` 의 분포 체크가 BLOCK/WARN 발동):
- **구현 태스크 1개 = 대응 테스트 태스크 최소 1개** (또는 같은 태스크 안에 테스트 포함)
- **I/O 경계 컴포넌트 (LLM 호출, 외부 API, DB, 파일 시스템) 는 테스트 최소 2개 이상** — 성공 경로 + 실패/재시도 경로
- `core.logic` 순수 함수는 unit test 우선, `io/` 는 integration test
- 프론트엔드도 동일: `view.*` 는 render + interaction 테스트, `state.flow` 는 store action 테스트
- 테스트 태스크 ID 는 구현 태스크와 짝 (예: `T-003 모델 구현` ↔ `T-004 모델 테스트`), 또는 "implement + tests" 같은 이름으로 통합

**의존성** (`depends_on`):
- DB → API → 프론트엔드 (순서 필수)
- core.logic 은 다른 컴포넌트와 병렬 가능
- 테스트 태스크는 구현 태스크에 `depends_on`

**출력 포맷** (orchestrator/CLAUDE.md 와 동일 — 두 부분 모두 필수):

**1) Phase 테이블** (파서 고정, 정확히 5 컬럼):
```markdown
### Phase 1 — MVP
| ID | 에이전트 | 의존성 | 설명 | 상태 |
|----|---------|--------|------|------|
| T-001 | backend_coder | - | <component_id>: <설명> | 대기 |
| T-002 | backend_coder | T-001 | ... | 대기 |
```

**2) 태스크별 구현 스펙 블록** (모든 태스크마다 필수 — Coder 자율 결정 방지):

```markdown
### T-001 — DB 모델 (users)

- **담당**: backend_coder
- **생성/수정 파일** (skeleton 에서 복사):
  - NEW `backend/src/app/models/user.py`
  - NEW `backend/tests/models/test_user.py`
- **skeleton 참조**: `persistence.users`
- **구현 세부** (Architect 가 skeleton 에 확정한 것 그대로):
  - `users`: id (PK), email (unique/index/not null), password_hash (not null), ...
  - FK: 없음
  - 인덱스: email (unique)
- **참조 파일** (기존 패턴 복제 대상): `guidelines/backend/structure.md`
- **완료 기준**: LESSON-021 toolchain (test + lint + type) 통과 + skeleton 과 컬럼/타입/제약 100% 일치
```

- 스펙 블록은 모든 Phase 테이블 **아래에 연속 배치**
- skeleton 에 필요한 정보가 없으면 태스크 분해 중단 → Architect/Designer 에게 에스컬레이션 (skeleton 보완 후 재개)
- 스펙 블록 없는 태스크는 미완성 산출물로 간주

### 4. tasks.md 작성 + skeleton 의 tasks 섹션 갱신
```bash
python ~/.claude/skills/ha-plan/run.py commit \
  --tasks-content "$(cat <<'EOF'
<태스크 분해 마크다운 본문>
EOF
)"
```
run.py 가:
- `docs/tasks.md` 작성
- `docs/skeleton.md` 의 `## N. 태스크 분해` 섹션을 같은 내용으로 동기화
- `current_step` "designed" → "planned"

### 5. 다음 단계 안내
```
✅ /ha-plan 완료
태스크 N개 / Phase M개
의존성 없는 즉시 시작 가능: T-XXX, T-YYY

다음:
  /ha-build T-XXX  — 단일 태스크 구현
  /ha-build --parallel T-XXX,T-YYY  — 병렬 (의존성 없을 때)
```

## 가드레일
- 태스크에 reviewer/qa 직접 배정 금지 (Phase 리뷰는 자동 처리)
- skeleton 에 정의된 모든 컴포넌트가 태스크로 커버되는지 확인
- 의존성 순환 금지
- skeleton 의 다른 섹션은 절대 수정 X (tasks 만)
