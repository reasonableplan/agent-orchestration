---
name: review
description: Review code using this project's specific conventions and patterns
---

<Purpose>
Run a project-convention-aware code review on current changes or specified files.
Every issue explains WHY it matters — the review itself is a learning opportunity.
</Purpose>

<Use_When>
- Code review request: "/review", "review this code", "check my changes"
- PR review
- Review specific files or directories
</Use_When>

<Steps>
1. **Identify target**: If args provided, review those files/directories. Otherwise, review `git diff HEAD` (staged + unstaged changes).
2. **Run reviewer agent**: Launch `Agent(subagent_type="code-j:reviewer")` with the target code.
   - The reviewer checks: security, logic, error handling, project rules (Board-first, async safety, withRetry), performance, patterns.
3. **Extract lessons**: If any MEDIUM+ severity issues found, suggest recording them with `/update-lessons`.
4. **Display results**: Issue list with severity + learning points + verdict.

### Output format
```
## Code Review: [target]

### Issues (N total: X critical, Y high, Z medium, W low)

**[CRITICAL] Issue title** — `file:line`
- **Problem**: What's wrong
- **Why it matters**: Consequence if not fixed
- **Fix**: Concrete code suggestion
- **Learn more**: One-sentence principle

### Positive Observations
- [good patterns to reinforce]

### Verdict: APPROVE / REQUEST CHANGES / COMMENT
```
</Steps>
