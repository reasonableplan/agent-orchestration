import {
  BaseAgent,
  type AgentDependencies,
  type AgentConfig,
  type Task,
  type TaskResult,
  type Message,
  MESSAGE_TYPES,
} from '@agent/core';
import { ClaudeClient } from './claude-client.js';

export interface IClaudeClient {
  chatJSON<T>(systemPrompt: string, userMessage: string): Promise<{ data: T; usage: { inputTokens: number; outputTokens: number } }>;
}

export interface DirectorConfig {
  claudeApiKey?: string;
  /** 테스트용 ClaudeClient 주입. 지정하지 않으면 실제 API 클라이언트 생성. */
  claudeClient?: IClaudeClient;
}

/**
 * Director Agent (Level 0) — 시스템의 두뇌.
 *
 * 역할:
 * 1. 사용자 자연어 요청 → Epic + Task DAG 분해 (Planner)
 * 2. Task를 적절한 Agent에게 할당 (Dispatcher)
 * 3. Epic 진행률 추적 + 실패 재시도 (Monitor)
 * 4. Worker 결과물 검토 (Review)
 */
export class DirectorAgent extends BaseAgent {
  private claude: IClaudeClient;

  constructor(deps: AgentDependencies, directorConfig: DirectorConfig = {}) {
    const config: AgentConfig = {
      id: 'director',
      domain: 'orchestration',
      level: 0,
      claudeModel: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      temperature: 0.3,
      tokenBudget: 200_000,
    };
    super(config, deps);

    this.claude = directorConfig.claudeClient ?? new ClaudeClient(
      {
        model: config.claudeModel,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      },
      directorConfig.claudeApiKey,
    );

    // MessageBus 구독
    this.subscribe(MESSAGE_TYPES.REVIEW_REQUEST, (msg) => this.onReviewRequest(msg));
    this.subscribe(MESSAGE_TYPES.BOARD_MOVE, (msg) => this.onBoardMove(msg));
  }

  // ========== User Input Handler ==========

  /**
   * CLI/Dashboard에서 들어온 사용자 자연어 요청을 처리한다.
   * Claude를 사용하여 요청을 분석하고 적절한 액션을 결정한다.
   */
  async handleUserInput(content: string): Promise<string> {
    const systemPrompt = `You are the Director of a multi-agent software development system.
Your agents: backend (Express/Node.js), frontend (React/Vite), git (branch/commit/PR), docs (documentation).

When a user makes a request, analyze it and respond with a JSON action:

For new feature/project requests:
{"action": "create_epic", "title": "...", "description": "...", "tasks": [{"title": "...", "agent": "backend|frontend|git|docs", "description": "...", "dependencies": []}]}

For status inquiries:
{"action": "status_query", "query": "..."}

For clarification needed:
{"action": "clarify", "message": "..."}

Rules:
- Break work into small, specific tasks
- Each task should be assignable to exactly one agent domain
- Define dependencies between tasks (index-based, 0-indexed)
- Git tasks (branch creation) should come first, commit/PR tasks last
- Always include a docs task for significant features`;

    try {
      const { data, usage } = await this.claude.chatJSON<DirectorAction>(systemPrompt, content);
      console.log(`[Director] Claude usage: ${usage.inputTokens}in/${usage.outputTokens}out`);

      switch (data.action) {
        case 'create_epic':
          return await this.handleCreateEpic(data as CreateEpicAction);
        case 'status_query':
          return await this.handleStatusQuery(data as StatusQueryAction);
        case 'clarify':
          return (data as ClarifyAction).message;
        default:
          return `[Director] Unknown action: ${(data as { action: string }).action}`;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[Director] Failed to process input:', msg);
      return `[Director] Error processing request: ${msg}`;
    }
  }

  // ========== Epic Creation (Planner — Step 2에서 구현) ==========

  private async handleCreateEpic(action: CreateEpicAction): Promise<string> {
    // Step 2에서 구체적으로 구현: Epic 생성, Task DAG, Board Issue 일괄 생성
    const taskCount = action.tasks.length;
    console.log(`[Director] Planning epic: "${action.title}" with ${taskCount} tasks`);

    // Epic을 DB에 저장
    const epicId = crypto.randomUUID();
    await this.stateStore.createEpic({
      id: epicId,
      title: action.title,
      description: action.description,
      status: 'planning',
    });

    // Task를 Board에 Issue로 생성 + DB에 저장
    const createdIssues: number[] = [];
    for (let i = 0; i < action.tasks.length; i++) {
      const taskSpec = action.tasks[i];
      const depIssues = taskSpec.dependencies.map((idx) => createdIssues[idx]).filter(Boolean);

      const issueNumber = await this.gitService.createIssue({
        title: taskSpec.title,
        body: taskSpec.description,
        labels: [`agent:${taskSpec.agent}`, `epic:${epicId}`],
        dependencies: depIssues,
      });

      createdIssues.push(issueNumber);

      const taskId = `task-gh-${issueNumber}`;
      await this.stateStore.createTask({
        id: taskId,
        epicId,
        title: taskSpec.title,
        description: taskSpec.description,
        assignedAgent: taskSpec.agent,
        status: 'backlog',
        githubIssueNumber: issueNumber,
        boardColumn: 'Backlog',
        priority: 3,
        complexity: 'medium',
        dependencies: depIssues.map((n) => `task-gh-${n}`),
        retryCount: 0,
      });

      console.log(`[Director] Created issue #${issueNumber}: ${taskSpec.title} → ${taskSpec.agent}`);
    }

    // 의존성 없는 Task를 Ready로 이동
    let readyCount = 0;
    for (let i = 0; i < action.tasks.length; i++) {
      if (action.tasks[i].dependencies.length === 0) {
        await this.gitService.moveIssueToColumn(createdIssues[i], 'Ready');
        await this.stateStore.updateTask(`task-gh-${createdIssues[i]}`, {
          status: 'ready',
          boardColumn: 'Ready',
        });
        readyCount++;
      }
    }

    // Epic 상태 업데이트
    await this.stateStore.updateEpic(epicId, { status: 'active' });

    // Epic 진행률 브로드캐스트
    await this.messageBus.publish({
      id: crypto.randomUUID(),
      type: MESSAGE_TYPES.EPIC_PROGRESS,
      from: this.id,
      to: null,
      payload: { epicId, title: action.title, total: action.tasks.length, done: 0, ready: readyCount },
      traceId: crypto.randomUUID(),
      timestamp: new Date(),
    });

    return `Epic "${action.title}" created with ${action.tasks.length} tasks (${readyCount} ready).`;
  }

  // ========== Status Query ==========

  private async handleStatusQuery(_action: StatusQueryAction): Promise<string> {
    // 간단한 상태 조회 — SystemController.handleStatus()와 유사하지만 Epic 수준
    // Step 4에서 Claude 기반 자연어 응답으로 확장
    return '[Director] Status query support coming in Step 4.';
  }

  // ========== Board Move Handler (Dispatcher) ==========

  private async onBoardMove(msg: Message): Promise<void> {
    const payload = msg.payload as {
      issueNumber: number;
      title: string;
      fromColumn: string;
      toColumn: string;
      labels: string[];
    };

    // Task가 Done으로 이동했을 때, 후속 Task의 의존성을 확인하고 Ready로 승인
    if (payload.toColumn === 'Done') {
      await this.checkAndPromoteDependents(payload.issueNumber);
    }
  }

  /**
   * 완료된 Task의 후속 Task 중 모든 의존성이 충족된 것을 Ready로 승인한다.
   */
  private async checkAndPromoteDependents(completedIssueNumber: number): Promise<void> {
    const completedTaskId = `task-gh-${completedIssueNumber}`;

    // DB에서 Backlog 상태의 모든 Task를 조회
    const backlogTasks = await this.stateStore.getTasksByColumn('Backlog');

    for (const task of backlogTasks) {
      const deps = (task.dependencies as string[]) ?? [];
      if (!deps.includes(completedTaskId)) continue;

      // 이 Task의 모든 의존성이 Done인지 확인
      let allDepsDone = true;
      for (const depId of deps) {
        const depTask = await this.stateStore.getTask(depId);
        if (!depTask || depTask.boardColumn !== 'Done') {
          allDepsDone = false;
          break;
        }
      }

      if (allDepsDone && task.githubIssueNumber) {
        await this.gitService.moveIssueToColumn(task.githubIssueNumber, 'Ready');
        await this.stateStore.updateTask(task.id, {
          status: 'ready',
          boardColumn: 'Ready',
        });
        console.log(`[Director] Promoted to Ready: ${task.title} (all deps done)`);
      }
    }
  }

  // ========== Review Handler ==========

  private async onReviewRequest(msg: Message): Promise<void> {
    const payload = msg.payload as { taskId: string; result: TaskResult };
    console.log(`[Director] Review request for task: ${payload.taskId} (success: ${payload.result.success})`);

    // Step 4에서 Claude 기반 코드 리뷰로 확장
    // 현재는 자동 승인
    if (payload.result.success) {
      console.log(`[Director] Auto-approved task: ${payload.taskId}`);
    } else {
      // 실패 시 재시도 횟수 체크
      const task = await this.stateStore.getTask(payload.taskId);
      if (task && (task.retryCount ?? 0) < 3) {
        await this.stateStore.updateTask(payload.taskId, {
          retryCount: (task.retryCount ?? 0) + 1,
          status: 'ready',
          boardColumn: 'Ready',
        });
        if (task.githubIssueNumber) {
          await this.gitService.moveIssueToColumn(task.githubIssueNumber, 'Ready');
        }
        console.log(`[Director] Retrying task: ${payload.taskId} (attempt ${(task.retryCount ?? 0) + 1}/3)`);
      } else {
        console.error(`[Director] Task failed after max retries: ${payload.taskId}`);
      }
    }
  }

  // ========== BaseAgent: executeTask ==========

  /**
   * Director는 Board 기반 Task 실행보다는 MessageBus 이벤트 처리가 주 역할.
   * 하지만 Board에서 director에게 직접 할당된 Task가 있을 수 있다 (예: Epic 계획 요청).
   */
  protected async executeTask(task: Task): Promise<TaskResult> {
    console.log(`[Director] Processing task: ${task.title}`);

    try {
      const response = await this.handleUserInput(task.description || task.title);
      return {
        success: true,
        data: { response },
        artifacts: [],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: { message: msg },
        artifacts: [],
      };
    }
  }
}

// ========== Action Types ==========

interface CreateEpicAction {
  action: 'create_epic';
  title: string;
  description: string;
  tasks: Array<{
    title: string;
    agent: string;
    description: string;
    dependencies: number[];
  }>;
}

interface StatusQueryAction {
  action: 'status_query';
  query: string;
}

interface ClarifyAction {
  action: 'clarify';
  message: string;
}

type DirectorAction = CreateEpicAction | StatusQueryAction | ClarifyAction;
