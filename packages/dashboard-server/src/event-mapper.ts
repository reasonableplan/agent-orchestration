import type { Message } from '@agent/core';
import { MESSAGE_TYPES } from '@agent/core';
import type { DashboardEvent, DashboardStateStore } from './types.js';

/**
 * Maps internal MessageBus events to DashboardEvents for the WebSocket clients.
 * Each mapper function returns zero or more DashboardEvents to broadcast.
 */
export class EventMapper {
  constructor(private stateStore: DashboardStateStore) {}

  /**
   * Convert an internal Message into DashboardEvents to broadcast.
   * Always returns the raw message-log event, plus type-specific events.
   */
  async map(message: Message): Promise<DashboardEvent[]> {
    const events: DashboardEvent[] = [];

    // Always emit the raw message log
    events.push({
      type: 'message',
      payload: {
        id: message.id,
        type: message.type,
        from: message.from,
        content: JSON.stringify(message.payload),
        timestamp: message.timestamp.toISOString(),
      },
    });

    // Type-specific mappings
    switch (message.type) {
      case MESSAGE_TYPES.AGENT_STATUS:
        events.push(...this.mapAgentStatus(message));
        break;

      case MESSAGE_TYPES.BOARD_MOVE:
        events.push(...(await this.mapBoardMove(message)));
        break;

      case MESSAGE_TYPES.REVIEW_REQUEST:
        events.push(...this.mapReviewRequest(message));
        break;

      case MESSAGE_TYPES.EPIC_PROGRESS:
        events.push(...this.mapEpicProgress(message));
        break;

      case MESSAGE_TYPES.BOARD_REMOVE:
        events.push(...this.mapBoardRemove(message));
        break;
    }

    return events;
  }

  private mapAgentStatus(message: Message): DashboardEvent[] {
    const payload = message.payload as { status: string; taskId?: string };
    const events: DashboardEvent[] = [
      {
        type: 'agent.status',
        payload: {
          agentId: message.from,
          status: payload.status,
          task: payload.taskId,
        },
      },
    ];

    // Generate bubble update for agent activity
    if (payload.status === 'busy' || payload.status === 'working') {
      events.push({
        type: 'agent.bubble',
        payload: {
          agentId: message.from,
          bubble: { content: 'Working...', type: 'working' },
        },
      });
    } else if (payload.status === 'idle') {
      events.push({
        type: 'agent.bubble',
        payload: {
          agentId: message.from,
          bubble: null,
        },
      });
    } else if (payload.status === 'error') {
      events.push({
        type: 'agent.bubble',
        payload: {
          agentId: message.from,
          bubble: { content: 'Error!', type: 'error' },
        },
      });
    }

    return events;
  }

  private async mapBoardMove(message: Message): Promise<DashboardEvent[]> {
    // board.move payload: { issueNumber, title, fromColumn, toColumn, labels }
    const payload = message.payload as {
      issueNumber: number;
      title: string;
      fromColumn: string;
      toColumn: string;
      labels: string[];
    };
    const taskId = `task-gh-${payload.issueNumber}`;
    const events: DashboardEvent[] = [];

    // Try to get the full task row for the board update
    const task = await this.stateStore.getTask(taskId);
    if (task) {
      events.push({
        type: 'task.update',
        payload: {
          ...task,
          taskId,
          boardColumn: payload.toColumn,
        },
      });
    }

    // Generate toast for task completion or failure
    if (payload.toColumn === 'Done') {
      events.push({
        type: 'toast',
        payload: {
          type: 'success',
          title: 'Task Completed',
          message: `"${payload.title}" moved to Done`,
        },
      });
    } else if (payload.toColumn === 'Failed') {
      events.push({
        type: 'toast',
        payload: {
          type: 'error',
          title: 'Task Failed',
          message: `"${payload.title}" moved to Failed`,
        },
      });
    }

    // Bubble update for the assigned agent
    if (task?.assignedAgent) {
      if (payload.toColumn === 'In Progress') {
        events.push({
          type: 'agent.bubble',
          payload: {
            agentId: task.assignedAgent,
            bubble: { content: payload.title, type: 'working' },
          },
        });
      } else if (payload.toColumn === 'Done' || payload.toColumn === 'Failed') {
        events.push({
          type: 'agent.bubble',
          payload: {
            agentId: task.assignedAgent,
            bubble: null,
          },
        });
      }
    }

    return events;
  }

  private mapReviewRequest(message: Message): DashboardEvent[] {
    const payload = message.payload as { taskId: string };
    return [
      {
        type: 'agent.status',
        payload: {
          agentId: message.from,
          status: 'reviewing',
          task: payload.taskId,
        },
      },
      {
        type: 'toast',
        payload: {
          type: 'info',
          title: 'Review Requested',
          message: `Agent ${message.from} submitted task ${payload.taskId} for review`,
        },
      },
    ];
  }

  private mapEpicProgress(message: Message): DashboardEvent[] {
    const payload = message.payload as { epicId: string; title: string; progress: number };
    return [
      {
        type: 'epic.progress',
        payload: {
          epicId: payload.epicId,
          title: payload.title,
          progress: payload.progress,
        },
      },
    ];
  }

  private mapBoardRemove(message: Message): DashboardEvent[] {
    const payload = message.payload as { issueNumber: number; lastColumn: string };
    return [
      {
        type: 'toast',
        payload: {
          type: 'info',
          title: 'Task Removed',
          message: `Issue #${payload.issueNumber} was removed from the board (was in ${payload.lastColumn})`,
        },
      },
    ];
  }
}
