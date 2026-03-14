import {
  type AgentFactory,
  type AppConfig,
  type IClaudeClient,
  ClaudeClient,
  ClaudeCliClient,
  LocalModelClient,
  DEFAULT_CLAUDE_MODEL,
} from '@agent/core';
import { DirectorAgent } from '@agent/director';
import { GitAgent } from '@agent/git';
import { BackendAgent } from '@agent/backend';
import { FrontendAgent } from '@agent/frontend';
import { DocsAgent } from '@agent/docs';

/**
 * Claude 클라이언트를 생성한다.
 * USE_CLAUDE_CLI=true 또는 ANTHROPIC_API_KEY 미설정 시 Claude Code CLI 사용.
 */
function createClaudeClient(config: AppConfig, overrides?: { maxTokens?: number; temperature?: number }): IClaudeClient {
  const model = DEFAULT_CLAUDE_MODEL;
  const maxTokens = overrides?.maxTokens ?? 16384;
  const temperature = overrides?.temperature ?? 0.2;

  // 우선순위: 로컬 모델 > Claude CLI > Anthropic API
  if (config.localModel.enabled) {
    return new LocalModelClient({
      baseUrl: config.localModel.baseUrl,
      model: config.localModel.model,
      apiKey: config.localModel.apiKey,
      maxTokens,
      temperature,
    });
  }
  if (config.claude.useCli) {
    return new ClaudeCliClient({ model, maxTokens, temperature });
  }
  return new ClaudeClient({ model, maxTokens, temperature }, config.claude.apiKey);
}

/**
 * 모든 에이전트의 factory 함수를 정의한다.
 * bootstrap()에 주입하여 패키지 간 의존성을 core에서 분리한다.
 *
 * AppConfig를 통해 환경변수를 DI로 받는다 (process.env 직접 참조 없음).
 */
export function createAgentFactories(config: AppConfig): Record<string, AgentFactory> {
  const { workDir } = config.workspace;
  const { token: githubToken, owner: githubOwner, repo: githubRepo } = config.github;

  return {
    director: (deps) => new DirectorAgent(deps, {
      claudeClient: createClaudeClient(config, { maxTokens: 16384, temperature: 0.3 }),
    }),

    git: (deps) => new GitAgent(deps, { workDir, githubToken, githubOwner, githubRepo }),

    backend: (deps) => new BackendAgent(deps, {
      workDir,
      claudeClient: createClaudeClient(config),
    }),

    frontend: (deps) => new FrontendAgent(deps, {
      workDir,
      claudeClient: createClaudeClient(config),
    }),

    docs: (deps) => new DocsAgent(deps, {
      workDir,
      claudeClient: createClaudeClient(config),
    }),
  };
}
