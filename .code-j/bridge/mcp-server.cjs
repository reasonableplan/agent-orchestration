#!/usr/bin/env node

/**
 * code-J MCP Server — lessons/impact tools via stdin/stdout JSON-RPC 2.0.
 * No external dependencies — Node.js built-in modules only.
 */

'use strict';

const { readdir, readFile, writeFile, mkdir } = require('node:fs/promises');
const { join, resolve, extname } = require('node:path');
const { execFile } = require('node:child_process');
const { existsSync } = require('node:fs');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

// ── MCP Protocol Layer ──────────────────────────────────────────────

let buffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk]);
  processBuffer();
});

process.stdin.on('end', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

function processBuffer() {
  while (true) {
    const headerEndIdx = buffer.indexOf('\r\n\r\n');
    if (headerEndIdx === -1) return;

    const headerStr = buffer.slice(0, headerEndIdx).toString('utf-8');
    const match = headerStr.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEndIdx + 4);
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEndIdx + 4;
    if (buffer.length < bodyStart + contentLength) return;

    const body = buffer.slice(bodyStart, bodyStart + contentLength).toString('utf-8');
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const message = JSON.parse(body);
      handleMessage(message).catch((err) => {
        sendError(message.id, -32603, err.message);
      });
    } catch (e) {
      process.stderr.write(`[code-j] Malformed JSON: ${e.message}\n`);
    }
  }
}

function sendResponse(id, result) {
  const body = JSON.stringify({ jsonrpc: '2.0', id, result });
  const msg = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n${body}`;
  process.stdout.write(msg);
}

function sendError(id, code, message) {
  const body = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  const msg = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n${body}`;
  process.stdout.write(msg);
}

async function handleMessage(message) {
  const { method, id } = message;

  switch (method) {
    case 'initialize':
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'code-j', version: '1.0.0' },
      });
      break;

    case 'notifications/initialized':
      break;

    case 'tools/list':
      sendResponse(id, { tools: TOOL_DEFINITIONS });
      break;

    case 'tools/call':
      await handleToolCall(id, message.params);
      break;

    default:
      if (id !== undefined) {
        sendError(id, -32601, `Unknown method: ${method}`);
      }
  }
}

// ── Tool Definitions ────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'lessons_search',
    description: 'Search the lessons database by keyword. Finds past mistake patterns and fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword (e.g., "async", "error handling", "SQL injection")' },
        category: { type: 'string', description: 'Category filter (e.g., "security", "async-lifecycle")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'lessons_add',
    description: 'Add a new lesson to the database. Records a mistake pattern discovered during review or debugging.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category file name (e.g., "security", "async-lifecycle", "error-handling")' },
        title: { type: 'string', description: 'Lesson title' },
        mistake: { type: 'string', description: 'What went wrong' },
        consequence: { type: 'string', description: 'What bad thing happened or could happen' },
        rule: { type: 'string', description: 'Rule to prevent recurrence' },
      },
      required: ['category', 'title', 'mistake', 'rule'],
    },
  },
  {
    name: 'impact_analyze',
    description: 'Find all references to a symbol (function, class, type) to analyze change impact.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to search for' },
        path: { type: 'string', description: 'Search directory (default: current directory)' },
        file_types: { type: 'string', description: 'File extension filter, comma-separated (e.g., "py,ts,js")' },
      },
      required: ['symbol'],
    },
  },
];

// ── Input Sanitization ──────────────────────────────────────────────

function sanitizeCategory(category) {
  const safe = category.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new Error('Invalid category name: must contain alphanumeric, dash, or underscore');
  return safe;
}

function assertWithinDir(filePath, baseDir) {
  const resolved = resolve(filePath);
  const base = resolve(baseDir);
  if (!resolved.startsWith(base + require('node:path').sep) && resolved !== base) {
    throw new Error(`Path traversal blocked: ${filePath} is outside ${baseDir}`);
  }
}

// ── Tool Handlers ───────────────────────────────────────────────────

async function handleToolCall(id, params) {
  const { name, arguments: args } = params;

  try {
    let result;
    switch (name) {
      case 'lessons_search':
        result = await lessonsSearch(args);
        break;
      case 'lessons_add':
        result = await lessonsAdd(args);
        break;
      case 'impact_analyze':
        result = await impactAnalyze(args);
        break;
      default:
        sendError(id, -32602, `Unknown tool: ${name}`);
        return;
    }
    sendResponse(id, { content: [{ type: 'text', text: result }] });
  } catch (err) {
    sendResponse(id, {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    });
  }
}

// ── lessons_search (matches "## N. Title" format) ───────────────────

async function lessonsSearch({ query, category }) {
  const lessonsDir = join(process.cwd(), '.code-j', 'lessons');

  let files;
  try {
    files = (await readdir(lessonsDir)).filter(f => f.endsWith('.md'));
  } catch {
    return 'No lessons directory found. Use lessons_add to create your first lesson.';
  }

  if (category) {
    const safe = sanitizeCategory(category);
    files = files.filter(f => f.replace('.md', '') === safe);
  }

  if (files.length === 0) {
    return category ? `No lessons file found for category "${category}".` : 'No lessons recorded yet.';
  }

  const results = [];
  const queryLower = query.toLowerCase();

  for (const file of files) {
    const filePath = join(lessonsDir, file);
    assertWithinDir(filePath, lessonsDir);
    const content = await readFile(filePath, 'utf-8');
    const categoryName = file.replace('.md', '');

    // Split by "## N." lesson headings
    const lessons = content.split(/(?=^## \d+\.)/m).filter(s => /^## \d+\./.test(s));

    // If query matches filename/category, include all lessons from that file
    const categoryMatch = categoryName.toLowerCase().includes(queryLower);

    for (const lesson of lessons) {
      if (categoryMatch || lesson.toLowerCase().includes(queryLower)) {
        results.push({ file: categoryName, content: lesson.trim() });
      }
    }
  }

  if (results.length === 0) {
    return `No lessons found matching "${query}"${category ? ` in category ${category}` : ''}.`;
  }

  const formatted = results.map(r => `[${r.file}]\n${r.content}`).join('\n\n---\n\n');
  return `Found ${results.length} lesson(s):\n\n${formatted}`;
}

// ── lessons_add (appends "## N. Title" format) ──────────────────────

async function lessonsAdd({ category, title, mistake, consequence, rule }) {
  const lessonsDir = join(process.cwd(), '.code-j', 'lessons');
  const safeCategory = sanitizeCategory(category);

  if (!existsSync(lessonsDir)) {
    await mkdir(lessonsDir, { recursive: true });
  }

  // Find the highest lesson number across ALL files
  let maxNumber = 0;
  try {
    const allFiles = (await readdir(lessonsDir)).filter(f => f.endsWith('.md'));
    for (const f of allFiles) {
      const content = await readFile(join(lessonsDir, f), 'utf-8');
      const matches = content.match(/^## (\d+)\./gm);
      if (matches) {
        for (const m of matches) {
          const num = parseInt(m.match(/(\d+)/)[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    }
  } catch {
    // no files yet
  }

  const nextNumber = maxNumber + 1;
  const filePath = join(lessonsDir, `${safeCategory}.md`);
  assertWithinDir(filePath, lessonsDir);

  let existingContent = '';
  let lessonCount = 0;

  try {
    existingContent = await readFile(filePath, 'utf-8');
    // Update lesson_count in frontmatter
    const countMatch = existingContent.match(/lesson_count:\s*(\d+)/);
    if (countMatch) {
      lessonCount = parseInt(countMatch[1], 10);
      existingContent = existingContent.replace(
        /lesson_count:\s*\d+/,
        `lesson_count: ${lessonCount + 1}`
      );
    }
  } catch {
    // Create new file with frontmatter
    existingContent = `---\nname: ${safeCategory}\ndescription: Lessons about ${safeCategory}\ntype: lesson-group\ncategory: ${safeCategory}\nlesson_count: 1\n---\n`;
  }

  let entry = `\n## ${nextNumber}. ${title}\n`;
  entry += `- **실수**: ${mistake}\n`;
  if (consequence) {
    entry += `- **결과**: ${consequence}\n`;
  }
  entry += `- **규칙**: ${rule}\n`;

  await writeFile(filePath, existingContent + entry, 'utf-8');

  return `Lesson ## ${nextNumber} added to ${safeCategory}.md successfully.`;
}

// ── impact_analyze ──────────────────────────────────────────────────

async function impactAnalyze({ symbol, path: searchPathInput, file_types }) {
  const searchPath = searchPathInput || process.cwd();

  let output;
  try {
    output = await tryRipgrep(symbol, searchPath, file_types);
  } catch {
    try {
      output = await tryGrep(symbol, searchPath, file_types);
    } catch {
      return `No references found for "${symbol}" in ${searchPath}.`;
    }
  }

  const lines = output.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    return `No references found for "${symbol}".`;
  }

  return formatImpactResult(symbol, lines);
}

async function tryRipgrep(symbol, searchPath, fileTypes) {
  const args = ['-n', '--no-heading'];
  if (fileTypes) {
    for (const ext of fileTypes.split(',')) {
      args.push('-g', `*.${ext.trim()}`);
    }
  }
  args.push(symbol, searchPath);

  const { stdout } = await execFileAsync('rg', args, { timeout: 15000, maxBuffer: 1024 * 1024 });
  if (!stdout.trim()) throw new Error('no results');
  return stdout;
}

async function tryGrep(symbol, searchPath, fileTypes) {
  const args = ['-rn'];
  if (fileTypes) {
    for (const ext of fileTypes.split(',')) {
      args.push(`--include=*.${ext.trim()}`);
    }
  }
  args.push(symbol, searchPath);

  const { stdout } = await execFileAsync('grep', args, { timeout: 15000, maxBuffer: 1024 * 1024 });
  if (!stdout.trim()) throw new Error('no results');
  return stdout;
}

function formatImpactResult(symbol, lines) {
  const byFile = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const file = line.slice(0, colonIdx);
    if (!byFile[file]) byFile[file] = [];
    byFile[file].push(line.slice(colonIdx + 1));
  }

  const fileCount = Object.keys(byFile).length;
  let result = `## Impact Analysis: "${symbol}"\n\n`;
  result += `**Total references**: ${lines.length} in ${fileCount} file(s)\n\n`;

  const imports = [];
  const definitions = [];
  const usages = [];

  for (const [file, refs] of Object.entries(byFile)) {
    for (const ref of refs) {
      const entry = `${file}:${ref.trim()}`;
      if (/^[\d]+:.*(?:import|from|require)/.test(ref)) {
        imports.push(entry);
      } else if (/^[\d]+:.*(?:def |class |function |const |let |var |type |interface )/.test(ref)) {
        definitions.push(entry);
      } else {
        usages.push(entry);
      }
    }
  }

  if (definitions.length > 0) {
    result += `### Definitions (${definitions.length})\n`;
    definitions.forEach(d => result += `- ${d}\n`);
    result += '\n';
  }

  if (imports.length > 0) {
    result += `### Imports (${imports.length})\n`;
    imports.forEach(i => result += `- ${i}\n`);
    result += '\n';
  }

  if (usages.length > 0) {
    result += `### Usages (${usages.length})\n`;
    usages.slice(0, 50).forEach(u => result += `- ${u}\n`);
    if (usages.length > 50) {
      result += `- ... and ${usages.length - 50} more\n`;
    }
    result += '\n';
  }

  result += `### Files to update if changing "${symbol}":\n`;
  Object.keys(byFile).forEach(f => result += `- [ ] ${f}\n`);

  return result;
}
