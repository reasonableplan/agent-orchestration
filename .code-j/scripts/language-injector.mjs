#!/usr/bin/env node

/**
 * UserPromptSubmit hook — reads .code-j/config.json language setting
 * and injects a language directive into the agent context.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LANGUAGE_MAP = {
  ko: 'Korean (한국어)',
  en: 'English',
  ja: 'Japanese (日本語)',
  zh: 'Chinese (中文)',
};

async function main() {
  const configPath = join(process.cwd(), '.code-j', 'config.json');

  let language = 'ko'; // default
  try {
    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);
    if (config.language) {
      language = config.language;
    }
  } catch {
    // config.json not found or invalid — use default
  }

  const langName = LANGUAGE_MAP[language] || language;

  process.stdout.write(JSON.stringify({
    role: 'system-reminder',
    content: `[code-J] Respond in ${langName}. Use ${langName} for all explanations, comments, and communication. Code identifiers and technical terms may remain in English.`
  }));
}

main().catch(() => {
  // Silent failure — language injection is non-critical
  process.stdout.write('');
});
