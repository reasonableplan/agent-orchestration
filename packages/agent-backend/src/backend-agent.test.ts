import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackendAgent } from './backend-agent.js';
import {
  createMockMessageBus,
  createMockStateStore,
  createMockGitService,
  createMockClaude,
  createMockTask,
} from '@agent/testing';
import type { IClaudeClient } from '@agent/testing';
import type { AgentDependencies, IMessageBus, IStateStore, IGitService, Task } from '@agent/core';

const MOCK_GENERATED = {
  files: [
    {
      path: 'src/routes/users.ts',
      content: 'export const router = {}',
      action: 'create' as const,
      language: 'typescript',
    },
    {
      path: 'src/controllers/users.controller.ts',
      content: 'export class UsersController {}',
      action: 'create' as const,
      language: 'typescript',
    },
    {
      path: 'src/schemas/users.schema.ts',
      content: 'export const schema = {}',
      action: 'create' as const,
      language: 'typescript',
    },
  ],
  summary: 'Created user API with routes, controller, and validation schema',
};

// ===== Tests =====

describe('BackendAgent', () => {
  let deps: AgentDependencies;
  let messageBus: IMessageBus;
  let stateStore: IStateStore;
  let gitService: IGitService;
  let mockClaude: IClaudeClient;
  let agent: BackendAgent;

  beforeEach(() => {
    messageBus = createMockMessageBus();
    stateStore = createMockStateStore();
    gitService = createMockGitService({ issueCounterStart: 200 });
    deps = { messageBus, stateStore, gitService };
    mockClaude = createMockClaude(MOCK_GENERATED);
    agent = new BackendAgent(deps, { workDir: '/tmp/test-workspace', claudeClient: mockClaude });
  });

  // ===== Basic Structure =====

  it('has correct id, domain, and level', () => {
    expect(agent.id).toBe('backend');
    expect(agent.domain).toBe('backend');
    expect(agent.config.level).toBe(2);
  });

  // ===== Task Type Detection =====

  it('detects api.create from labels', async () => {
    const task = createMockTask({ title: 'Something', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' }) as Task & { labels: string[] };
    task.labels = ['type:api.create'];
    const result = await callExecuteTask(agent, task);
    expect(result.success).toBe(true);
    expect(mockClaude.chatJSON).toHaveBeenCalled();
  });

  it('detects api.create from title when no labels', async () => {
    const task = createMockTask({ title: 'Create user API endpoint', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);
    expect(result.success).toBe(true);
  });

  it('detects model.create from title', async () => {
    const task = createMockTask({ title: 'Create User model schema', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);
    expect(result.success).toBe(true);
  });

  it('detects middleware.create from title', async () => {
    const task = createMockTask({ title: 'Create auth middleware', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);
    expect(result.success).toBe(true);
  });

  it('detects test.create from title', async () => {
    const task = createMockTask({ title: 'Create tests for user API', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);
    expect(result.success).toBe(true);
  });

  it('returns error for unknown task type', async () => {
    const task = createMockTask({ title: 'do something random', description: 'unrelated work', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Unknown backend task type');
  });

  // ===== Code Generation Flow =====

  it('generates code, writes files, saves artifacts, and creates commit request', async () => {
    const task = createMockTask({
      id: 'task-1',
      epicId: 'epic-1',
      title: 'Create user API endpoint',
      description: 'POST /api/users endpoint with email/password validation',
      assignedAgent: 'backend',
      status: 'in-progress',
      githubIssueNumber: 50,
      boardColumn: 'In Progress',
    });
    const result = await callExecuteTask(agent, task);

    // Success
    expect(result.success).toBe(true);
    expect(result.artifacts).toEqual([
      'src/routes/users.ts',
      'src/controllers/users.controller.ts',
      'src/schemas/users.schema.ts',
    ]);
    expect(result.data?.generatedFiles).toEqual(result.artifacts);

    // Claude called
    expect(mockClaude.chatJSON).toHaveBeenCalledWith(
      expect.stringContaining('Backend Agent'),
      expect.stringContaining('Create user API endpoint'),
    );

    // Artifacts saved to DB
    expect(stateStore.saveArtifact).toHaveBeenCalledTimes(3);
    expect(stateStore.saveArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        filePath: 'src/routes/users.ts',
        createdBy: 'backend',
      }),
    );

    // Git commit follow-up issue created
    expect(gitService.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('[GIT] Commit:'),
        labels: expect.arrayContaining(['agent:git', 'type:commit', 'epic:epic-1']),
        dependencies: [50],
      }),
    );
  });

  it('creates commit request even without epicId', async () => {
    const task = createMockTask({
      id: 'task-1',
      epicId: null,
      title: 'Create user API endpoint',
      description: 'POST /api/users endpoint with email/password validation',
      assignedAgent: 'backend',
      status: 'in-progress',
      githubIssueNumber: 50,
      boardColumn: 'In Progress',
    });
    const result = await callExecuteTask(agent, task);

    expect(result.success).toBe(true);
    expect(gitService.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('[GIT] Commit:'),
        labels: expect.arrayContaining(['agent:git', 'type:commit']),
      }),
    );
  });

  // ===== Analyze Task =====

  it('analyze task returns summary without writing files', async () => {
    const analyzeClaude = createMockClaude({
      files: [],
      summary: 'Found 5 API endpoints, 3 models, no security issues',
    });
    agent = new BackendAgent(deps, { workDir: '/tmp/test', claudeClient: analyzeClaude });

    const task = createMockTask({ title: 'Analyze codebase routes', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);

    expect(result.success).toBe(true);
    expect(result.data?.analysis).toContain('5 API endpoints');
    expect(result.artifacts).toEqual([]);
    expect(stateStore.saveArtifact).not.toHaveBeenCalled();
  });

  // ===== Error Handling =====

  it('handles Claude API error gracefully', async () => {
    mockClaude = { chatJSON: vi.fn().mockRejectedValue(new Error('API rate limit exceeded')) };
    agent = new BackendAgent(deps, { workDir: '/tmp/test', claudeClient: mockClaude });

    const task = createMockTask({ title: 'Create user API endpoint', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('API rate limit exceeded');
  });

  it('handles empty file generation as error', async () => {
    mockClaude = createMockClaude({ files: [], summary: 'Nothing generated' });
    agent = new BackendAgent(deps, { workDir: '/tmp/test', claudeClient: mockClaude });

    const task = createMockTask({ title: 'Create user API endpoint', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('no files');
  });

  it('succeeds even when commit request fails', async () => {
    vi.mocked(gitService.createIssue).mockRejectedValueOnce(new Error('GitHub API down'));

    const task = createMockTask({ title: 'Create user API endpoint', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);

    // Task itself succeeds — commit request failure is non-fatal
    expect(result.success).toBe(true);
    expect(result.artifacts.length).toBe(3);
  });

  // ===== Korean Title Detection =====

  it('detects task types from Korean titles', async () => {
    const task = createMockTask({ title: '사용자 모델 스키마 생성', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await callExecuteTask(agent, task);
    expect(result.success).toBe(true);
    // Should detect as model.create due to '모델' and '스키마'
  });

  // ===== Context in Claude prompt =====

  it('includes epicId and existing artifacts in Claude prompt', async () => {
    const task = createMockTask({ epicId: 'epic-42', artifacts: ['src/models/user.ts'], title: 'Create user API endpoint', assignedAgent: 'backend', status: 'in-progress', githubIssueNumber: 50, boardColumn: 'In Progress' });
    await callExecuteTask(agent, task);

    expect(mockClaude.chatJSON).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Epic ID: epic-42'),
    );
    expect(mockClaude.chatJSON).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('src/models/user.ts'),
    );
  });
});

// ===== Helper =====

function callExecuteTask(agent: BackendAgent, task: Task) {
  return (
    agent as never as { executeTask: (t: Task) => Promise<import('@agent/core').TaskResult> }
  ).executeTask(task);
}
