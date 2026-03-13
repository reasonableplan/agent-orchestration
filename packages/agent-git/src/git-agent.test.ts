import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitAgent } from './git-agent.js';
import {
  createMockMessageBus,
  createMockStateStore,
  createMockGitService,
  createMockTask,
} from '@agent/testing';
import type { AgentDependencies, IStateStore, IGitService, TaskResult, Task } from '@agent/core';

// Helper to access private methods for testing
interface GitAgentPrivate {
  executeTask(task: Task): Promise<TaskResult>;
  onTaskComplete(task: Task, result: { success: boolean; artifacts: string[] }): Promise<void>;
  extractBranchName(task: Task): string;
  checkAndTriggerPR(epicId: string): Promise<void>;
}

// ===== Tests =====

describe('GitAgent', () => {
  let deps: AgentDependencies;
  let gitService: IGitService;
  let stateStore: IStateStore;
  let agent: GitAgent;

  beforeEach(() => {
    gitService = createMockGitService(undefined, { createPR: vi.fn().mockResolvedValue(42) });
    stateStore = createMockStateStore();
    deps = {
      messageBus: createMockMessageBus(),
      stateStore,
      gitService,
    };
    agent = new GitAgent(deps, { workDir: '/tmp/test-work' });
  });

  it('has correct id and domain', () => {
    expect(agent.id).toBe('git');
    expect(agent.domain).toBe('git');
    expect(agent.config.level).toBe(2);
  });

  // ===== detectTaskType (tested via executeTask) =====

  it('handles branch task and calls createBranch', async () => {
    const task = createMockTask({ title: 'Create branch for epic-1', assignedAgent: 'git', status: 'in-progress', githubIssueNumber: 10, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await (agent as unknown as GitAgentPrivate).executeTask(task);

    expect(result.success).toBe(true);
    expect(result.data?.branchName).toBe('epic/epic-1');
    expect(gitService.createBranch).toHaveBeenCalledWith('epic/epic-1');
  });

  it('handles duplicate branch gracefully', async () => {
    (gitService.createBranch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Reference already exists'),
    );

    const task = createMockTask({ title: 'Create branch for epic-1', assignedAgent: 'git', status: 'in-progress', githubIssueNumber: 10, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await (agent as unknown as GitAgentPrivate).executeTask(task);

    expect(result.success).toBe(true);
    expect(result.data?.alreadyExisted).toBe(true);
  });

  it('handles PR task and calls createPR', async () => {
    const task = createMockTask({
      title: '[GIT] Epic epic-1 PR',
      description: 'PR body',
      epicId: 'epic-1',
      assignedAgent: 'git',
      status: 'in-progress',
      githubIssueNumber: 10,
      boardColumn: 'In Progress',
    });
    // title contains 'pr' → detected as PR task
    const result = await (agent as unknown as GitAgentPrivate).executeTask(task);

    expect(result.success).toBe(true);
    expect(result.data?.prNumber).toBe(42);
    expect(gitService.createPR).toHaveBeenCalledWith(
      'Epic epic-1 PR',
      'PR body',
      'epic/epic-1',
      'main',
    );
  });

  it('handles duplicate PR gracefully', async () => {
    (gitService.createPR as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('A pull request already exists for this branch'),
    );

    const task = createMockTask({ title: '[GIT] PR for epic', epicId: 'epic-2', assignedAgent: 'git', status: 'in-progress', githubIssueNumber: 10, boardColumn: 'In Progress' });
    const result = await (agent as unknown as GitAgentPrivate).executeTask(task);

    expect(result.success).toBe(true);
    expect(result.data?.alreadyExisted).toBe(true);
  });

  it('returns error for unknown task type', async () => {
    const task = createMockTask({ title: 'do something random', assignedAgent: 'git', status: 'in-progress', githubIssueNumber: 10, boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = await (agent as unknown as GitAgentPrivate).executeTask(task);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Unknown git task type');
  });

  // ===== onTaskComplete (BaseAgent 기본: Review 컬럼 → review.request) =====

  it('moves issue to Review on success (Director review 대기)', async () => {
    const task = createMockTask({ id: 'task-1', githubIssueNumber: 10, assignedAgent: 'git', status: 'in-progress', boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = { success: true, artifacts: [] };

    await (agent as unknown as GitAgentPrivate).onTaskComplete(task, result);

    expect(gitService.moveIssueToColumn).toHaveBeenCalledWith(10, 'Review');
    expect(stateStore.updateTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        status: 'review',
        boardColumn: 'Review',
      }),
    );
    // review.request 메시지 발행 확인
    expect(deps.messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'review.request',
        from: 'git',
        payload: expect.objectContaining({ taskId: 'task-1' }),
      }),
    );
  });

  it('moves issue to Failed on failure', async () => {
    const task = createMockTask({ id: 'task-1', githubIssueNumber: 10, assignedAgent: 'git', status: 'in-progress', boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = { success: false, error: { message: 'oops' }, artifacts: [] };

    await (agent as unknown as GitAgentPrivate).onTaskComplete(task, result);

    expect(gitService.moveIssueToColumn).toHaveBeenCalledWith(10, 'Failed');
    expect(stateStore.updateTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        status: 'failed',
        boardColumn: 'Failed',
      }),
    );
  });

  it('skips board move when no githubIssueNumber', async () => {
    const task = createMockTask({ id: 'task-1', githubIssueNumber: null, assignedAgent: 'git', status: 'in-progress', boardColumn: 'In Progress', epicId: 'epic-1' });
    const result = { success: true, artifacts: [] };

    await (agent as unknown as GitAgentPrivate).onTaskComplete(task, result);

    expect(gitService.moveIssueToColumn).not.toHaveBeenCalled();
    expect(stateStore.updateTask).toHaveBeenCalled();
  });

  // ===== extractBranchName =====

  it('generates branch name from epicId', () => {
    const task = createMockTask({ epicId: 'auth-system', assignedAgent: 'git', status: 'in-progress', boardColumn: 'In Progress' });
    const name = (agent as unknown as GitAgentPrivate).extractBranchName(task);
    expect(name).toBe('epic/auth-system');
  });

  it('uses "feature" when epicId is null', () => {
    const task = createMockTask({ epicId: null, assignedAgent: 'git', status: 'in-progress', boardColumn: 'In Progress' });
    const name = (agent as unknown as GitAgentPrivate).extractBranchName(task);
    expect(name).toBe('epic/feature');
  });

  // ===== checkAndTriggerPR =====

  it('triggers PR issue when all code and commits are done', async () => {
    (gitService.getEpicIssues as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { issueNumber: 1, labels: ['agent:backend'], column: 'Done' },
      { issueNumber: 2, labels: ['type:commit'], column: 'Done' },
    ]);

    await (agent as unknown as GitAgentPrivate).checkAndTriggerPR('epic-1');

    expect(gitService.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: expect.arrayContaining(['agent:git', 'type:pr', 'epic:epic-1']),
      }),
    );
  });

  it('does not trigger PR when commits are not done', async () => {
    (gitService.getEpicIssues as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { issueNumber: 1, labels: ['agent:backend'], column: 'Done' },
      { issueNumber: 2, labels: ['type:commit'], column: 'In Progress' },
    ]);

    await (agent as unknown as GitAgentPrivate).checkAndTriggerPR('epic-1');

    expect(gitService.createIssue).not.toHaveBeenCalled();
  });

  it('does not trigger PR when one already exists', async () => {
    (gitService.getEpicIssues as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { issueNumber: 1, labels: ['agent:backend'], column: 'Done' },
      { issueNumber: 2, labels: ['type:commit'], column: 'Done' },
      { issueNumber: 3, labels: ['type:pr'], column: 'In Progress' },
    ]);

    await (agent as unknown as GitAgentPrivate).checkAndTriggerPR('epic-1');

    expect(gitService.createIssue).not.toHaveBeenCalled();
  });
});
