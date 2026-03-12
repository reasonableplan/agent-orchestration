import type { HookRow } from '../types/index.js';
import type { StateStore } from '../state/state-store.js';
import { createLogger } from '../logging/logger.js';

const log = createLogger('HookRegistry');

export type HookHandler = (payload: Record<string, unknown>) => void | Promise<void>;

interface RegisteredHook {
  id: string;
  event: string;
  handler: HookHandler;
}

/**
 * Lightweight hook registry. Dispatches events to registered handlers
 * after checking enabled status in the DB.
 */
export class HookRegistry {
  private handlers = new Map<string, RegisteredHook>();

  constructor(private stateStore: StateStore) {}

  /**
   * Register a hook handler. Also persists the hook metadata to DB.
   */
  async register(hook: Omit<HookRow, 'createdAt'>, handler: HookHandler): Promise<void> {
    this.handlers.set(hook.id, {
      id: hook.id,
      event: hook.event,
      handler,
    });

    await this.stateStore.upsertHook({
      id: hook.id,
      event: hook.event,
      name: hook.name,
      description: hook.description,
      enabled: hook.enabled,
      createdAt: new Date(),
    });

    log.info({ hookId: hook.id, event: hook.event }, 'Hook registered');
  }

  /**
   * Dispatch an event to all matching enabled hooks.
   */
  async dispatch(event: string, payload: Record<string, unknown>): Promise<void> {
    for (const [, hook] of this.handlers) {
      if (hook.event !== event) continue;

      // Check DB for enabled status
      const dbHook = await this.stateStore.getHook(hook.id);
      if (!dbHook?.enabled) continue;

      try {
        await hook.handler(payload);
      } catch (err) {
        log.error({ err, hookId: hook.id, event }, 'Hook handler error');
      }
    }
  }

  /**
   * Toggle a hook's enabled status in DB.
   */
  async setEnabled(hookId: string, enabled: boolean): Promise<void> {
    await this.stateStore.toggleHook(hookId, enabled);
    log.info({ hookId, enabled }, 'Hook toggled');
  }

  /**
   * Get all registered hook IDs.
   */
  getRegisteredHookIds(): string[] {
    return Array.from(this.handlers.keys());
  }
}
