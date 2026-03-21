#!/usr/bin/env node

/**
 * PreToolUse(Bash) hook — detects dangerous commands and warns via system-reminder.
 */

const input = JSON.parse(process.argv[2] || '{}');
const command = input.tool_input?.command || '';

const DANGEROUS_PATTERNS = [
  { pattern: /rm\s+-rf\s+[\/~]/, message: 'rm -rf on root/home directory' },
  { pattern: /git\s+push\s+--force\s/, message: 'git force push — may overwrite remote history' },
  { pattern: /git\s+push\s+-f\s/, message: 'git force push — may overwrite remote history' },
  { pattern: /git\s+reset\s+--hard/, message: 'git reset --hard — discards uncommitted changes' },
  { pattern: /git\s+checkout\s+--?\s+\./, message: 'git checkout -- . — discards all local changes' },
  { pattern: /git\s+clean\s+-f/, message: 'git clean -f — permanently deletes untracked files' },
  { pattern: /drop\s+table/i, message: 'DROP TABLE — permanent data loss' },
  { pattern: /drop\s+database/i, message: 'DROP DATABASE — permanent data loss' },
  { pattern: /truncate\s+table/i, message: 'TRUNCATE TABLE — permanent data loss' },
  { pattern: /--no-verify/, message: '--no-verify — skipping pre-commit hooks' },
];

const warnings = DANGEROUS_PATTERNS
  .filter(({ pattern }) => pattern.test(command))
  .map(({ message }) => message);

if (warnings.length > 0) {
  process.stdout.write(JSON.stringify({
    role: 'system-reminder',
    content: `[code-J] Dangerous command detected: ${warnings.join('; ')}. Confirm with user before proceeding.`
  }));
} else {
  process.stdout.write('');
}
