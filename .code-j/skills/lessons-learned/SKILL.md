---
name: lessons-learned
description: Display past mistakes and lessons from the lessons/ directory
---

<Purpose>
Show lessons learned from past coding mistakes. Each lesson records what went wrong, why, and the rule to follow.
Use this to review patterns before starting work on similar code.
</Purpose>

<Use_When>
- Want to check past mistakes: "/lessons-learned", "what lessons do we have?"
- Before working on a specific area: "/lessons-learned async", "/lessons-learned security"
- Learning review session
</Use_When>

<Steps>
1. **Parse filter**: If keyword provided, filter lessons by category/content. Otherwise show all.
2. **Read lessons**: Read all `.md` files from `.code-j/lessons/` directory.
3. **Display**: Show lessons grouped by category with severity.

### If keyword provided
- Search lesson filenames and content for the keyword
- Show only matching lessons with highlighted matches

### If no keyword
- Show a summary table: category, lesson count, highest severity per category
- Then list all lessons with their titles and one-line summaries

### Output format
```
## Lessons Learned [filter]

| Category | Lessons | Highest Severity |
|----------|---------|-----------------|
| async-lifecycle | 3 | CRITICAL |
| security | 4 | CRITICAL |
| ... | ... | ... |

### [Category]: [Lesson Title]
- **Severity**: [CRITICAL/HIGH/MEDIUM/LOW]
- **Rule**: [One-line rule to follow]
- **What happened**: [Brief description of the mistake]

---
Total: N lessons across M categories
Use `/update-lessons` to record a new lesson.
```
</Steps>
