import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { index, pgTable, text, integer, real, timestamp, jsonb, uuid, boolean } from 'drizzle-orm/pg-core';

// 에이전트 등록 및 상태 관리
export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  level: integer('level').notNull().default(2),
  status: text('status').notNull().default('idle'),
  parentId: text('parent_id').references((): AnyPgColumn => agents.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastHeartbeat: timestamp('last_heartbeat'),
});

// 에픽 (대규모 기능 단위)
export const epics = pgTable('epics', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'),
  githubMilestoneNumber: integer('github_milestone_number'),
  progress: real('progress').notNull().default(0.0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

// 태스크 (Board 이슈와 1:1 매핑)
export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    epicId: text('epic_id').references(() => epics.id),
    title: text('title').notNull(),
    description: text('description'),
    assignedAgent: text('assigned_agent').references(() => agents.id),
    status: text('status').notNull().default('backlog'),
    githubIssueNumber: integer('github_issue_number'),
    boardColumn: text('board_column').notNull().default('Backlog'),
    priority: integer('priority').notNull().default(3),
    complexity: text('complexity').default('medium'),
    dependencies: jsonb('dependencies').default([]),
    labels: jsonb('labels').default([]),
    retryCount: integer('retry_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    reviewNote: text('review_note'),
  },
  (table) => [
    index('idx_tasks_board_column').on(table.boardColumn),
    index('idx_tasks_assigned_agent').on(table.assignedAgent),
    index('idx_tasks_epic_id').on(table.epicId),
    index('idx_tasks_status').on(table.status),
    index('idx_tasks_github_issue').on(table.githubIssueNumber),
  ],
);

// 에이전트 간 메시지 로그
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    fromAgent: text('from_agent').notNull(),
    toAgent: text('to_agent'),
    payload: jsonb('payload').notNull().default({}),
    traceId: text('trace_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    ackedAt: timestamp('acked_at'),
  },
  (table) => [
    index('idx_messages_type').on(table.type),
    index('idx_messages_trace_id').on(table.traceId),
  ],
);

// 에이전트 설정 (동적 변경 가능)
export const agentConfig = pgTable('agent_config', {
  agentId: text('agent_id').primaryKey().references(() => agents.id),
  claudeModel: text('claude_model').notNull().default('claude-sonnet-4-20250514'),
  maxTokens: integer('max_tokens').notNull().default(4096),
  temperature: real('temperature').notNull().default(0.7),
  tokenBudget: integer('token_budget').notNull().default(10_000_000),
  taskTimeoutMs: integer('task_timeout_ms').notNull().default(300_000),
  pollIntervalMs: integer('poll_interval_ms').notNull().default(10_000),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// 플러그인 훅 등록
export const hooks = pgTable('hooks', {
  id: text('id').primaryKey(),
  event: text('event').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 생성된 산출물 (파일) 추적
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id),
  filePath: text('file_path').notNull(),
  contentHash: text('content_hash').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => agents.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
