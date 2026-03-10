import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class GitCli {
  constructor(private githubToken?: string) {}

  async exec(cwd: string, ...args: string[]): Promise<{ stdout: string; stderr: string }> {
    const env = { ...process.env };

    // GITHUB_TOKEN 기반 HTTPS 인증 — git push 시 패스워드 프롬프트 방지
    if (this.githubToken) {
      env.GIT_ASKPASS = 'echo';
      env.GIT_TERMINAL_PROMPT = '0';
      // credential helper 대신 header로 토큰 주입
      return execFileAsync(
        'git',
        ['-c', `http.extraHeader=Authorization: Bearer ${this.githubToken}`, ...args],
        { cwd, env },
      );
    }

    return execFileAsync('git', args, { cwd, env });
  }
}
