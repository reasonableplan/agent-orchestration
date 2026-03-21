#!/usr/bin/env node

/**
 * PostToolUse(Write/Edit) hook — detects common mistake patterns in written code.
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const input = JSON.parse(process.argv[2] || '{}');
const filePath = input.tool_input?.file_path || '';

const CODE_EXTENSIONS = new Set([
  '.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.java', '.go', '.rs', '.rb', '.php', '.swift', '.kt',
]);

const ext = extname(filePath).toLowerCase();
if (!CODE_EXTENSIONS.has(ext)) {
  process.exit(0);
}

const PATTERNS = {
  common: [
    { regex: /catch\s*\([^)]*\)\s*\{\s*\}/, message: 'Empty catch block — at minimum log the error', severity: 'HIGH' },
    { regex: /password\s*=\s*["'][^"']+["']/, message: 'Possible hardcoded password', severity: 'CRITICAL' },
    { regex: /api[_-]?key\s*=\s*["'][^"']+["']/i, message: 'Possible hardcoded API key', severity: 'CRITICAL' },
    { regex: /secret\s*=\s*["'][^"']+["']/i, message: 'Possible hardcoded secret', severity: 'CRITICAL' },
  ],
  python: [
    { regex: /except:\s*$/, message: 'Bare except — catches SystemExit/KeyboardInterrupt too', severity: 'HIGH' },
    { regex: /except\s+Exception\s*:\s*\n\s*pass/, message: 'except Exception: pass — silently swallowing all errors', severity: 'HIGH' },
    { regex: /\.format\(.*\).*(?:SELECT|INSERT|UPDATE|DELETE)/i, message: 'String format in SQL query — use parameterized queries', severity: 'CRITICAL' },
    { regex: /f["'].*(?:SELECT|INSERT|UPDATE|DELETE)/i, message: 'f-string in SQL query — use parameterized queries', severity: 'CRITICAL' },
  ],
  javascript: [
    { regex: /eval\s*\(/, message: 'eval() is a security risk', severity: 'CRITICAL' },
    { regex: /innerHTML\s*=/, message: 'innerHTML assignment — XSS risk, use textContent', severity: 'HIGH' },
  ],
};

async function main() {
  let content;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    process.exit(0);
  }

  const issues = [];

  for (const { regex, message, severity } of PATTERNS.common) {
    if (regex.test(content)) {
      issues.push({ message, severity });
    }
  }

  const langPatterns = ext === '.py' ? PATTERNS.python
    : ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext) ? PATTERNS.javascript
    : [];

  for (const { regex, message, severity } of langPatterns) {
    if (regex.test(content)) {
      issues.push({ message, severity });
    }
  }

  const significant = issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');

  if (significant.length > 0) {
    const summary = significant
      .map(i => `[${i.severity}] ${i.message}`)
      .join('; ');

    process.stdout.write(JSON.stringify({
      role: 'system-reminder',
      content: `[code-J] Pattern check on ${filePath}: ${summary}. Review and fix if applicable.`
    }));
  }
}

main().catch(() => process.exit(0));
