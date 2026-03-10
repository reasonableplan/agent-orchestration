import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorAgent } from './director-agent.js';
import type { IClaudeClient } from './director-agent.js';
import type {
  AgentDependencies,
  IMessageBus,
  IStateStore,
  IGitService,
  Message,
  Task,
} from '@agent/core';

// ===== Mocks =====

function createMockMessageBus(): IMessageBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
    subscribeAll: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

function createMockStateStore(): IStateStore {
  return {
    registerAgent: vi.fn(),
    getAgent: vi.fn(),
    updateAgentStatus: vi.fn(),
    updateHeartbeat: vi.fn(),
    createTask: vi.fn(),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    getTasksByColumn: vi.fn().mockResolvedValue([]),
    getTasksByAgent: vi.fn(),
    getReadyTasksForAgent: vi.fn().mockResolvedValue([]),
    claimTask: vi.fn(),
    createEpic: vi.fn(),
    getEpic: vi.fn(),
    updateEpic: vi.fn(),
    saveMessage: vi.fn(),
    saveArtifact: vi.fn(),
  };
}

function createMockGitService(): IGitService {
  let issueCounter = 100;
  return {
    validateConnection: vi.fn(),
    createIssue: vi.fn().mockImplementation(() => Promise.resolve(++issueCounter)),
    updateIssue: vi.fn(),
    closeIssue: vi.fn(),
    getIssue: vi.fn(),
    getIssuesByLabel: vi.fn(),
    getEpicIssues: vi.fn().mockResolvedValue([]),
    getAllProjectItems: vi.fn(),
    moveIssueToColumn: vi.fn(),
    createBranch: vi.fn(),
    createPR: vi.fn(),
  };
}

function createMockClaude(response: unknown): IClaudeClient {
  return {
    chatJSON: vi.fn().mockResolvedValue({
      data: response,
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    epicId: null,
    title: 'Test task',
    description: 'Test description',
    assignedAgent: 'director',
    status: 'in-progress',
    githubIssueNumber: null,
    boardColumn: 'In Progress',
    dependencies: [],
    priority: 3,
    complexity: 'medium',
    retryCount: 0,
    artifacts: [],
    ...overrides,
  };
}

function makeReviewMessage(taskId: string, success: boolean): Message {
  return {
    id: 'msg-1',
    type: 'review.request',
    from: 'backend',
    to: null,
    payload: {
      taskId,
      result: success
        ? { success: true, artifacts: [] }
        : { success: false, error: { message: 'oops' }, artifacts: [] },
    },
    traceId: 'trace-1',
    timestamp: new Date(),
  };
}

// ===== Tests =====

describe('DirectorAgent', () => {
  let deps: AgentDependencies;
  let messageBus: IMessageBus;
  let stateStore: IStateStore;
  let gitService: IGitService;
  let mockClaude: IClaudeClient;
  let agent: DirectorAgent;

  beforeEach(() => {
    messageBus = createMockMessageBus();
    stateStore = createMockStateStore();
    gitService = createMockGitService();
    deps = { messageBus, stateStore, gitService };
    mockClaude = createMockClaude({ action: 'clarify', message: 'default' });
    agent = new DirectorAgent(deps, { claudeClient: mockClaude });
  });

  // ===== Basic Structure =====

  it('has correct id, domain, and level', () => {
    expect(agent.id).toBe('director');
    expect(agent.domain).toBe('orchestration');
    expect(agent.config.level).toBe(0);
  });

  it('subscribes to review.request and board.move on construction', () => {
    expect(messageBus.subscribe).toHaveBeenCalledWith('review.request', expect.any(Function));
    expect(messageBus.subscribe).toHaveBeenCalledWith('board.move', expect.any(Function));
  });

  // ===== handleUserInput =====

  it('handles create_epic action from Claude', async () => {
    mockClaude = createMockClaude({
      action: 'create_epic',
      title: 'Login Feature',
      description: 'Implement login',
      tasks: [
        { title: 'Create branch', agent: 'git', description: 'Branch for login', dependencies: [] },
        { title: 'Backend API', agent: 'backend', description: 'Login endpoint', dependencies: [0] },
      ],
    });
    agent = new DirectorAgent(deps, { claudeClient: mockClaude });

    const result = await agent.handleUserInput('로그인 기능 만들어줘');

    expect(result).toContain('Login Feature');
    expect(result).toContain('2 tasks');
    expect(stateStore.createEpic).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Login Feature',
      status: 'planning',
    }));
    expect(stateStore.createTask).toHaveBeenCalledTimes(2);
    expect(gitService.createIssue).toHaveBeenCalledTimes(2);
    expect(gitService.moveIssueToColumn).toHaveBeenCalledWith(expect.any(Number), 'Ready');
    expect(stateStore.updateEpic).toHaveBeenCalledWith(expect.any(String), { status: 'active' });
    expect(messageBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'epic.progress',
    }));
  });

  it('handles clarify action from Claude', async () => {
    mockClaude = createMockClaude({ action: 'clarify', message: '어떤 인증 방식을 원하시나요?' });
    agent = new DirectorAgent(deps, { claudeClient: mockClaude });

    const result = await agent.handleUserInput('로그인');
    expect(result).toBe('어떤 인증 방식을 원하시나요?');
  });

  it('handles Claude API error gracefully', async () => {
    mockClaude = { chatJSON: vi.fn().mockRejectedValue(new Error('API rate limit exceeded')) };
    agent = new DirectorAgent(deps, { claudeClient: mockClaude });

    const result = await agent.handleUserInput('뭔가 해줘');
    expect(result).toContain('Error processing request');
    expect(result).toContain('API rate limit exceeded');
  });

  it('handles JSON parse failure gracefully', async () => {
    mockClaude = { chatJSON: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')) };
    agent = new DirectorAgent(deps, { claudeClient: mockClaude });

    const result = await agent.handleUserInput('뭔가 해줘');
    expect(result).toContain('Error processing request');
    expect(result).toContain('Unexpected token');
  });

  // ===== Dependency Promotion (Dispatcher) =====

  it('promotes dependent tasks to Ready when all deps are Done', async () => {
    vi.mocked(stateStore.getTasksByColumn).mockResolvedValueOnce([
      { id: 'task-gh-102', title: 'Backend API', dependencies: ['task-gh-101'], boardColumn: 'Backlog', githubIssueNumber: 102 },
    ] as never);
    vi.mocked(stateStore.getTask).mockResolvedValueOnce({ id: 'task-gh-101', boardColumn: 'Done' } as never);

    await (agent as never as { checkAndPromoteDependents: (n: number) => Promise<void> }).checkAndPromoteDependents(101);

    expect(gitService.moveIssueToColumn).toHaveBeenCalledWith(102, 'Ready');
    expect(stateStore.updateTask).toHaveBeenCalledWith('task-gh-102', expect.objectContaining({
      status: 'ready',
      boardColumn: 'Ready',
    }));
  });

  it('does not promote tasks when deps are not all Done', async () => {
    vi.mocked(stateStore.getTasksByColumn).mockResolvedValueOnce([
      { id: 'task-gh-103', title: 'PR', dependencies: ['task-gh-101', 'task-gh-102'], boardColumn: 'Backlog', githubIssueNumber: 103 },
    ] as never);
    vi.mocked(stateStore.getTask)
      .mockResolvedValueOnce({ id: 'task-gh-101', boardColumn: 'Done' } as never)
      .mockResolvedValueOnce({ id: 'task-gh-102', boardColumn: 'In Progress' } as never);

    await (agent as never as { checkAndPromoteDependents: (n: number) => Promise<void> }).checkAndPromoteDependents(101);

    expect(gitService.moveIssueToColumn).not.toHaveBeenCalled();
  });

  it('is idempotent — promoting an already Ready task is safe', async () => {
    // Task is already Ready but promotion is called again (race condition)
    vi.mocked(stateStore.getTasksByColumn).mockResolvedValueOnce([
      { id: 'task-gh-102', title: 'API', dependencies: ['task-gh-101'], boardColumn: 'Backlog', githubIssueNumber: 102 },
    ] as never);
    vi.mocked(stateStore.getTask).mockResolvedValueOnce({ id: 'task-gh-101', boardColumn: 'Done' } as never);

    // Call twice — should not throw
    await (agent as never as { checkAndPromoteDependents: (n: number) => Promise<void> }).checkAndPromoteDependents(101);

    // Second call: no more backlog tasks
    vi.mocked(stateStore.getTasksByColumn).mockResolvedValueOnce([]);
    await (agent as never as { checkAndPromoteDependents: (n: number) => Promise<void> }).checkAndPromoteDependents(101);

    // moveIssueToColumn only called once (first call)
    expect(gitService.moveIssueToColumn).toHaveBeenCalledTimes(1);
  });

  // ===== Review Handler =====

  it('retries failed task when under max retries', async () => {
    vi.mocked(stateStore.getTask).mockResolvedValueOnce({
      id: 'task-gh-50', retryCount: 1, githubIssueNumber: 50,
    } as never);

    await (agent as never as { onReviewRequest: (m: Message) => Promise<void> })
      .onReviewRequest(makeReviewMessage('task-gh-50', false));

    expect(stateStore.updateTask).toHaveBeenCalledWith('task-gh-50', expect.objectContaining({
      retryCount: 2, status: 'ready', boardColumn: 'Ready',
    }));
    expect(gitService.moveIssueToColumn).toHaveBeenCalledWith(50, 'Ready');
  });

  it('does not retry when max retries exceeded', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(stateStore.getTask).mockResolvedValueOnce({
      id: 'task-gh-50', retryCount: 3, githubIssueNumber: 50,
    } as never);

    await (agent as never as { onReviewRequest: (m: Message) => Promise<void> })
      .onReviewRequest(makeReviewMessage('task-gh-50', false));

    expect(stateStore.updateTask).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('failed after max retries'));
    consoleSpy.mockRestore();
  });

  // ===== executeTask =====

  it('executeTask delegates to handleUserInput', async () => {
    mockClaude = createMockClaude({ action: 'clarify', message: 'What do you need?' });
    agent = new DirectorAgent(deps, { claudeClient: mockClaude });

    const task = makeTask({ title: 'Plan new feature', description: 'Build a todo app' });
    const result = await (agent as never as { executeTask: (t: Task) => Promise<{ success: boolean; data: { response: string } }> })
      .executeTask(task);

    expect(result.success).toBe(true);
    expect(result.data.response).toBe('What do you need?');
  });
});
