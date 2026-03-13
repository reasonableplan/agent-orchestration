import type { GitHubContext } from './types.js';
import { withRetry } from '../resilience/api-retry.js';

function is422(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('422') || msg.includes('already exists') || msg.includes('a pull request already exists');
}

export class GitOperations {
  private ctx: GitHubContext;

  constructor(ctx: GitHubContext) {
    this.ctx = ctx;
  }

  async createBranch(branchName: string, baseBranch = 'main'): Promise<void> {
    const { data: ref } = await withRetry(
      () =>
        this.ctx.octokit.rest.git.getRef({
          owner: this.ctx.owner,
          repo: this.ctx.repo,
          ref: `heads/${baseBranch}`,
        }),
      {},
      'getRef',
    );

    try {
      await withRetry(
        () =>
          this.ctx.octokit.rest.git.createRef({
            owner: this.ctx.owner,
            repo: this.ctx.repo,
            ref: `refs/heads/${branchName}`,
            sha: ref.object.sha,
          }),
        {},
        'createBranch',
      );
    } catch (err) {
      if (!is422(err)) throw err;
      // Branch already exists — treat as success
    }
  }

  async createPR(
    title: string,
    body: string,
    head: string,
    base = 'main',
    linkedIssues: number[] = [],
  ): Promise<number> {
    // Auto-link issues: "Closes #N" 키워드로 GitHub Development 섹션에 자동 연결
    let prBody = body;
    if (linkedIssues.length > 0) {
      const closingLinks = linkedIssues.map((n) => `Closes #${n}`).join('\n');
      prBody += `\n\n### Linked Issues\n${closingLinks}`;
    }

    try {
      const { data: pr } = await withRetry(
        () =>
          this.ctx.octokit.rest.pulls.create({
            owner: this.ctx.owner,
            repo: this.ctx.repo,
            title,
            body: prBody,
            head,
            base,
          }),
        {},
        'createPR',
      );
      return pr.number;
    } catch (err) {
      if (!is422(err)) throw err;
      // PR already exists — find and return the existing PR number
      const { data: prs } = await withRetry(
        () =>
          this.ctx.octokit.rest.pulls.list({
            owner: this.ctx.owner,
            repo: this.ctx.repo,
            head: `${this.ctx.owner}:${head}`,
            base,
            state: 'open',
          }),
        {},
        'listPRs (existing)',
      );
      if (prs.length > 0) return prs[0]!.number;
      throw err;
    }
  }
}
