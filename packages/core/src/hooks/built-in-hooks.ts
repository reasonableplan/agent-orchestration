import { HOOK_EVENTS } from '../types/index.js';
import type { IMessageBus, Message } from '../types/index.js';
import type { HookRegistry } from './hook-registry.js';
import { createLogger } from '../logging/logger.js';

const log = createLogger('BuiltInHooks');

/**
 * Register built-in hooks. These are default hooks that ship with the system.
 * Users can disable them via the dashboard.
 */
export async function registerBuiltInHooks(
  registry: HookRegistry,
  messageBus: IMessageBus,
): Promise<void> {
  // 1. Log task completion
  await registry.register(
    {
      id: 'log-task-complete',
      event: HOOK_EVENTS.TASK_COMPLETED,
      name: 'Log Task Completion',
      description: 'Logs a message when any task is completed successfully',
      enabled: true,
    },
    (payload) => {
      log.info({ taskId: payload.taskId, agent: payload.agentId }, 'Task completed');
    },
  );

  // 2. Toast on failure — broadcasts a toast event when a task fails
  await registry.register(
    {
      id: 'toast-on-failure',
      event: HOOK_EVENTS.TASK_FAILED,
      name: 'Toast on Failure',
      description: 'Broadcasts a toast notification when a task fails',
      enabled: true,
    },
    async (payload) => {
      const toastMessage: Message = {
        id: crypto.randomUUID(),
        type: 'dashboard.toast',
        from: 'hook-system',
        to: null,
        payload: {
          type: 'error',
          title: 'Task Failed (Hook)',
          message: `Task "${payload.taskTitle ?? payload.taskId}" failed — agent: ${payload.agentId ?? 'unknown'}`,
        },
        traceId: crypto.randomUUID(),
        timestamp: new Date(),
      };
      await messageBus.publish(toastMessage);
    },
  );

  // 3. Log agent errors
  await registry.register(
    {
      id: 'log-agent-error',
      event: HOOK_EVENTS.AGENT_ERROR,
      name: 'Log Agent Error',
      description: 'Logs agent errors for monitoring',
      enabled: true,
    },
    (payload) => {
      log.warn({ agentId: payload.agentId, error: payload.error }, 'Agent error detected');
    },
  );
}
