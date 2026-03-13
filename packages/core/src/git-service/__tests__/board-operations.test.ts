import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoardOperations } from '../board-operations.js';
import type { GitHubContext } from '../types.js';
import type { ProjectSetup } from '../project-setup.js';
import type { IssueManager } from '../issue-manager.js';

vi.mock('../../resilience/api-retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

function createMockContext(): GitHubContext {
  return {
    octokit: {
      rest: {
        issues: { get: vi.fn() },
      },
    } as unknown as GitHubContext['octokit'],
    graphqlWithAuth: vi.fn() as unknown as GitHubContext['graphqlWithAuth'],
    owner: 'test-owner',
    repo: 'test-repo',
  };
}

function createMockSetup(overrides?: Partial<ProjectSetup>): ProjectSetup {
  const columnOptions = new Map([
    ['Backlog', 'opt-1'],
    ['Ready', 'opt-2'],
    ['In Progress', 'opt-3'],
    ['Done', 'opt-4'],
  ]);
  return {
    projectId: 'proj-123',
    columnFieldId: 'field-456',
    columnOptions,
    ...overrides,
  } as ProjectSetup;
}

function createMockIssueManager(): IssueManager {
  return {
    getProjectItemId: vi.fn(),
  } as unknown as IssueManager;
}

describe('BoardOperations', () => {
  let ctx: GitHubContext;
  let setup: ReturnType<typeof createMockSetup>;
  let issueManager: ReturnType<typeof createMockIssueManager>;
  let boardOps: BoardOperations;

  beforeEach(() => {
    ctx = createMockContext();
    setup = createMockSetup();
    issueManager = createMockIssueManager();
    boardOps = new BoardOperations(ctx, setup, issueManager);
  });

  describe('moveIssueToColumn', () => {
    it('throws when projectId is null', async () => {
      setup.projectId = null;
      await expect(boardOps.moveIssueToColumn(1, 'Done')).rejects.toThrow('projectId is null');
    });

    it('throws when columnFieldId is null', async () => {
      setup.columnFieldId = null;
      await expect(boardOps.moveIssueToColumn(1, 'Done')).rejects.toThrow('columnFieldId is null');
    });

    it('throws for unknown column', async () => {
      await expect(boardOps.moveIssueToColumn(1, 'NonExistent')).rejects.toThrow('Unknown column');
    });

    it('uses cache hit path and calls GraphQL mutation', async () => {
      // Pre-populate cache via getAllProjectItems
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [{
              id: 'item-1',
              content: {
                number: 42, title: 'Test', body: '',
                assignees: { nodes: [] },
                labels: { nodes: [] },
              },
              fieldValues: { nodes: [] },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      await boardOps.getAllProjectItems(); // populates cache

      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        updateProjectV2ItemFieldValue: { projectV2Item: { id: 'item-1' } },
      });

      await boardOps.moveIssueToColumn(42, 'Done');

      // Should NOT call REST issues.get (cache hit)
      expect(ctx.octokit.rest.issues.get).not.toHaveBeenCalled();
      // Should call GraphQL mutation
      expect(ctx.graphqlWithAuth).toHaveBeenLastCalledWith(
        expect.stringContaining('updateProjectV2ItemFieldValue'),
        expect.objectContaining({
          projectId: 'proj-123',
          itemId: 'item-1',
          fieldId: 'field-456',
          optionId: 'opt-4', // Done
        }),
      );
    });

    it('uses cache miss path: REST + getProjectItemId', async () => {
      (ctx.octokit.rest.issues.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { node_id: 'node-99' },
      });
      (issueManager.getProjectItemId as ReturnType<typeof vi.fn>).mockResolvedValue('item-99');
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
        updateProjectV2ItemFieldValue: { projectV2Item: { id: 'item-99' } },
      });

      await boardOps.moveIssueToColumn(99, 'Ready');

      expect(ctx.octokit.rest.issues.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 99,
      });
      expect(issueManager.getProjectItemId).toHaveBeenCalledWith('node-99');
    });

    it('throws when issue is not on project board (cache miss, no item ID)', async () => {
      (ctx.octokit.rest.issues.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { node_id: 'node-orphan' },
      });
      (issueManager.getProjectItemId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(boardOps.moveIssueToColumn(999, 'Done')).rejects.toThrow('not on the project board');
    });

    it('caches item ID after cache miss for subsequent calls', async () => {
      (ctx.octokit.rest.issues.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { node_id: 'node-50' },
      });
      (issueManager.getProjectItemId as ReturnType<typeof vi.fn>).mockResolvedValue('item-50');
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
        updateProjectV2ItemFieldValue: { projectV2Item: { id: 'item-50' } },
      });

      await boardOps.moveIssueToColumn(50, 'Ready');
      await boardOps.moveIssueToColumn(50, 'In Progress');

      // REST get should only be called once (second call uses cache)
      expect(ctx.octokit.rest.issues.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAllProjectItems', () => {
    it('throws when projectId is null', async () => {
      setup.projectId = null;
      await expect(boardOps.getAllProjectItems()).rejects.toThrow('projectId is null');
    });

    it('fetches single page of items', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [{
              id: 'item-1',
              content: {
                number: 1, title: 'Issue 1', body: 'Body\n\n### Dependencies\n- #5',
                assignees: { nodes: [{ login: 'user1' }] },
                labels: { nodes: [{ name: 'agent:backend' }, { name: 'epic:ep-1' }] },
              },
              fieldValues: {
                nodes: [{ name: 'In Progress', field: { name: 'Status' } }],
              },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const items = await boardOps.getAllProjectItems();

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        issueNumber: 1,
        title: 'Issue 1',
        body: 'Body\n\n### Dependencies\n- #5',
        labels: ['agent:backend', 'epic:ep-1'],
        column: 'In Progress',
        dependencies: [5],
        assignee: 'user1',
        generatedBy: 'backend',
        epicId: 'ep-1',
      });
    });

    it('handles pagination across multiple pages', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          node: {
            items: {
              nodes: [{
                id: 'item-1',
                content: {
                  number: 1, title: 'Page 1', body: '',
                  assignees: { nodes: [] },
                  labels: { nodes: [] },
                },
                fieldValues: { nodes: [] },
              }],
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
            },
          },
        })
        .mockResolvedValueOnce({
          node: {
            items: {
              nodes: [{
                id: 'item-2',
                content: {
                  number: 2, title: 'Page 2', body: '',
                  assignees: { nodes: [] },
                  labels: { nodes: [] },
                },
                fieldValues: { nodes: [] },
              }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });

      const items = await boardOps.getAllProjectItems();

      expect(items).toHaveLength(2);
      expect(ctx.graphqlWithAuth).toHaveBeenCalledTimes(2);
      // Second call should use cursor
      expect(ctx.graphqlWithAuth).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ cursor: 'cursor-1' }),
      );
    });

    it('skips items with null content', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [
              { id: 'item-1', content: null, fieldValues: { nodes: [] } },
              {
                id: 'item-2',
                content: {
                  number: 2, title: 'Valid', body: '',
                  assignees: { nodes: [] },
                  labels: { nodes: [] },
                },
                fieldValues: { nodes: [] },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const items = await boardOps.getAllProjectItems();
      expect(items).toHaveLength(1);
      expect(items[0].issueNumber).toBe(2);
    });

    it('defaults column to Backlog when no Status field', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [{
              id: 'item-1',
              content: {
                number: 1, title: 'T', body: '',
                assignees: { nodes: [] },
                labels: { nodes: [] },
              },
              fieldValues: { nodes: [{ name: 'SomeOther', field: { name: 'Priority' } }] },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const items = await boardOps.getAllProjectItems();
      expect(items[0].column).toBe('Backlog');
    });

    it('handles null assignees (no assignee)', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [{
              id: 'item-1',
              content: {
                number: 1, title: 'T', body: '',
                assignees: { nodes: [] },
                labels: { nodes: [] },
              },
              fieldValues: { nodes: [] },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const items = await boardOps.getAllProjectItems();
      expect(items[0].assignee).toBeNull();
    });

    it('throws when project node not found', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: null,
      });

      await expect(boardOps.getAllProjectItems()).rejects.toThrow('Project node not found');
    });

    it('atomically replaces item cache after full fetch', async () => {
      // First fetch populates cache
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [{
              id: 'item-old',
              content: {
                number: 1, title: 'Old', body: '',
                assignees: { nodes: [] },
                labels: { nodes: [] },
              },
              fieldValues: { nodes: [] },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      await boardOps.getAllProjectItems();

      // Second fetch with different items
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [{
              id: 'item-new',
              content: {
                number: 2, title: 'New', body: '',
                assignees: { nodes: [] },
                labels: { nodes: [] },
              },
              fieldValues: { nodes: [] },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      await boardOps.getAllProjectItems();

      // Now moveIssueToColumn for issue #1 should cache miss (old cache replaced)
      (ctx.octokit.rest.issues.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { node_id: 'node-1' },
      });
      (issueManager.getProjectItemId as ReturnType<typeof vi.fn>).mockResolvedValue('item-old');
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
        updateProjectV2ItemFieldValue: { projectV2Item: { id: 'item-old' } },
      });

      await boardOps.moveIssueToColumn(1, 'Done');
      // Should need REST fallback because issue #1 is no longer in cache
      expect(ctx.octokit.rest.issues.get).toHaveBeenCalled();
    });
  });
});
