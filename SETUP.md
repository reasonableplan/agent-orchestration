# Setup Guide — Agent Orchestration System

처음 사용하는 사람을 위한 설치 및 실행 가이드.

---

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [저장소 클론](#2-저장소-클론)
3. [GitHub 설정](#3-github-설정)
4. [Git 인증 설정 (gh CLI)](#4-git-인증-설정-gh-cli)
5. [환경 변수 설정](#5-환경-변수-설정)
6. [PostgreSQL 시작](#6-postgresql-시작)
7. [백엔드 설치 및 실행](#7-백엔드-설치-및-실행)
8. [프론트엔드 설치 및 실행](#8-프론트엔드-설치-및-실행)
9. [시스템 사용법](#9-시스템-사용법)
10. [트러블슈팅](#10-트러블슈팅)

---

## 1. 사전 요구사항

아래 도구들이 설치되어 있어야 합니다:

| 도구 | 버전 | 설치 링크 |
|------|------|-----------|
| **Python** | 3.12+ | https://python.org |
| **uv** | 최신 | https://docs.astral.sh/uv/getting-started/ |
| **Node.js** | 20+ | https://nodejs.org |
| **pnpm** | 9+ | https://pnpm.io/installation |
| **Docker** | 최신 | https://docs.docker.com/get-docker/ |
| **gh** (GitHub CLI) | 2.0+ | https://cli.github.com/ |
| **Git** | 2.30+ | https://git-scm.com/ |

### 설치 확인

```bash
python --version    # 3.12 이상
uv --version        # 0.5 이상
node --version      # 20 이상
pnpm --version      # 9 이상
docker --version    # 설치 확인
gh --version        # 2.0 이상
git --version       # 2.30 이상
```

---

## 2. 저장소 클론

```bash
git clone https://github.com/reasonableplan/agent-orchestration.git
cd agent-orchestration
```

---

## 3. GitHub 설정

에이전트가 GitHub Project Board를 사용하므로 아래 3가지를 준비해야 합니다.

### 3.1 대상 저장소 준비

에이전트가 코드를 push할 저장소가 필요합니다. 새 repo를 만들거나 기존 repo를 사용하세요.

### 3.2 GitHub Project Board 생성

1. 대상 repo의 **Projects** 탭 → **New project** → **Board** 선택
2. Board에 6개 컬럼 생성:
   - `Backlog` → `Ready` → `In Progress` → `Review` → `Failed` → `Done`
3. URL에서 프로젝트 번호 확인 (예: `github.com/users/you/projects/2` → `2`)

### 3.3 라벨 생성

에이전트가 태스크를 라우팅할 때 라벨을 사용합니다:

```bash
gh label create "agent:frontend" --color 61DAFB --repo OWNER/REPO
gh label create "agent:backend"  --color 68A063 --repo OWNER/REPO
gh label create "agent:docs"     --color F7DF1E --repo OWNER/REPO
gh label create "agent:git"      --color F05032 --repo OWNER/REPO
```

---

## 4. Git 인증 설정 (gh CLI)

**이 단계가 중요합니다.** 에이전트의 GitService가 git clone/push/pull을 실행할 때 gh CLI의 credential helper를 통해 인증합니다.

### 4.1 gh 로그인

```bash
gh auth login
```

프롬프트에 따라 로그인합니다:
- **GitHub.com** 선택
- **HTTPS** 선택
- 브라우저 또는 토큰으로 인증

### 4.2 git credential helper 등록

```bash
gh auth setup-git
```

이 명령은 git의 credential helper로 gh를 등록합니다. 이후 모든 git 명령(clone, push, pull 등)에서 gh가 자동으로 인증을 처리합니다.

### 4.3 인증 확인

```bash
# gh 로그인 상태 확인
gh auth status

# git 인증 동작 확인 (대상 repo URL로 변경)
git ls-remote https://github.com/OWNER/REPO.git HEAD
```

`git ls-remote`가 커밋 해시를 출력하면 인증이 정상입니다.

### 동작 원리

```
git push  →  git이 credential helper(gh) 호출  →  gh가 저장된 토큰으로 인증  →  성공
```

- `.env`의 `GITHUB_TOKEN`은 REST/GraphQL API 호출(이슈 생성, 보드 조작 등)에만 사용됩니다.
- git 명령(clone, push, pull)의 인증은 전적으로 gh credential helper가 담당합니다.
- 토큰이 프로세스 목록에 노출되지 않아 보안상 안전합니다.

---

## 5. 환경 변수 설정

```bash
cp backend/.env.example backend/.env
```

`backend/.env` 파일을 편집합니다:

### 필수 설정

```env
# ===== GitHub (필수) =====
GITHUB_TOKEN=ghp_xxxxx          # gh auth login 시 사용한 토큰, 또는 별도 PAT
GITHUB_OWNER=your-username      # GitHub 사용자명 또는 조직명
GITHUB_REPO=your-repo           # 대상 저장소 이름
GITHUB_PROJECT_NUMBER=2         # Project Board 번호

# ===== PostgreSQL (필수) =====
DATABASE_URL=postgresql+asyncpg://agent:agent@localhost:5433/agent_db
```

### LLM 백엔드 (3가지 중 택 1)

```env
# 옵션 A — Anthropic API (기본값, API 크레딧 소모)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# 옵션 B — Claude Code CLI (Claude Max/Pro 구독자, 무료)
# USE_CLAUDE_CLI=true

# 옵션 C — 로컬/클라우드 모델 (Ollama, LM Studio, OpenRouter 등)
# USE_LOCAL_MODEL=true
# LOCAL_MODEL_BASE_URL=http://localhost:11434/v1
# LOCAL_MODEL_NAME=llama3.1
# LOCAL_MODEL_API_KEY=              # 클라우드 서비스만 필요
```

**어떤 옵션을 선택해야 할까?**

| 상황 | 추천 |
|------|------|
| API 크레딧이 있다 | 옵션 A (가장 안정적) |
| Claude Max/Pro 구독 중이다 | 옵션 B (무료, 속도 제한 있음) |
| 비용을 아끼고 싶다 / 오프라인 | 옵션 C + Ollama |

> LLM 백엔드 상세 설정: [docs/llm-backends.md](docs/llm-backends.md)

### 선택 설정

```env
GIT_WORK_DIR=./workspace            # 에이전트 작업 디렉토리 (기본: ./workspace)
DASHBOARD_PORT=3001                 # 대시보드 서버 포트
DASHBOARD_HOST=127.0.0.1            # Docker 환경: 0.0.0.0
LOG_LEVEL=info                      # debug, info, warning, error
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
# DASHBOARD_AUTH_TOKEN=secret       # 프로덕션 환경에서 설정 권장
```

---

## 6. PostgreSQL 시작

Docker Compose로 PostgreSQL을 실행합니다:

```bash
docker compose up -d
```

PostgreSQL이 `localhost:5433`에서 실행됩니다 (user/password/db: `agent`).

> 이미 로컬에 PostgreSQL이 있다면 `DATABASE_URL`을 해당 연결 문자열로 변경하세요.

### DB 마이그레이션

```bash
cd backend
uv run alembic upgrade head
cd ..
```

---

## 7. 백엔드 설치 및 실행

```bash
cd backend

# 의존성 설치
uv sync

# (선택) 테스트 실행 — 모든 테스트가 통과하는지 확인
uv run pytest

# 서버 시작
uv run python -m src.main
```

서버가 시작되면:
- REST API: `http://localhost:3001/api`
- WebSocket: `ws://localhost:3001/ws`
- CLI 프롬프트: `agent>` 에서 자연어 입력 가능

---

## 8. 프론트엔드 설치 및 실행

별도 터미널에서:

```bash
cd packages/dashboard-client

# 의존성 설치
pnpm install

# 개발 서버 시작
pnpm dev
```

브라우저에서 `http://localhost:5173` 접속.

> 백엔드 없이도 3초 후 자동으로 **데모 모드**로 전환되어 UI를 미리 볼 수 있습니다.

---

## 9. 시스템 사용법

### 9.1 기본 흐름

```
1. 사용자가 자연어로 요청     "로그인 페이지 만들어줘"
         ↓
2. Director가 아키텍처 논의    기술 스택, 범위, 제약 조건 대화
         ↓
3. 사용자가 계획 승인          "좋아, lock 해줘"
         ↓
4. Director가 이슈 자동 생성   GitHub에 Epic → Story → Sub-task
         ↓
5. 사용자가 실행 허가          "시작해"
         ↓
6. Worker 에이전트들이 작업    각자 코드 생성 → 리뷰 → 완료
```

### 9.2 CLI 명령어

`agent>` 프롬프트 또는 대시보드 커맨드 바에서:

| 명령어 | 설명 |
|--------|------|
| (자연어) | Director에게 작업 요청 |
| `/status` | 전체 에이전트 상태 조회 |
| `/pause` | 전체 시스템 일시정지 |
| `/resume` | 전체 시스템 재개 |
| `/pause @frontend` | 특정 에이전트 일시정지 |
| `/resume @frontend` | 특정 에이전트 재개 |
| `/retry <task-id>` | 실패한 태스크 재시도 |

### 9.3 Director와 효과적으로 대화하기

- **구체적으로**: "Jira 만들어줘" 보다 "에이전트가 API로 폴링하는 태스크 관리 시스템" 처럼 핵심 동작 설명
- **기술 스택 미리 정하기**: "FastAPI + React + PostgreSQL" 처럼 명시하면 빠름
- **MVP 경계 명확히**: 포함/제외 기능 구분하면 Director가 스코프를 정확히 잡음
- **빠른 진행**: 요구사항이 충분하면 "lock하고 태스크 분해해줘"로 빠르게 통과

### 9.4 대시보드

Stardew Valley 스타일 오피스에서 에이전트들이 실시간으로 작업합니다:

- 에이전트 클릭 → 상세 패널 (상태, 토큰, 태스크 목록)
- 하단 커맨드 바 → 자연어 입력 또는 슬래시 명령어
- 오른쪽 사이드바 → ACTIVITY / TOKENS / STATS 탭

---

## 10. 트러블슈팅

### git clone/push 실패

```
fatal: Authentication failed
```

**해결**: gh 인증을 다시 설정합니다.

```bash
gh auth login          # 재로그인
gh auth setup-git      # credential helper 재등록
git ls-remote https://github.com/OWNER/REPO.git HEAD   # 확인
```

### DB 연결 실패

```
Connection refused (localhost:5433)
```

**해결**: Docker가 실행 중인지 확인합니다.

```bash
docker compose ps          # 컨테이너 상태 확인
docker compose up -d       # 재시작
```

### LLM API 에러

```
AuthenticationError: Invalid API key
```

**해결**: `backend/.env`의 API 키를 확인합니다.

```bash
# Anthropic API 키 테스트
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"ping"}]}'
```

### GitHub Project Board 이슈

```
Could not resolve to a ProjectV2
```

**해결**: `.env`의 `GITHUB_PROJECT_NUMBER`가 올바른지 확인하고, 토큰에 `project` 권한이 있는지 확인합니다.

```bash
# 프로젝트 목록 확인
gh project list --owner OWNER
```

### 포트 충돌

```
Address already in use (port 3001)
```

**해결**: 기존 프로세스를 종료하거나 `.env`에서 `DASHBOARD_PORT`를 변경합니다.

```bash
# 포트 사용 프로세스 확인 (Linux/Mac)
lsof -i :3001

# Windows
netstat -ano | findstr :3001
```

---

## 전체 체크리스트

설정이 완료되면 아래 항목을 모두 확인하세요:

```
[ ] gh auth status — 로그인 상태
[ ] gh auth setup-git — credential helper 등록
[ ] git ls-remote — 대상 repo 접근 가능
[ ] docker compose ps — PostgreSQL 실행 중
[ ] uv run alembic upgrade head — 마이그레이션 완료
[ ] backend/.env — 필수 환경 변수 설정
[ ] uv run pytest — 테스트 통과
[ ] uv run python -m src.main — 서버 시작
[ ] pnpm dev — 대시보드 접속 가능
```
