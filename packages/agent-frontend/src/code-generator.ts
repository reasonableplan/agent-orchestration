import { BaseCodeGenerator, getPromptLoader } from '@agent/core';
import type { FrontendTaskType } from './task-router.js';

const OUTPUT_FORMAT = `
IMPORTANT: Respond with valid JSON only. No markdown, no explanation.
{
  "files": [
    {
      "path": "src/components/Example.tsx",
      "content": "// full file content here",
      "action": "create",
      "language": "typescriptreact"
    }
  ],
  "summary": "Brief description of what was generated"
}`;

/**
 * Claude API를 사용하여 프론트엔드 코드를 생성하는 엔진.
 * prompts/frontend.md + shared/* 프롬프트를 로드하여 시스템 프롬프트로 사용.
 */
export class CodeGenerator extends BaseCodeGenerator<FrontendTaskType> {
  private agentPrompt: string;

  constructor(claude: ConstructorParameters<typeof BaseCodeGenerator>[0], workDir?: string) {
    super(claude, workDir, 'FrontendCodeGen');
    this.agentPrompt = getPromptLoader().loadAgentPrompt('frontend');
  }

  protected buildSystemPrompt(taskType: FrontendTaskType): string {
    const base = this.agentPrompt + '\n\n' + OUTPUT_FORMAT;

    const typeSpecific: Record<string, string> = {
      'component.create': `\n\nGenerate a React component with:
- Component file (src/components/<Name>/<Name>.tsx) with props interface
- Test file (src/components/<Name>/<Name>.test.tsx) with Vitest + Testing Library
- Index file (src/components/<Name>/index.ts) for re-export`,

      'component.modify': `\n\nModify an existing React component. Update only the files that need changes.
Use action "update" for modified files.`,

      'page.create': `\n\nGenerate a page component with:
- Page file (src/pages/<Name>.tsx) with route-specific logic
- Route registration update (src/router.tsx, action: "update")
- Any required hooks for API integration`,

      'page.modify': `\n\nModify an existing page. Update only the affected files.`,

      'hook.create': `\n\nGenerate a custom React hook with:
- Hook file (src/hooks/use<Name>.ts) following React hooks conventions
- Test file (src/hooks/use<Name>.test.ts)
- Proper TypeScript typing for parameters and return values`,

      'store.create': `\n\nGenerate a Zustand store with:
- Store file (src/stores/use<Name>Store.ts) with typed state and actions
- Test file (src/stores/use<Name>Store.test.ts)
- Selectors for computed values if applicable`,

      'style.generate': `\n\nGenerate styling with Tailwind CSS:
- Utility classes directly in components
- Custom CSS only when Tailwind classes are insufficient`,

      'test.create': `\n\nGenerate test files with:
- Test file (src/__tests__/<target>.test.tsx) using Vitest + Testing Library
- Mock setup for external dependencies (API calls, stores)
- Cover happy path + error cases + edge cases`,

      analyze: `\n\nAnalyze the described frontend code and respond with:
- files: [] (empty — analysis produces no files)
- summary: detailed analysis results as a string`,
    };

    return base + (typeSpecific[taskType] ?? '');
  }
}
