import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueManager } from '../issue-manager.js';
import type { GitHubContext } from '../types.js';
import type { ProjectSetup } from '../project-setup.js';
import type { BoardOperations } from '../board-operations.js';

vi.mock('../../resilience/api-retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

function createMockContext(): GitHubContext {
  return {
    octokit: {
      rest: {
        issues: {
          create: vi.fn(),
          update: vi.fn(),
          get: vi.fn(),
          createComment: vi.fn(),
          listForRepo: vi.fn(),
        },
      },
    } as unknown as GitHubContext['octokit'],
    graphqlWithAuth: vi.fn() as unknown as GitHubContext['graphqlWithAuth'],
    owner: 'test-owner',
    repo: 'test-repo',
  };
}

function createMockSetup(projectId: string | null = 'proj-123'): ProjectSetup {
  return { projectId } as ProjectSetup;
}

describe('IssueManager', () => {
  let ctx: GitHubContext;
  let setup: ProjectSetup;
  let manager: IssueManager;

  beforeEach(() => {
    ctx = createMockContext();
    setup = createMockSetup();
    manager = new IssueManager(ctx, setup);
  });

  describe('createIssue', () => {
    it('creates issue and adds to project', async () => {
      (ctx.octokit.rest.issues.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { number: 42, node_id: 'node-42' },
      });
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
        addProjectV2ItemById: { item: { id: 'item-42' } },
      });

      const result = await manager.createIssue({
        title: 'Test', body: 'Body', labels: ['bug'], dependencies: [],
      });

      expect(result).toBe(42);
      expect(ctx.octokit.rest.issues.create).toHaveBeenCalledWith({
        owner: 'test-owner', repo: 'test-repo',
        title: 'Test', body: 'Body', labels: ['bug'], milestone: undefined,
      });
      expect(ctx.graphqlWithAuth).toHaveBeenCalled(); // addIssueToProject
    });

    it('appends Dependencies section when deps exist', async () => {
      (ctx.octokit.rest.issues.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { number: 43, node_id: 'node-43' },
      });
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
        addProjectV2ItemById: { item: { id: 'item-43' } },
      });

      await manager.createIssue({
        title: 'T', body: 'B', labels: [], dependencies: [10, 20],
      });

      const callArgs = (ctx.octokit.rest.issues.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.body).toContain('### Dependencies');
      expect(callArgs.body).toContain('- #10');
      expect(callArgs.body).toContain('- #20');
    });

    it('skips project add when projectId is null', async () => {
      setup = createMockSetup(null);
      manager = new IssueManager(ctx, setup);

      (ctx.octokit.rest.issues.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { number: 44, node_id: 'node-44' },
      });

      await manager.createIssue({
        title: 'T', body: 'B', labels: [], dependencies: [],
      });

      expect(ctx.graphqlWithAuth).not.toHaveBeenCalled();
    });
  });

  describe('updateIssue', () => {
    it('updates only provided fields', async () => {
      (ctx.octokit.rest.issues.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await manager.updateIssue(42, { title: 'New Title' });

      expect(ctx.octokit.rest.issues.update).toHaveBeenCalledWith({
        owner: 'test-owner', repo: 'test-repo', issue_number: 42,
        title: 'New Title',
      });
    });

    it('updates multiple fields', async () => {
      (ctx.octokit.rest.issues.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await manager.updateIssue(42, { title: 'T', body: 'B', labels: ['bug'] });

      const args = (ctx.octokit.rest.issues.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.title).toBe('T');
      expect(args.body).toBe('B');
      expect(args.labels).toEqual(['bug']);
    });
  });

  describe('closeIssue', () => {
    it('closes issue via REST', async () => {
      (ctx.octokit.rest.issues.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await manager.closeIssue(42);

      expect(ctx.octokit.rest.issues.update).toHaveBeenCalledWith({
        owner: 'test-owner', repo: 'test-repo', issue_number: 42, state: 'closed',
      });
    });
  });

  describe('addComment', () => {
    it('creates comment via REST', async () => {
      (ctx.octokit.rest.issues.createComment as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await manager.addComment(42, 'Hello');

      expect(ctx.octokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner', repo: 'test-repo', issue_number: 42, body: 'Hello',
      });
    });
  });

  describe('getIssue', () => {
    it('fetches issue and resolves column', async () => {
      (ctx.octokit.rest.issues.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          number: 42, title: 'Test', body: 'Body', node_id: 'node-42',
          labels: [{ name: 'agent:git' }], assignee: { login: 'user1' },
        },
      });
      // getProjectItemId returns item
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          node: {
            items: {
              nodes: [{ id: 'item-42', content: { id: 'node-42' } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        })
        // getIssueColumn fieldValues query
        .mockResolvedValueOnce({
          node: {
            fieldValues: {
              nodes: [{ name: 'Review', field: { name: 'Status' } }],
            },
          },
        });

      const result = await manager.getIssue(42);

      expect(result.issueNumber).toBe(42);
      expect(result.column).toBe('Review');
      expect(result.generatedBy).toBe('git');
    });
  });

  describe('getIssuesByLabel', () => {
    it('uses boardOps batch path when available', async () => {
      const mockBoardOps = {
        getAllProjectItems: vi.fn().mockResolvedValue([
          { issueNumber: 1, title: 'A', labels: ['bug', 'epic:ep-1'], column: 'Ready', body: '', dependencies: [], assignee: null, generatedBy: 'unknown', epicId: 'ep-1' },
          { issueNumber: 2, title: 'B', labels: ['feature'], column: 'Done', body: '', dependencies: [], assignee: null, generatedBy: 'unknown', epicId: null },
        ]),
      } as unknown as BoardOperations;
      manager.setBoardOperations(mockBoardOps);

      const result = await manager.getIssuesByLabel('bug');

      expect(result).toHaveLength(1);
      expect(result[0].issueNumber).toBe(1);
      expect(mockBoardOps.getAllProjectItems).toHaveBeenCalled();
    });

    it('uses REST fallback when boardOps not set', async () => {
      (ctx.octokit.rest.issues.listForRepo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [
          { number: 1, title: 'A', body: '', node_id: 'n1', labels: [{ name: 'bug' }], assignee: null },
        ],
      });
      // getProjectItemId → returns null (not on board)
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const result = await manager.getIssuesByLabel('bug');

      expect(result).toHaveLength(1);
      expect(result[0].column).toBe('Backlog'); // default when not on board
    });

    it('skips pull requests in REST fallback', async () => {
      (ctx.octokit.rest.issues.listForRepo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [
          { number: 1, title: 'Issue', body: '', node_id: 'n1', labels: [], assignee: null },
          { number: 2, title: 'PR', body: '', node_id: 'n2', labels: [], assignee: null, pull_request: { url: '...' } },
        ],
      });
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
        node: {
          items: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      });

      const result = await manager.getIssuesByLabel('any');
      expect(result).toHaveLength(1);
      expect(result[0].issueNumber).toBe(1);
    });
  });

  describe('getEpicIssues', () => {
    it('delegates to getIssuesByLabel with epic: prefix', async () => {
      const mockBoardOps = {
        getAllProjectItems: vi.fn().mockResolvedValue([
          { issueNumber: 1, labels: ['epic:ep-1'], column: 'Ready', title: '', body: '', dependencies: [], assignee: null, generatedBy: 'unknown', epicId: 'ep-1' },
        ]),
      } as unknown as BoardOperations;
      manager.setBoardOperations(mockBoardOps);

      const result = await manager.getEpicIssues('ep-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('addIssueToProject', () => {
    it('calls GraphQL addProjectV2ItemById mutation', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
        addProjectV2ItemById: { item: { id: 'item-new' } },
      });

      const result = await manager.addIssueToProject('node-123');

      expect(result).toBe('item-new');
      expect(ctx.graphqlWithAuth).toHaveBeenCalledWith(
        expect.stringContaining('addProjectV2ItemById'),
        expect.objectContaining({ projectId: 'proj-123', contentId: 'node-123' }),
      );
    });
  });

  describe('getProjectItemId', () => {
    it('finds item by content ID', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [
              { id: 'item-a', content: { id: 'other-node' } },
              { id: 'item-b', content: { id: 'target-node' } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const result = await manager.getProjectItemId('target-node');
      expect(result).toBe('item-b');
    });

    it('returns null when not found', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [{ id: 'item-a', content: { id: 'other' } }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const result = await manager.getProjectItemId('missing-node');
      expect(result).toBeNull();
    });

    it('returns null when node is null', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: null,
      });

      const result = await manager.getProjectItemId('any');
      expect(result).toBeNull();
    });

    it('paginates to find item on later page', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          node: {
            items: {
              nodes: [{ id: 'item-a', content: { id: 'other' } }],
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
            },
          },
        })
        .mockResolvedValueOnce({
          node: {
            items: {
              nodes: [{ id: 'item-b', content: { id: 'target' } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });

      const result = await manager.getProjectItemId('target');
      expect(result).toBe('item-b');
      expect(ctx.graphqlWithAuth).toHaveBeenCalledTimes(2);
    });
  });

  describe('getIssueColumn', () => {
    it('returns column from Status field', async () => {
      // getProjectItemId
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          node: {
            items: {
              nodes: [{ id: 'item-1', content: { id: 'node-1' } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        })
        // fieldValues query
        .mockResolvedValueOnce({
          node: {
            fieldValues: {
              nodes: [{ name: 'In Progress', field: { name: 'Status' } }],
            },
          },
        });

      const result = await manager.getIssueColumn('node-1');
      expect(result).toBe('In Progress');
    });

    it('returns Backlog when item not found on board', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        node: {
          items: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const result = await manager.getIssueColumn('missing-node');
      expect(result).toBe('Backlog');
    });

    it('returns Backlog when fieldValues has no Status field', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          node: {
            items: {
              nodes: [{ id: 'item-1', content: { id: 'node-1' } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        })
        .mockResolvedValueOnce({
          node: {
            fieldValues: {
              nodes: [{ name: 'High', field: { name: 'Priority' } }],
            },
          },
        });

      const result = await manager.getIssueColumn('node-1');
      expect(result).toBe('Backlog');
    });

    it('returns Backlog when node.fieldValues is null', async () => {
      (ctx.graphqlWithAuth as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          node: {
            items: {
              nodes: [{ id: 'item-1', content: { id: 'node-1' } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        })
        .mockResolvedValueOnce({
          node: null,
        });

      const result = await manager.getIssueColumn('node-1');
      expect(result).toBe('Backlog');
    });
  });
});
