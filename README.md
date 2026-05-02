# HarnessAI

🌐 **English** · [한국어](README.ko.md)

![tests](https://img.shields.io/badge/tests-420%20passing-brightgreen)
![pyright](https://img.shields.io/badge/pyright-0%20errors-brightgreen)
![ruff](https://img.shields.io/badge/ruff-clean-brightgreen)
![gate coverage](https://img.shields.io/badge/gate%20coverage-100%25-brightgreen)
![python](https://img.shields.io/badge/python-3.12-blue)
![license](https://img.shields.io/badge/license-MIT-blue)

> *Make AI agents write code — but force them to follow **your** rules.*

Claude / Cursor / Copilot will write working code, but they don't write it **your way**. They ignore your `CLAUDE.md`. They import libraries you didn't allow. Their error handling doesn't match the rest of your codebase. Fixing it by hand defeats the point.

HarnessAI closes that loop:

1. **A contract** (`skeleton.md` with 30 standard section IDs, **auto-selected by 6-axis project answers**) declares what will be built before any code exists.
2. **Seven agents** (Architect · Designer · Orchestrator · Backend/Frontend Coder · Reviewer · QA) implement the declaration.
3. **Nine quality gates** automatically block contract violations — 6 security hooks + ai-slop detection + test distribution + skeleton-integrity.

HarnessAI doesn't replace the AI. It **controls** it.

---

## 🎯 What it actually catches

Plain Claude writes this — tests pass, lint passes, code runs:

```python
_BACKOFF_SECONDS = (1.0, 2.0, 4.0, 8.0)   # declares 4 backoff steps
max_retries = 2
for i in range(max_retries):              # but only consumes 2
    time.sleep(_BACKOFF_SECONDS[i])
```

The constant declares 4 elements; the loop reads 2. Dead code that no test catches because the program runs fine. This is real — [LESSON-018](docs/benchmarks/dogfooding-catches.md) from this repo's own dogfooding log.

`/ha-review` flags it via the `ai-slop` hook (the 7th gate):

```json
{
  "hook": "ai-slop",
  "severity": "WARN",
  "message": "dead 상수 의심 (LESSON-018) — 상수 정의 범위 vs 실제 사용 범위 확인",
  "snippet": "_BACKOFF_SECONDS = (1.0, 2.0, 4.0, 8.0)\n+max_retries = 2"
}
```

This is the kind of error LLMs reliably introduce and humans miss in review. Across **35 fixture cases**, the 9 gates score **precision 100% / recall 100%** — see [gate-coverage.md](docs/benchmarks/gate-coverage.md).

---

## 🎯 What it actually adapts

Same `python-cli` profile, two interview answers — different skeleton.

**Baseline — `data_sensitivity=none / lifecycle=poc / availability=casual` → 13 sections**

```
overview · stack · errors · interface.cli · core.logic ·
configuration · persistence · data_model · external_deps ·
integrations · requirements · tasks · notes
```

**Bumped — `data_sensitivity=pii / lifecycle=mvp / availability=standard` → 18 sections** (baseline 13 **+** these 5):

| + Section        | `required_when` rule                                                | Why this answer triggered it                  |
|------------------|---------------------------------------------------------------------|------------------------------------------------|
| `audit_log`      | `data_sensitivity in [pii, payment]`                                 | sensitive data → compliance log                |
| `threat_model`   | `data_sensitivity in [pii, payment] or availability == high`         | sensitive data → STRIDE/OWASP                  |
| `ci_cd`          | `lifecycle in [mvp, ga]`                                             | mvp+ → pipeline / rollback                     |
| `test_strategy`  | `lifecycle in [mvp, ga]`                                             | mvp+ → test pyramid / contract test            |
| `slo`            | `user_scale in [medium, large] or availability in [standard, high]`  | even "standard" availability → p50/p95/p99 budgets |

The 6 axes (`user_scale` / `data_sensitivity` / `team_size` / `availability` / `monetization` / `lifecycle`) are captured by `/ha-init`. Each fragment's expression is parsed by [`scale_expression.py`](backend/src/orchestrator/scale_expression.py), evaluated against the axes, and `ProfileLoader.compute_active_sections` returns the section list. The rules live in `harness/templates/skeleton/*.md` frontmatter — full transparency, change them and the loader picks it up.

**Reproduce** (from a fresh clone, no agent calls):

```bash
cd backend && uv run python ../scripts/show_adapt_diff.py
# A  pii + mvp + standard  ->  18 sections
# B  none + poc + casual   ->  13 sections
# diff (A only)            ->  ['audit_log', 'ci_cd', 'slo', 'test_strategy', 'threat_model']
```

---

## 🚀 30-second usage

```bash
git clone https://github.com/reasonableplan/harnessai.git
cd harnessai
./install.sh                          # Windows: .\install.ps1
export HARNESS_AI_HOME="$(pwd)"       # the installer prints this line
```

In a fresh Claude Code session:

```
/ha-init     # detect stack + interview → harness-plan.md + skeleton.md
/ha-design   # Architect + Designer fill skeleton sections
/ha-plan     # Orchestrator decomposes into tasks.md
/ha-build T-001          # implement one task [sonnet]
/ha-verify   # run toolchain + skeleton integrity gate [sonnet]
/ha-review   # security hooks + LESSONs + ai-slop + test distribution
```

> Deep dive: [ARCHITECTURE.md](docs/ARCHITECTURE.md) · [SETUP.md](SETUP.md)

---

## 🏗 Pipeline

```
               ┌─ profile detection (~/.claude/harness/profiles/) ┐
               │                                                  │
  /ha-init ───▶│ harness-plan.md  +  skeleton.md (empty template) │
               └──────────────────────────┬───────────────────────┘
                                          ▼
  /ha-design ─────▶ Architect + Designer (up to 3 negotiation rounds) ─▶ fills skeleton
                                          ▼
  /ha-plan   ─────▶ Orchestrator ─▶ tasks.md (dependency graph)
                                          ▼
  /ha-build  ─────▶ Backend/Frontend Coder ─▶ source files
    │                                 [--parallel T-001,T-002  ← ultrawork]
    ▼
  /ha-verify ─────▶ [1] harness integrity (skeleton ↔ real FS)
                    [2] profile toolchain (pytest / ruff / pyright)
                                          ▼
  /ha-review ─────▶ Security hooks × 6 + LESSONs × 21 + ai-slop × 7 + test distribution
                                          ▼
                               APPROVE / REJECT → /ship
```

Each stage can chain with gstack skills (`/office-hours`, `/plan-eng-review`, `/review`, `/qa`, `/ship`, `/retro`).

---

## 🎯 Core ideas

### 1. Profiles — declare rules per stack

A single file under `~/.claude/harness/profiles/<stack>.md` holds every rule for that stack:
- **Detection rules** (which files indicate this stack)
- **Components** (required / optional)
- **skeleton_sections** (which sections must be filled)
- **toolchain** (test / lint / type commands)
- **whitelist** (allowed dependencies)
- **lessons_applied** (which LESSONs enforce here)

Five profiles ship by default: `fastapi`, `react-vite`, `python-cli`, `python-lib`, `claude-skill`. Adding a new stack is one file.

### 2. Skeleton — the project contract

Thirty standard section IDs; profiles pick which ones apply, and **6-axis user answers** further narrow to project-fit sections:

```
overview · requirements · stack · configuration · errors · auth ·
persistence · integrations · interface.{http,cli,ipc,sdk} ·
view.{screens,components} · state.flow · core.logic ·
observability · deployment · tasks · notes ·
data_model · threat_model · audit_log · slo · runbook ·
test_strategy · user_journey · authorization_matrix · ci_cd · external_deps
```

The last 10 (data_model … external_deps) are activated by `required_when` expressions evaluated against the 6 axes — see [What it actually adapts](#-what-it-actually-adapts) below.

The section content **is the contract**. `/ha-verify` checks that declared filesystem paths actually exist, and that placeholders (`<pkg>`, `<cmd_a>`) were replaced.

### 3. Shared Lessons — institutional memory

`backend/docs/shared-lessons.md` stores 21 past mistakes. Every bug that was ever made gets a LESSON entry. Future `/ha-review` sessions read those entries so the same class of mistake never repeats.

Examples:
- **LESSON-001** — FastAPI query params must be snake_case
- **LESSON-018** — Constant definition length vs. actual consumption (dead-constant detection)
- **LESSON-020** — `[N/M]` progress indicators must actually update (no cosmetic fakes)
- **LESSON-021** — A task is `done` only after test + lint + **type** all pass

LESSONs are enforced in three ways: text reference (Reviewer agent reads them), regex auto-detection (LESSON-018 via ai-slop patterns), and hard gates (LESSON-013 via test-distribution, LESSON-021 via toolchain-gate).

---

## 🆚 Comparison

| | HarnessAI | Cursor / Copilot | Claude Code (plain) | aider |
|---|---|---|---|---|
| Scope | Whole project | File / function | Conversation-based | Diff-based |
| Rule enforcement | **Profiles + 9 gates** | `.cursorrules` (advisory) | `CLAUDE.md` (advisory) | Commit style only |
| Mistake accumulation | **21 LESSONs** (auto-detect + reviewer context) | ❌ | ❌ | ❌ |
| Stack auto-detection | **5 built-in + extensible** | ❌ | ❌ | ❌ |
| Parallel implementation | **`/ha-build --parallel`** | ❌ | ❌ | ❌ |
| Design-implementation contract | **`skeleton.md` + integrity gate** | ❌ | ❌ | ❌ |

**Where HarnessAI fits**: multiple small-to-medium projects built to the same quality bar, where you want the system to remember mistakes so you don't have to.

**Where it doesn't**: one-off scripts, exploratory prototypes, large legacy codebases (use `/ha-deepinit` first).

---

## 📦 Installation

```bash
# Unix / WSL / macOS / Git Bash
./install.sh

# Windows PowerShell
.\install.ps1
```

What it does:
- Copies `harness/` + `skills/ha-*` + `skills/_ha_shared` → `~/.claude/`
- Records SHA256 in `~/.claude/harness/.install-manifest.json` (diff detection on re-runs)
- Supports `--force` / `--dry-run`
- `CLAUDE_HOME=/custom/path ./install.sh` for a custom target

**Env var**: set `HARNESS_AI_HOME` to the absolute path of this repo after install. The installer prints the exact command.

---

## 🧪 Quality gates (9)

| Gate | Location | Role |
|---|---|---|
| profile whitelist | `security_hooks.py` | Block non-whitelisted dependencies |
| path traversal | ` " ` | Block `../` upward references |
| secret leak | ` " ` | Detect hardcoded tokens / keys |
| CLI arg secret | ` " ` | Forbid passing secrets via CLI args |
| SQL injection | ` " ` | Block raw SQL concatenation |
| XML delimiter | ` " ` | Enforce separation of user input in agent prompts |
| **ai-slop** (7th hook) | `ha-review/run.py` | 7 regex patterns — verbose docstrings, cosmetic try/except, dead constants (LESSON-018), TODO/FIXME, unused funcs, stub `pass` |
| **test distribution** | ` " ` | Detect skewed test coverage (BLOCK: 0 tests for a src module, WARN: 10x variance) |
| **skeleton integrity** | `harness integrity` | Declared paths ↔ real filesystem + placeholder residue |

---

## 🎭 Agents

| Role | Responsibility |
|---|---|
| Architect | DB / API / auth / state-flow design in skeleton |
| Designer | UI / UX / component tree / state management design |
| Orchestrator | Task decomposition, dependency graph, phase management |
| Backend Coder | Python / FastAPI / CLI implementation |
| Frontend Coder | React / TS implementation |
| Reviewer | Security + LESSON + convention review |
| QA | Integration test scenario verification |

Each agent's rules live in `backend/agents/<role>/CLAUDE.md` — editable.

---

## ⚠️ Current limitations

- **Windows-first testing** — Linux / macOS designs are in place but CI matrix is not yet green on all OSes
- **No LLM auto-learning yet** — new LESSONs are added manually (auto-learning is on the roadmap)
- **Second E2E underway** — first (code-hijack, python-cli) completed; second (fastapi + react-vite monorepo) phase 1 done, phase 2 in progress
- **gstack coupling** — some gates assume gstack skills are available (standalone execution works, but full power requires gstack)

---

## 🗺 Roadmap

**Phase 1–4 (completed)**: profile system · 7 `/ha-*` skills · 21 LESSONs · 9 quality gates · single-command install · `/my-*` legacy skills removed · v1 legacy code (SECTION_MAP / extract_section / fill_skeleton_template) removed · Orchestra v2 wiring

**Phase 5 (planned)**:
- Live LESSONS auto-learning (ha-review repeated pattern → LESSON candidate)
- Additional profiles (next.js, electron, react-native)
- Multi-provider (Gemini / OpenAI backend)
- Cost tracking (per-agent token / USD accumulation)
- Claude Code plugin manifest distribution

---

## 🧱 Tech stack

- **Language**: Python 3.12
- **Server**: FastAPI + WebSocket (port 3002)
- **Package manager**: uv
- **Agent execution**: Claude CLI subprocess (swappable — Gemini / local LLM)
- **State**: `docs/harness-plan.md` (YAML frontmatter) + `.orchestra/` JSON (no DB)
- **Tests**: **420** backend pytest + **12** install-snapshot assertions (0 regressions)
- **Type check**: pyright **0 errors** on `src/`
- **Gate coverage** (self-test): 7 of the 9 gates measured on 35 fixtures (positive / negative) → **precision 100% / recall 100% / accuracy 100%**. The other 2 (test-distribution, skeleton-integrity) are covered by filesystem-level pytest fixtures. Details: [gate-coverage.md](docs/benchmarks/gate-coverage.md)
- **Latency** (30-iter median, no LLM calls): profile detect **~5 ms**, skeleton assemble **<1 ms**, `harness validate` **~150 ms**, `harness integrity` **~104 ms**. Details: [benchmarks/](docs/benchmarks/)
- **v2 infrastructure**: `profile_loader`, `skeleton_assembler`, `plan_manager`, `harness` validation CLI

---

## 📂 Directory layout

```
harness/              Profile / template / CLI sources ─┐
skills/               ha-* skills + _ha_shared         ├─ install.sh → ~/.claude/
install.sh/ps1        Install + manifest               ─┘

backend/
  agents/<role>/CLAUDE.md     7 agent system prompts (editable)
  agents.yaml                 provider / model / timeout
  docs/shared-lessons.md      21 LESSONs
  src/orchestrator/           profile_loader / skeleton_assembler /
                              plan_manager / security_hooks / runner
  tests/                      420 pytest + skills/ regression guards

docs/
  ARCHITECTURE.md             System structure — read this first
  decisions/                  ADRs (five so far)
  benchmarks/                 Latency + gate coverage + dogfooding catches
  e2e-reports/                Dogfooding evidence
```

---

## 🛠 Development

```bash
cd backend
uv sync
uv run pytest tests/ --rootdir=.      # 420 tests
uv run ruff check src/                 # 0 errors
uv run pyright src/                    # 0 errors
uv run python -m src.main              # dashboard server (port 3002)
```

Install-script regression test:
```bash
./tests/install/test_install_snapshot.sh   # 12 assertions
```

Harness schema validation:
```bash
python harness/bin/harness validate                 # 37 files, 0 errors
python harness/bin/harness integrity --project .    # skeleton ↔ FS integrity
```

Gate coverage benchmark:
```bash
python scripts/gate_benchmark.py   # 35 fixtures, exits 1 on any miss / false alarm
```

---

## 📚 Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System structure · profiles · skeleton · gates (**read first**) |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records (5 ADRs) |
| [docs/e2e-reports/](docs/e2e-reports/) | E2E reports — dogfooding evidence (code-hijack completed, ui-assistant in progress) |
| [docs/benchmarks/](docs/benchmarks/) | Performance benchmarks + **gate coverage** (35 fixtures, 100%) + LESSON↔gate dogfooding tracing |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Profile / LESSON / gate / skill contribution guide |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [SETUP.md](SETUP.md) | End-to-end install + run guide |
| [TODOS.md](TODOS.md) | Planned improvements |
| [backend/docs/shared-lessons.md](backend/docs/shared-lessons.md) | 21 past-mistake patterns |
| [CLAUDE.md](CLAUDE.md) | Implementation rules (senior-production bar) |
| [SECURITY.md](SECURITY.md) | Vulnerability disclosure |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community conduct |
| [docs/harness-v2-design.md](docs/harness-v2-design.md) | v2 redesign worklog (Korean-only, developer reference) |

---

## License

MIT — see [LICENSE](LICENSE).
