#!/usr/bin/env node

/**
 * SessionStart hook — loads lesson summaries from .code-j/lessons/
 * and injects critical/high lessons into the session context.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LESSONS_DIR = join(process.cwd(), '.code-j', 'lessons');

async function main() {
  let lessonCount = 0;
  const criticalLessons = [];

  try {
    const files = await readdir(LESSONS_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    for (const file of mdFiles) {
      const content = await readFile(join(LESSONS_DIR, file), 'utf-8');

      // Count lessons: format is "## N. Title"
      const matches = content.match(/^## \d+\./gm);
      if (matches) lessonCount += matches.length;

      // Also count frontmatter lesson_count as fallback
      const countMatch = content.match(/lesson_count:\s*(\d+)/);
      if (!matches && countMatch) {
        lessonCount += parseInt(countMatch[1], 10);
      }

      // Extract lesson titles for critical keywords
      const lines = content.split('\n');
      for (const line of lines) {
        if (/^## \d+\./.test(line)) {
          // Check for security/critical keywords in lesson title
          if (/인젝션|토큰|노출|시크릿|보안|race|cleanup|drain/i.test(line)) {
            criticalLessons.push(line.replace('## ', '').trim());
          }
        }
      }
    }
  } catch {
    // lessons directory missing — skip
  }

  const output = { role: 'system-reminder' };

  if (lessonCount === 0) {
    output.content = '[code-J] No lessons recorded yet. Use /lessons-learned to review and /update-lessons to record.';
  } else {
    let msg = `[code-J] ${lessonCount} lessons loaded.`;
    if (criticalLessons.length > 0) {
      msg += ` Watch for: ${criticalLessons.slice(0, 5).join(', ')}`;
    }
    output.content = msg;
  }

  process.stdout.write(JSON.stringify(output));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({
    role: 'system-reminder',
    content: '[code-J] Lessons loader skipped.'
  }));
});
