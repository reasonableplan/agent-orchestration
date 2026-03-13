import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateStore } from './state-store.js';

// Mock Database
function createMockDb() {
  const mockChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };

  return {
    insert: vi.fn().mockReturnValue(mockChain),
    select: vi.fn().mockReturnValue(mockChain),
    update: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
  };
}

describe('StateStore', () => {
  let store: StateStore;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    store = new StateStore(mockDb as unknown as ConstructorParameters<typeof StateStore>[0]);
  });

  describe('Agent operations', () => {
    it('registerAgent inserts agent', async () => {
      await store.registerAgent({
        id: 'git',
        domain: 'git',
        level: 2,
        status: 'idle',
      });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb._chain.values).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'git', domain: 'git' }),
      );
    });

    it('getAgent returns null when not found', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);
      const result = await store.getAgent('nonexistent');
      expect(result).toBeNull();
    });

    it('getAgent returns agent row when found', async () => {
      const agentRow = { id: 'git', domain: 'git', level: 2, status: 'idle' };
      mockDb._chain.where.mockResolvedValueOnce([agentRow]);
      const result = await store.getAgent('git');
      expect(result).toEqual(agentRow);
    });

    it('updateAgentStatus calls update', async () => {
      await store.updateAgentStatus('git', 'busy');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb._chain.set).toHaveBeenCalledWith({ status: 'busy' });
    });

    it('updateHeartbeat updates timestamp', async () => {
      await store.updateHeartbeat('git');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb._chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ lastHeartbeat: expect.any(Date) }),
      );
    });
  });

  describe('Task operations', () => {
    it('createTask inserts task', async () => {
      await store.createTask({
        id: 'task-001',
        title: 'Test task',
        boardColumn: 'Backlog',
        priority: 3,
        retryCount: 0,
      });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('getTask returns null when not found', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);
      const result = await store.getTask('nonexistent');
      expect(result).toBeNull();
    });

    it('updateTask calls update with partial', async () => {
      // Seed the select used for status transition validation
      mockDb._chain.where.mockResolvedValueOnce([{ status: 'in-progress' }]);
      await store.updateTask('task-001', { status: 'done', boardColumn: 'Done' });
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb._chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'done', boardColumn: 'Done' }),
      );
    });

    it('getReadyTasksForAgent queries by column and agent', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);
      const result = await store.getReadyTasksForAgent('git');
      expect(result).toEqual([]);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('claimTask returns true when row was updated (rowCount > 0)', async () => {
      mockDb._chain.where.mockResolvedValueOnce({ rowCount: 1 });
      const result = await store.claimTask('task-001');
      expect(result).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb._chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ boardColumn: 'In Progress', status: 'in-progress' }),
      );
    });

    it('claimTask returns false when row was not updated (rowCount 0)', async () => {
      mockDb._chain.where.mockResolvedValueOnce({ rowCount: 0 });
      const result = await store.claimTask('task-already-taken');
      expect(result).toBe(false);
    });
  });

  describe('Epic operations', () => {
    it('createEpic inserts epic', async () => {
      await store.createEpic({ id: 'epic-001', title: 'Test epic' });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('getEpic returns null when not found', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);
      const result = await store.getEpic('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('Message operations', () => {
    it('saveMessage inserts message row', async () => {
      await store.saveMessage({
        id: 'msg-001',
        type: 'board.move',
        from: 'git',
        to: null,
        payload: { test: true },
        traceId: 'trace-001',
        timestamp: new Date(),
      });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb._chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-001',
          type: 'board.move',
          fromAgent: 'git',
          toAgent: null,
        }),
      );
    });
  });

  describe('Artifact operations', () => {
    it('saveArtifact inserts artifact', async () => {
      await store.saveArtifact({
        taskId: 'task-001',
        filePath: 'src/index.ts',
        contentHash: 'abc123',
        createdBy: 'git',
      });
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('getAgentStats', () => {
    it('returns stats with defaults when no tasks', async () => {
      // The select chain returns aggregated row
      mockDb._chain.where.mockResolvedValueOnce([
        { totalTasks: 0, completedTasks: 0, failedTasks: 0, inProgressTasks: 0, totalRetries: 0, avgDurationMs: null },
      ]);
      const stats = await store.getAgentStats('backend');
      expect(stats).toMatchObject({
        agentId: 'backend',
        totalTasks: 0,
        completionRate: 0,
        avgDurationMs: null,
      });
    });

    it('calculates completion rate correctly', async () => {
      mockDb._chain.where.mockResolvedValueOnce([
        { totalTasks: 10, completedTasks: 7, failedTasks: 2, inProgressTasks: 1, totalRetries: 3, avgDurationMs: 5000 },
      ]);
      const stats = await store.getAgentStats('backend');
      expect(stats.completionRate).toBeCloseTo(0.7);
      expect(stats.avgDurationMs).toBe(5000);
      expect(stats.totalRetries).toBe(3);
    });
  });

  describe('getTaskHistory', () => {
    it('returns empty array when no messages', async () => {
      // getTaskHistory chain: select().from().where().orderBy().limit()
      // where needs to return chain (not resolve), limit is terminal
      mockDb._chain.where.mockReturnValueOnce(mockDb._chain);
      mockDb._chain.limit.mockResolvedValueOnce([]);
      const result = await store.getTaskHistory('task-001');
      expect(result).toEqual([]);
    });
  });

  describe('Agent config operations', () => {
    it('getAgentConfig returns null when not found', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);
      const result = await store.getAgentConfig('backend');
      expect(result).toBeNull();
    });

    it('upsertAgentConfig calls insert with onConflict', async () => {
      await store.upsertAgentConfig('backend', { claudeModel: 'claude-opus-4-20250514', maxTokens: 8192 });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb._chain.onConflictDoUpdate).toHaveBeenCalled();
    });
  });

  describe('Hook operations', () => {
    it('getAllHooks returns from DB', async () => {
      const hookData = [{ id: 'h1', event: 'test', name: 'Test', description: null, enabled: true, createdAt: new Date() }];
      // getAllHooks doesn't use where, mock the select chain
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockResolvedValueOnce(hookData),
      } as unknown as ReturnType<typeof mockDb.select>);
      const result = await store.getAllHooks();
      expect(result).toEqual(hookData);
    });

    it('toggleHook calls update', async () => {
      await store.toggleHook('h1', false);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb._chain.set).toHaveBeenCalledWith({ enabled: false });
    });
  });
});
