import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookRegistry } from './hook-registry.js';

function createMockStateStore() {
  return {
    upsertHook: vi.fn().mockResolvedValue(undefined),
    getHook: vi.fn().mockResolvedValue({ id: 'test', event: 'test.event', name: 'Test', description: null, enabled: true, createdAt: new Date() }),
    toggleHook: vi.fn().mockResolvedValue(undefined),
  };
}

describe('HookRegistry', () => {
  let registry: HookRegistry;
  let mockStore: ReturnType<typeof createMockStateStore>;

  beforeEach(() => {
    mockStore = createMockStateStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry = new HookRegistry(mockStore as any);
  });

  it('registers a hook and persists to DB', async () => {
    const handler = vi.fn();
    await registry.register(
      { id: 'test-hook', event: 'task.completed', name: 'Test Hook', description: 'A test', enabled: true },
      handler,
    );

    expect(mockStore.upsertHook).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'test-hook', event: 'task.completed' }),
    );
    expect(registry.getRegisteredHookIds()).toContain('test-hook');
  });

  it('dispatches event to matching enabled hooks', async () => {
    const handler = vi.fn();
    await registry.register(
      { id: 'h1', event: 'task.done', name: 'H1', description: null, enabled: true },
      handler,
    );
    mockStore.getHook.mockResolvedValueOnce({ id: 'h1', event: 'task.done', name: 'H1', description: null, enabled: true, createdAt: new Date() });

    await registry.dispatch('task.done', { taskId: 'task-1' });
    expect(handler).toHaveBeenCalledWith({ taskId: 'task-1' });
  });

  it('does not dispatch to disabled hooks', async () => {
    const handler = vi.fn();
    await registry.register(
      { id: 'h2', event: 'task.done', name: 'H2', description: null, enabled: true },
      handler,
    );
    mockStore.getHook.mockResolvedValueOnce({ id: 'h2', event: 'task.done', name: 'H2', description: null, enabled: false, createdAt: new Date() });

    await registry.dispatch('task.done', { taskId: 'task-1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not dispatch to hooks with different event', async () => {
    const handler = vi.fn();
    await registry.register(
      { id: 'h3', event: 'task.done', name: 'H3', description: null, enabled: true },
      handler,
    );

    await registry.dispatch('task.failed', { taskId: 'task-1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('setEnabled calls stateStore.toggleHook', async () => {
    await registry.setEnabled('h1', false);
    expect(mockStore.toggleHook).toHaveBeenCalledWith('h1', false);
  });

  it('handles handler errors without throwing', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    await registry.register(
      { id: 'h4', event: 'task.err', name: 'H4', description: null, enabled: true },
      handler,
    );
    mockStore.getHook.mockResolvedValueOnce({ id: 'h4', event: 'task.err', name: 'H4', description: null, enabled: true, createdAt: new Date() });

    // Should not throw
    await registry.dispatch('task.err', { taskId: 'task-1' });
    expect(handler).toHaveBeenCalled();
  });
});
