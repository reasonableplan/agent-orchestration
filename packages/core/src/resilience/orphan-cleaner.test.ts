import { describe, it, expect, vi, afterEach } from 'vitest';
import { OrphanCleaner } from './orphan-cleaner.js';
import type { IStateStore, AgentRow, TaskRow } from '../types/index.js';
import { createMockStateStore } from '@agent/testing';

function makeStateStore(
  agents: AgentRow[] = [],
  inProgressTasks: TaskRow[] = [],
): IStateStore {
  return createMockStateStore({
    getAllAgents: vi.fn().mockResolvedValue(agents),
    getTasksByColumn: vi.fn().mockResolvedValue(inProgressTasks),
  });
}

describe('OrphanCleaner', () => {
  let cleaner: OrphanCleaner;
  let store: IStateStore;

  afterEach(() => {
    cleaner.stop();
  });

  it('returns 0 when no stale agents exist', async () => {
    store = makeStateStore(
      [{ id: 'backend', status: 'idle', lastHeartbeat: new Date() } as AgentRow],
    );
    cleaner = new OrphanCleaner(store, { heartbeatTimeoutMs: 60_000 });

    const restored = await cleaner.cleanup();
    expect(restored).toBe(0);
    expect(store.getTasksByColumn).not.toHaveBeenCalled();
  });

  it('restores orphan tasks from stale agents to Ready', async () => {
    const staleHeartbeat = new Date(Date.now() - 120_000);
    store = makeStateStore(
      [{ id: 'backend', status: 'idle', lastHeartbeat: staleHeartbeat } as AgentRow],
      [
        { id: 'task-1', title: 'API endpoint', assignedAgent: 'backend', boardColumn: 'In Progress' } as TaskRow,
        { id: 'task-2', title: 'Other task', assignedAgent: 'frontend', boardColumn: 'In Progress' } as TaskRow,
      ],
    );
    cleaner = new OrphanCleaner(store, { heartbeatTimeoutMs: 60_000 });

    const restored = await cleaner.cleanup();

    expect(restored).toBe(1);
    expect(store.updateTask).toHaveBeenCalledWith('task-1', expect.objectContaining({
      status: 'ready',
      boardColumn: 'Ready',
    }));
    expect(store.updateTask).not.toHaveBeenCalledWith('task-2', expect.anything());
    expect(store.updateAgentStatus).toHaveBeenCalledWith('backend', 'error');
  });

  it('treats agents with no heartbeat as stale', async () => {
    store = makeStateStore(
      [{ id: 'git', status: 'idle', lastHeartbeat: null } as unknown as AgentRow],
      [{ id: 'task-3', title: 'Branch task', assignedAgent: 'git', boardColumn: 'In Progress' } as TaskRow],
    );
    cleaner = new OrphanCleaner(store, { heartbeatTimeoutMs: 60_000 });

    const restored = await cleaner.cleanup();
    expect(restored).toBe(1);
  });

  it('skips tasks assigned to healthy agents', async () => {
    store = makeStateStore(
      [{ id: 'backend', status: 'busy', lastHeartbeat: new Date() } as AgentRow],
    );
    cleaner = new OrphanCleaner(store, { heartbeatTimeoutMs: 60_000 });

    const restored = await cleaner.cleanup();
    expect(restored).toBe(0);
  });

  it('handles multiple stale agents at once', async () => {
    const staleHeartbeat = new Date(Date.now() - 120_000);
    store = makeStateStore(
      [
        { id: 'backend', status: 'idle', lastHeartbeat: staleHeartbeat } as AgentRow,
        { id: 'frontend', status: 'idle', lastHeartbeat: staleHeartbeat } as AgentRow,
      ],
      [
        { id: 'task-1', title: 'API', assignedAgent: 'backend', boardColumn: 'In Progress' } as TaskRow,
        { id: 'task-2', title: 'UI', assignedAgent: 'frontend', boardColumn: 'In Progress' } as TaskRow,
        { id: 'task-3', title: 'Docs', assignedAgent: 'docs', boardColumn: 'In Progress' } as TaskRow,
      ],
    );
    cleaner = new OrphanCleaner(store, { heartbeatTimeoutMs: 60_000 });

    const restored = await cleaner.cleanup();
    expect(restored).toBe(2);
  });

  it('start/stop manages timer', () => {
    vi.useFakeTimers();
    store = makeStateStore();
    cleaner = new OrphanCleaner(store);

    cleaner.start();
    cleaner.start(); // idempotent

    cleaner.stop();
    cleaner.stop(); // idempotent

    vi.useRealTimers();
  });

  it('skips tasks with no assignedAgent', async () => {
    const staleHeartbeat = new Date(Date.now() - 120_000);
    store = makeStateStore(
      [{ id: 'backend', status: 'idle', lastHeartbeat: staleHeartbeat } as AgentRow],
      [{ id: 'task-1', title: 'Unassigned', assignedAgent: null, boardColumn: 'In Progress' } as TaskRow],
    );
    cleaner = new OrphanCleaner(store, { heartbeatTimeoutMs: 60_000 });

    const restored = await cleaner.cleanup();
    expect(restored).toBe(0);
  });
});
