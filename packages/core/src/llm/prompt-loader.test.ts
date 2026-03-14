import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PromptLoader, getPromptLoader, resetPromptLoader } from './prompt-loader.js';

// 테스트용 임시 prompts 디렉토리
const TEST_DIR = resolve(tmpdir(), `prompt-loader-test-${Date.now()}`);

function writePrompt(relativePath: string, content: string): void {
  const fullPath = resolve(TEST_DIR, relativePath);
  const dir = resolve(fullPath, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

describe('PromptLoader', () => {
  beforeEach(() => {
    mkdirSync(resolve(TEST_DIR, 'shared'), { recursive: true });
    writePrompt('shared/code-standards.md', '# Code Standards\nRule 1');
    writePrompt('shared/quality-gates.md', '# Quality Gates\nGate 1');
    writePrompt('shared/workflow.md', '# Workflow\nStep 1');
    writePrompt('shared/communication.md', '# Communication\nProtocol 1');
    writePrompt('backend.md', '# Backend Agent\nYou are a backend expert.');
    writePrompt('frontend.md', '# Frontend Agent\nYou are a frontend expert.');
    writePrompt('qa.md', '# QA\nQuality checklist.');
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    resetPromptLoader();
  });

  // ===== loadAgentPrompt =====

  it('combines shared + agent-specific prompts', () => {
    const loader = new PromptLoader(TEST_DIR);
    const prompt = loader.loadAgentPrompt('backend');

    expect(prompt).toContain('# Code Standards');
    expect(prompt).toContain('# Quality Gates');
    expect(prompt).toContain('# Workflow');
    expect(prompt).toContain('# Communication');
    expect(prompt).toContain('# Backend Agent');
    // 구분자 확인
    expect(prompt).toContain('\n\n---\n\n');
  });

  it('returns shared prompts only when agent file missing', () => {
    const loader = new PromptLoader(TEST_DIR);
    const prompt = loader.loadAgentPrompt('nonexistent');

    expect(prompt).toContain('# Code Standards');
    expect(prompt).not.toContain('nonexistent');
  });

  it('caches loaded prompts', () => {
    const loader = new PromptLoader(TEST_DIR);
    const first = loader.loadAgentPrompt('backend');
    const second = loader.loadAgentPrompt('backend');
    // 동일 참조 (캐시에서 반환)
    expect(first).toBe(second);
  });

  it('clearCache forces reload', () => {
    const loader = new PromptLoader(TEST_DIR);
    const first = loader.loadAgentPrompt('backend');
    loader.clearCache();
    // 파일 내용 변경
    writePrompt('backend.md', '# Backend Agent v2\nUpdated.');
    const second = loader.loadAgentPrompt('backend');
    expect(first).not.toBe(second);
    expect(second).toContain('Backend Agent v2');
  });

  // ===== loadFile =====

  it('loads a single file', () => {
    const loader = new PromptLoader(TEST_DIR);
    const content = loader.loadFile('qa.md');
    expect(content).toContain('# QA');
  });

  it('returns empty string for missing file', () => {
    const loader = new PromptLoader(TEST_DIR);
    const content = loader.loadFile('nonexistent.md');
    expect(content).toBe('');
  });

  // ===== Path traversal defense =====

  it('blocks path traversal attempts', () => {
    const loader = new PromptLoader(TEST_DIR);
    const content = loader.loadFile('../../etc/passwd');
    expect(content).toBe('');
  });

  it('blocks path traversal with backslashes', () => {
    const loader = new PromptLoader(TEST_DIR);
    const content = loader.loadFile('..\\..\\etc\\passwd');
    expect(content).toBe('');
  });

  // ===== Error handling =====

  it('re-throws non-ENOENT errors', () => {
    // 디렉토리를 파일처럼 읽으려 하면 EISDIR 에러 발생
    const loader = new PromptLoader(TEST_DIR);
    expect(() => loader.loadFile('shared')).toThrow();
  });

  // ===== Singleton =====

  it('getPromptLoader returns same instance', () => {
    const a = getPromptLoader(TEST_DIR);
    const b = getPromptLoader();
    expect(a).toBe(b);
  });

  it('getPromptLoader warns on different promptsDir (does not throw)', () => {
    getPromptLoader(TEST_DIR);
    // 다른 경로로 호출해도 에러 없이 기존 인스턴스 반환
    const b = getPromptLoader('/some/other/path');
    expect(b).toBe(getPromptLoader(TEST_DIR));
  });

  it('resetPromptLoader allows re-initialization', () => {
    const a = getPromptLoader(TEST_DIR);
    resetPromptLoader();
    const b = getPromptLoader(TEST_DIR);
    expect(a).not.toBe(b);
  });
});
