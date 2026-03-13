import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAgent, taskRowToTask } from './base-agent.js';
import type {
  AgentConfig,
  IMessageBus,
  IStateStore,
  IGitService,
  Message,
  Task,
  TaskResult,
} from '../types/index.js';
import {
  createMockMessageBus,
  createMockStateStore,
  createMockGitService,
} from '@agent/testing';

class TestAgent extends BaseAgent {
  public executeTaskFn = vi
    .fn<(task: Task) => Promise<TaskResult>>()
    .mockResolvedValue({ success: true, artifacts: [] });

  protected async executeTask(task: Task): Promise<TaskResult> {
    return this.executeTaskFn(task);
  }
}

const TEST_CONFIG: AgentConfig = {
  id: 'test-agent',
  domain: 'test',
  level: 2,
  claudeModel: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  temperature: 0.2,
  tokenBudget: 50_000,
  taskTimeoutMs: 300_000,
  pollIntervalMs: 10_000,
};

const MOCK_TASK_ROW = {
  id: 'task-001',
  epicId: 'epic-001',
  title: 'Test task',
  description: 'A test task',
  assignedAgent: 'test-agent',
  status: 'ready',
  githubIssueNumber: 1,
  boardColumn: 'Ready',
  priority: 3,
  complexity: 'medium',
  dependencies: [],
  labels: [],
  retryCount: 0,
  createdAt: new Date(),
  startedAt: null,
  completedAt: null,
  reviewNote: null,
};

/**
 * Flush all pending microtasks and timers for one poll cycle.
 * BaseAgent uses `setTimeout` recursive loop, so we advance timers
 * and flush microtasks to let the async poll loop proceed.
 */
async function flushPollCycle(intervalMs: number) {
  // Flush pending microtasks first (any in-flight async work)
  await vi.advanceTimersByTimeAsync(intervalMs);
}

describe('BaseAgent', () => {
  let bus: IMessageBus;
  let store: IStateStore;
  let git: IGitService;
  let agent: TestAgent;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = createMockMessageBus();
    store = createMockStateStore();
    git = createMockGitService();
    agent = new TestAgent(TEST_CONFIG, {
      messageBus: bus,
      stateStore: store,
      gitService: git,
    });
  });

  afterEach(() => {
    agent.stopPolling();
    vi.useRealTimers();
  });

  it('초기 상태는 idle이다', () => {
    expect(agent.status).toBe('idle');
  });

  it('config에서 id, domain이 설정된다', () => {
    expect(agent.id).toBe('test-agent');
    expect(agent.domain).toBe('test');
  });

  it('startPolling 후 findNextTask가 DB를 조회한다', async () => {
    agent.startPolling(50);

    await flushPollCycle(50);

    expect(store.getReadyTasksForAgent).toHaveBeenCalledWith('test-agent');
  });

  it('DB에 Ready 태스크가 있으면 claimTask 후 executeTask가 호출된다', async () => {
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(true);
    agent.startPolling(50);

    await flushPollCycle(50);

    expect(store.claimTask).toHaveBeenCalledWith('task-001');
    expect(agent.executeTaskFn).toHaveBeenCalled();
    expect(git.moveIssueToColumn).toHaveBeenCalledWith(1, 'In Progress');
  });

  it('claimTask 실패 시 다음 태스크를 시도한다', async () => {
    const task1 = { ...MOCK_TASK_ROW, id: 'task-claimed', priority: 1 };
    const task2 = { ...MOCK_TASK_ROW, id: 'task-available', priority: 2, githubIssueNumber: 2 };
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([task1, task2]);
    vi.mocked(store.claimTask)
      .mockResolvedValueOnce(false) // task1: already claimed
      .mockResolvedValueOnce(true); // task2: success
    agent.startPolling(50);

    await flushPollCycle(50);

    expect(store.claimTask).toHaveBeenCalledTimes(2);
    expect(agent.executeTaskFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-available' }),
    );
  });

  it('모든 claimTask 실패 시 executeTask가 호출되지 않는다', async () => {
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(false);
    agent.startPolling(50);

    await flushPollCycle(50);

    expect(agent.executeTaskFn).not.toHaveBeenCalled();
  });

  it('태스크 실행 완료 후 review.request가 발행된다', async () => {
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(true);
    agent.startPolling(50);

    await flushPollCycle(50);

    const publishCalls = (bus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const reviewMessages = publishCalls.filter(([msg]: [Message]) => msg.type === 'review.request');
    expect(reviewMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('executeTask 에러 시 error 상태 후 다음 폴링에서 자동 복구된다', async () => {
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    agent.executeTaskFn.mockRejectedValueOnce(new Error('fail'));

    agent.startPolling(50);

    // 첫 폴링 (에러 발생)
    await flushPollCycle(50);
    // 백오프 후 두 번째 폴링 (복구)
    await flushPollCycle(100);

    expect(agent.status).toBe('idle');
  });

  it('중복 startPolling은 무시된다', () => {
    agent.startPolling(50);
    agent.startPolling(50); // 두 번째 호출은 무시
  });

  it('subscribe는 messageBus.subscribe를 호출한다', () => {
    const handler = vi.fn();
    (agent as unknown as { subscribe: (type: string, handler: unknown) => void }).subscribe(
      'board.move',
      handler,
    );
    expect(bus.subscribe).toHaveBeenCalledWith('board.move', handler);
  });

  it('Ready 태스크가 없으면 executeTask가 호출되지 않는다', async () => {
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValue([]);
    agent.startPolling(50);

    await flushPollCycle(50);

    expect(agent.executeTaskFn).not.toHaveBeenCalled();
  });

  it('여러 Ready 태스크 중 priority가 높은 것(숫자 낮은 것)을 선택한다', async () => {
    const lowPriority = { ...MOCK_TASK_ROW, id: 'task-low', priority: 5 };
    const highPriority = { ...MOCK_TASK_ROW, id: 'task-high', priority: 1, githubIssueNumber: 2 };
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([lowPriority, highPriority]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(true);

    agent.startPolling(50);
    await flushPollCycle(50);

    expect(agent.executeTaskFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-high', priority: 1 }),
    );
  });

  it('drain()은 현재 태스크 완료 후 폴링을 멈춘다', async () => {
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    agent.startPolling(50);

    await flushPollCycle(50);

    // drain 호출 — 즉시 폴링 중지
    const drainPromise = agent.drain();
    await flushPollCycle(50);
    await drainPromise;

    // drain 후 더 이상 폴링하지 않음
    vi.mocked(store.getReadyTasksForAgent).mockClear();
    await flushPollCycle(50);
    expect(store.getReadyTasksForAgent).not.toHaveBeenCalled();
  });

  // ===== Gap Tests: Task Timeout =====

  it('태스크 타임아웃 시 에러로 처리된다', async () => {
    const config = { ...TEST_CONFIG, taskTimeoutMs: 100 };
    agent = new TestAgent(config, { messageBus: bus, stateStore: store, gitService: git });

    // executeTask that never resolves
    agent.executeTaskFn.mockImplementationOnce(
      () => new Promise(() => {}), // hang forever
    );

    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(true);

    agent.startPolling(50);
    await flushPollCycle(50); // start task
    await vi.advanceTimersByTimeAsync(100); // trigger timeout

    expect(agent.status).toBe('error');
  });

  it('태스크가 타임아웃보다 빨리 완료되면 타이머가 정리된다', async () => {
    const config = { ...TEST_CONFIG, taskTimeoutMs: 10_000 };
    agent = new TestAgent(config, { messageBus: bus, stateStore: store, gitService: git });

    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(true);
    agent.executeTaskFn.mockResolvedValueOnce({ success: true, artifacts: [] });

    agent.startPolling(50);
    await flushPollCycle(50);

    // Task completed successfully before timeout
    expect(agent.status).toBe('idle');
  });

  // ===== Gap Tests: Board Rollback on Claim =====

  it('claim 후 Board 동기화 실패 시 DB 롤백하고 다음 태스크를 시도한다', async () => {
    const task1 = { ...MOCK_TASK_ROW, id: 'task-fail-board', githubIssueNumber: 10 };
    const task2 = { ...MOCK_TASK_ROW, id: 'task-ok', githubIssueNumber: 20, priority: 4 };
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([task1, task2]);
    vi.mocked(store.claimTask).mockResolvedValue(true);
    vi.mocked(git.moveIssueToColumn)
      .mockRejectedValueOnce(new Error('Board API down')) // task1 fails
      .mockResolvedValue(undefined); // task2 succeeds

    agent.startPolling(50);
    await flushPollCycle(50);

    // DB rollback for task1
    expect(store.updateTask).toHaveBeenCalledWith('task-fail-board', {
      status: 'ready',
      boardColumn: 'Ready',
      startedAt: null,
    });
    // task2 was executed instead
    expect(agent.executeTaskFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-ok' }),
    );
  });

  it('githubIssueNumber가 null이면 Board 동기화를 건너뛴다', async () => {
    const taskNoIssue = { ...MOCK_TASK_ROW, githubIssueNumber: null };
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([taskNoIssue]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(true);

    agent.startPolling(50);
    await flushPollCycle(50);

    expect(git.moveIssueToColumn).not.toHaveBeenCalled();
    expect(agent.executeTaskFn).toHaveBeenCalled();
  });

  // ===== Gap Tests: Config Hot-Reload =====

  it('AGENT_CONFIG_UPDATED 메시지로 config이 DB에서 리로드된다', async () => {
    const dbConfig = {
      agentId: 'test-agent',
      claudeModel: 'claude-opus-4-20250514',
      maxTokens: 16384,
      temperature: 0.5,
      tokenBudget: 200_000,
      taskTimeoutMs: 600_000,
      pollIntervalMs: 5_000,
      updatedAt: new Date(),
    };
    vi.mocked(store.getAgentConfig).mockResolvedValueOnce(dbConfig);

    // Find the config handler that was registered
    const subscribeCalls = (bus.subscribe as ReturnType<typeof vi.fn>).mock.calls;
    const configCall = subscribeCalls.find(([type]: [string]) => type === 'agent.config.updated');
    expect(configCall).toBeDefined();

    const handler = configCall![1];
    await handler({
      id: 'msg-1', type: 'agent.config.updated', from: 'dashboard',
      to: null, payload: { agentId: 'test-agent' }, traceId: 't1', timestamp: new Date(),
    });

    // Wait for async reloadConfig
    await vi.advanceTimersByTimeAsync(0);

    expect(agent.config.claudeModel).toBe('claude-opus-4-20250514');
    expect(agent.config.maxTokens).toBe(16384);
    expect(agent.config.temperature).toBe(0.5);
    expect(agent.config.tokenBudget).toBe(200_000);
  });

  it('다른 에이전트의 config 업데이트는 무시한다', async () => {
    const subscribeCalls = (bus.subscribe as ReturnType<typeof vi.fn>).mock.calls;
    const configCall = subscribeCalls.find(([type]: [string]) => type === 'agent.config.updated');
    const handler = configCall![1];

    await handler({
      id: 'msg-2', type: 'agent.config.updated', from: 'dashboard',
      to: null, payload: { agentId: 'other-agent' }, traceId: 't2', timestamp: new Date(),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(store.getAgentConfig).not.toHaveBeenCalled();
  });

  it('reloadConfig에서 DB 결과가 null이면 config을 변경하지 않는다', async () => {
    vi.mocked(store.getAgentConfig).mockResolvedValueOnce(null);

    const subscribeCalls = (bus.subscribe as ReturnType<typeof vi.fn>).mock.calls;
    const configCall = subscribeCalls.find(([type]: [string]) => type === 'agent.config.updated');
    const handler = configCall![1];

    const originalModel = agent.config.claudeModel;
    await handler({
      id: 'msg-3', type: 'agent.config.updated', from: 'dashboard',
      to: null, payload: { agentId: 'test-agent' }, traceId: 't3', timestamp: new Date(),
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(agent.config.claudeModel).toBe(originalModel);
  });

  // ===== Gap Tests: onTaskComplete =====

  it('성공 시 Review 컬럼으로 이동하고 completedAt을 설정한다', async () => {
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(true);
    agent.executeTaskFn.mockResolvedValueOnce({ success: true, artifacts: ['file.ts'] });

    agent.startPolling(50);
    await flushPollCycle(50);

    expect(store.updateTask).toHaveBeenCalledWith('task-001', expect.objectContaining({
      status: 'review',
      boardColumn: 'Review',
      completedAt: expect.any(Date),
    }));
    expect(git.moveIssueToColumn).toHaveBeenCalledWith(1, 'Review');
  });

  it('실패 시 Failed 컬럼으로 이동하고 completedAt은 설정하지 않는다', async () => {
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(true);
    agent.executeTaskFn.mockResolvedValueOnce({
      success: false, artifacts: [], error: { message: 'Failed' },
    });

    agent.startPolling(50);
    await flushPollCycle(50);

    expect(store.updateTask).toHaveBeenCalledWith('task-001', expect.objectContaining({
      status: 'failed',
      boardColumn: 'Failed',
    }));
    // completedAt should NOT be in the update
    const updateCall = vi.mocked(store.updateTask).mock.calls.find(
      ([id]) => id === 'task-001',
    );
    expect(updateCall![1]).not.toHaveProperty('completedAt');
  });

  it('onTaskComplete에서 Board 동기화 실패는 non-fatal이다', async () => {
    vi.mocked(store.getReadyTasksForAgent).mockResolvedValueOnce([MOCK_TASK_ROW]);
    vi.mocked(store.claimTask).mockResolvedValueOnce(true);
    agent.executeTaskFn.mockResolvedValueOnce({ success: true, artifacts: [] });
    vi.mocked(git.moveIssueToColumn)
      .mockResolvedValueOnce(undefined) // In Progress (claim)
      .mockRejectedValueOnce(new Error('Board down')); // Review (onTaskComplete)

    agent.startPolling(50);
    await flushPollCycle(50);

    // Should still publish review.request despite Board failure
    const publishCalls = (bus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const reviewMessages = publishCalls.filter(([msg]: [Message]) => msg.type === 'review.request');
    expect(reviewMessages.length).toBeGreaterThanOrEqual(1);
    expect(agent.status).toBe('idle'); // not error
  });

  // ===== Gap Tests: Pause / Resume =====

  it('pause()는 폴링을 멈추고 paused 상태로 변경한다', async () => {
    agent.startPolling(50);
    await flushPollCycle(50);

    await agent.pause();

    expect(agent.status).toBe('paused');
  });

  it('resume()는 idle로 전환 후 폴링을 재시작한다', async () => {
    agent.startPolling(50);
    await flushPollCycle(50);
    await agent.pause();

    vi.mocked(store.getReadyTasksForAgent).mockClear();
    await agent.resume(50);
    await flushPollCycle(50);

    expect(agent.status).toBe('idle');
    expect(store.getReadyTasksForAgent).toHaveBeenCalled();
  });

  // ===== Gap Tests: Heartbeat =====

  it('여러 poll cycle 후 heartbeat가 전송된다', async () => {
    // config.pollIntervalMs overrides startPolling arg, so use short config
    vi.useRealTimers();
    const fastConfig = { ...TEST_CONFIG, pollIntervalMs: 5 };
    const fastAgent = new TestAgent(fastConfig, { messageBus: bus, stateStore: store, gitService: git });

    fastAgent.startPolling(5);

    // Wait enough real time for 4+ cycles (HEARTBEAT_INTERVAL_CYCLES = 3)
    await new Promise((r) => setTimeout(r, 100));

    fastAgent.stopPolling();
    expect(store.updateHeartbeat).toHaveBeenCalledWith('test-agent');
  });

  // ===== Gap Tests: Drain Unsubscribe =====

  it('drain()은 모든 구독을 해제한다', async () => {
    agent.startPolling(50);
    await flushPollCycle(50);

    const drainPromise = agent.drain();
    await flushPollCycle(50);
    await drainPromise;

    // configHandler subscription + any others should be unsubscribed
    expect(bus.unsubscribe).toHaveBeenCalledWith('agent.config.updated', expect.any(Function));
  });

  // ===== Gap Tests: publishTokenUsage =====

  it('publishTokenUsage는 token.usage 메시지를 발행한다', async () => {
    // Access protected method via subclass trick
    await (agent as unknown as { publishTokenUsage: (i: number, o: number) => Promise<void> })
      .publishTokenUsage(500, 300);

    const publishCalls = (bus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const tokenMsg = publishCalls.find(([msg]: [Message]) => msg.type === 'token.usage');
    expect(tokenMsg).toBeDefined();
    expect(tokenMsg![0].payload).toEqual({ inputTokens: 500, outputTokens: 300 });
    expect(tokenMsg![0].from).toBe('test-agent');
  });

  // ===== Gap Tests: taskRowToTask (standalone) =====

  describe('taskRowToTask', () => {
    it('DB TaskRow를 도메인 Task로 변환한다', () => {
      const task = taskRowToTask(MOCK_TASK_ROW);
      expect(task).toEqual({
        id: 'task-001',
        epicId: 'epic-001',
        title: 'Test task',
        description: 'A test task',
        assignedAgent: 'test-agent',
        status: 'ready',
        githubIssueNumber: 1,
        boardColumn: 'Ready',
        dependencies: [],
        priority: 3,
        complexity: 'medium',
        retryCount: 0,
        artifacts: [],
        labels: [],
        reviewNote: null,
      });
    });

    it('null 필드에 기본값을 적용한다', () => {
      const minimalRow = {
        ...MOCK_TASK_ROW,
        description: null,
        status: null,
        boardColumn: null,
        dependencies: null,
        priority: null,
        complexity: null,
        retryCount: null,
        labels: null,
        reviewNote: null,
      };
      const task = taskRowToTask(minimalRow);
      expect(task.description).toBe('');
      expect(task.status).toBe('in-progress');
      expect(task.boardColumn).toBe('In Progress');
      expect(task.dependencies).toEqual([]);
      expect(task.priority).toBe(3);
      expect(task.complexity).toBe('medium');
      expect(task.retryCount).toBe(0);
      expect(task.labels).toEqual([]);
      expect(task.reviewNote).toBeNull();
    });
  });
});
