import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitOperations } from '../git-operations.js';
import type { GitHubContext } from '../types.js';

vi.mock('../../resilience/api-retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

function createMockContext(): GitHubContext {
  return {
    octokit: {
      rest: {
        git: {
          getRef: vi.fn(),
          createRef: vi.fn(),
        },
        pulls: {
          create: vi.fn(),
          list: vi.fn(),
        },
      },
    } as unknown as GitHubContext['octokit'],
    graphqlWithAuth: vi.fn() as unknown as GitHubContext['graphqlWithAuth'],
    owner: 'test-owner',
    repo: 'test-repo',
  };
}

describe('GitOperations', () => {
  let ctx: GitHubContext;
  let gitOps: GitOperations;

  beforeEach(() => {
    ctx = createMockContext();
    gitOps = new GitOperations(ctx);
  });

  describe('createBranch', () => {
    it('creates a branch from base branch SHA', async () => {
      (ctx.octokit.rest.git.getRef as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { object: { sha: 'abc123' } },
      });
      (ctx.octokit.rest.git.createRef as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await gitOps.createBranch('feature/test');

      expect(ctx.octokit.rest.git.getRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'heads/main',
      });
      expect(ctx.octokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'refs/heads/feature/test',
        sha: 'abc123',
      });
    });

    it('uses custom base branch', async () => {
      (ctx.octokit.rest.git.getRef as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { object: { sha: 'def456' } },
      });
      (ctx.octokit.rest.git.createRef as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await gitOps.createBranch('hotfix/urgent', 'develop');

      expect(ctx.octokit.rest.git.getRef).toHaveBeenCalledWith(
        expect.objectContaining({ ref: 'heads/develop' }),
      );
    });

    it('silently succeeds when branch already exists (422)', async () => {
      (ctx.octokit.rest.git.getRef as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { object: { sha: 'abc123' } },
      });
      (ctx.octokit.rest.git.createRef as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('422 Validation Failed: Reference already exists'),
      );

      await expect(gitOps.createBranch('existing-branch')).resolves.toBeUndefined();
    });

    it('throws non-422 errors', async () => {
      (ctx.octokit.rest.git.getRef as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { object: { sha: 'abc123' } },
      });
      (ctx.octokit.rest.git.createRef as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('500 Internal Server Error'),
      );

      await expect(gitOps.createBranch('fail-branch')).rejects.toThrow('500');
    });
  });

  describe('createPR', () => {
    it('creates a PR and returns its number', async () => {
      (ctx.octokit.rest.pulls.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { number: 99 },
      });

      const result = await gitOps.createPR('Title', 'Body', 'feature/x');

      expect(result).toBe(99);
      expect(ctx.octokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'Title',
        body: 'Body',
        head: 'feature/x',
        base: 'main',
      });
    });

    it('appends linked issues to body', async () => {
      (ctx.octokit.rest.pulls.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { number: 100 },
      });

      await gitOps.createPR('Title', 'Body', 'feature/x', 'main', [10, 20]);

      const callArgs = (ctx.octokit.rest.pulls.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.body).toContain('### Linked Issues');
      expect(callArgs.body).toContain('Closes #10');
      expect(callArgs.body).toContain('Closes #20');
    });

    it('does not add Linked Issues section when no linked issues', async () => {
      (ctx.octokit.rest.pulls.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { number: 101 },
      });

      await gitOps.createPR('Title', 'Body', 'feature/x');

      const callArgs = (ctx.octokit.rest.pulls.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.body).toBe('Body');
    });

    it('returns existing PR number on 422 (PR already exists)', async () => {
      (ctx.octokit.rest.pulls.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('A pull request already exists for test-owner:feature/x'),
      );
      (ctx.octokit.rest.pulls.list as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ number: 50 }],
      });

      const result = await gitOps.createPR('Title', 'Body', 'feature/x');

      expect(result).toBe(50);
      expect(ctx.octokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        head: 'test-owner:feature/x',
        base: 'main',
        state: 'open',
      });
    });

    it('re-throws 422 if no existing PR found', async () => {
      const error = new Error('422 already exists');
      (ctx.octokit.rest.pulls.create as ReturnType<typeof vi.fn>).mockRejectedValue(error);
      (ctx.octokit.rest.pulls.list as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await expect(gitOps.createPR('Title', 'Body', 'feature/x')).rejects.toThrow(error);
    });

    it('throws non-422 errors directly', async () => {
      (ctx.octokit.rest.pulls.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('500 Internal Server Error'),
      );

      await expect(gitOps.createPR('Title', 'Body', 'feature/x')).rejects.toThrow('500');
      expect(ctx.octokit.rest.pulls.list).not.toHaveBeenCalled();
    });

    it('uses custom base branch', async () => {
      (ctx.octokit.rest.pulls.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { number: 102 },
      });

      await gitOps.createPR('Title', 'Body', 'feature/x', 'develop');

      expect(ctx.octokit.rest.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({ base: 'develop' }),
      );
    });
  });
});
