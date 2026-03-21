# code-J

A Claude Code plugin for senior-level coding assistance. Learn by doing, never repeat mistakes.

## Features

### Agents (7)
| Agent | Purpose | Model |
|-------|---------|-------|
| `coder` | Production-ready code generation with test-first approach | Sonnet |
| `reviewer` | Learning-oriented code review with severity ratings | Opus |
| `debugger` | Root-cause analysis with reproduce-first methodology | Sonnet |
| `refactor` | Behavior-preserving code simplification | Sonnet |
| `architect` | Architecture analysis and design guidance (read-only) | Opus |
| `test-engineer` | TDD enforcer and test strategy specialist | Sonnet |
| `lessons` | Mistake pattern tracker and prevention | Sonnet |

### Skills (8 Slash Commands)
| Command | Description |
|---------|-------------|
| `/spec [keyword]` | Quick reference to project documentation by keyword |
| `/review [file]` | Run code review on changes or specific files |
| `/lessons-learned [keyword]` | Display past mistakes and lessons |
| `/update-lessons` | Record a new lesson from a mistake |
| `/explain-diff [commit]` | Explain code changes for learning |
| `/impact [symbol]` | Change impact analysis before modifying code |
| `/plan [feature]` | Implementation planning before coding |
| `/test [target]` | TDD workflow — failing test first |

### MCP Tools
| Tool | Description |
|------|-------------|
| `lessons_search` | Search lessons database by keyword |
| `lessons_add` | Add a new lesson to the database |
| `impact_analyze` | Find all references to a symbol for change impact |

### Hooks
| Event | Script | Purpose |
|-------|--------|---------|
| UserPromptSubmit | `language-injector.mjs` | Injects language directive from config |
| SessionStart | `session-start.mjs` | Loads lesson summaries into context |
| PreToolUse(Bash) | `pre-bash-guard.mjs` | Warns on dangerous commands |
| PostToolUse(Write/Edit) | `post-write-check.mjs` | Detects common mistake patterns |

### Lessons Database
The `lessons/` directory stores categorized lessons from past mistakes. Categories are created automatically — use `/update-lessons` to add entries and `/lessons-learned` to review them.

## Configuration

Edit `config.json` to set your preferred language:
```json
{
  "language": "ko"
}
```

Supported: `ko` (Korean), `en` (English), `ja` (Japanese), `zh` (Chinese).

## Installation

Copy the `.code-j/` directory into any project root. Claude Code automatically detects it via the `.claude-plugin/plugin.json` manifest.

The plugin adapts to each project by reading `CLAUDE.md` for project-specific rules and conventions. Lessons in `lessons/` can be project-specific or shared across projects.
