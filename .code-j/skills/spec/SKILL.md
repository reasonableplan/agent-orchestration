---
name: spec
description: Quick reference to project documentation — find architecture, schema, API, or design docs by keyword
---

<Purpose>
Look up specific sections of the project's documentation by keyword.
Auto-discovers docs from common locations: docs/, README.md, CLAUDE.md, ARCHITECTURE.md, DESIGN.md, etc.
</Purpose>

<Use_When>
- Need to check project documentation: "/spec schema", "/spec auth", "/spec API"
- Verify correct types, interfaces, or protocols
- Understand project architecture or design decisions
</Use_When>

<Steps>
1. **Discover docs**: Search for documentation files in the project:
   - `docs/**/*.md`
   - `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `DESIGN.md`, `CONTRIBUTING.md`
   - `*.md` in project root
   - `ADR/` or `adr/` (Architecture Decision Records)

2. **Parse keyword**: Extract the search keyword from user input (e.g., "/spec auth" -> "auth")

3. **Search docs**: Grep for the keyword across discovered documentation files

4. **Display results**: Show matching sections with surrounding context

### If no keyword provided
Show a summary of available documentation:
- List all discovered doc files with their top-level headings

### Search strategy
- First try heading match (## or ### containing the keyword)
- Then try content search within sections
- Show the full section (heading to next heading of same level)

### Output format
```
## Docs: [keyword]

[matching section content]

---
Source: [file path], line [N]
```
</Steps>
