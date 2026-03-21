---
name: update-lessons
description: Record a new lesson from a mistake or discovery
---

<Purpose>
Add a new lesson entry to the appropriate file in `.code-j/lessons/`.
Lessons capture what went wrong, why, and the rule to prevent recurrence.
</Purpose>

<Use_When>
- After finding a bug: "/update-lessons"
- After code review found issues: "record this as a lesson"
- Proactively recording a pattern: "/update-lessons security"
</Use_When>

<Steps>
1. **Gather info**: Ask the user (or extract from context) what the lesson is about:
   - What went wrong?
   - Why did it happen?
   - What's the rule to prevent it?
   - Severity (CRITICAL / HIGH / MEDIUM / LOW)

2. **Determine category**: Check existing files in `.code-j/lessons/` and pick the best match.
   - If no existing category fits, create a new one with a descriptive kebab-case name (e.g., `api-integration.md`).
   - Use `ls .code-j/lessons/` to discover available categories.

3. **Generate lesson number**: Read ALL lesson files in `.code-j/lessons/`, find the highest `## N.` number across all files, increment by 1.

4. **Append lesson**: Add to the appropriate category file using this format:
   ```
   ## [N]. [Title]
   - **실수**: [What went wrong]
   - **결과**: [What bad thing happened or could happen]
   - **규칙**: [Rule to prevent recurrence]
   ```

5. **Update frontmatter**: Increment the `lesson_count` in the file's YAML frontmatter.

6. **Confirm**: Show what was added and where.

### Output format
```
## Lesson Recorded

**File**: `.code-j/lessons/[category].md`
**Number**: [N]
**Title**: [title]

The lesson has been added. Use `/lessons-learned [category]` to review.
```
</Steps>
