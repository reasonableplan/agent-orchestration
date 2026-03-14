# 프롬프트 시스템 아키텍처

## 개요

에이전트의 LLM 호출에 사용되는 시스템/유저 프롬프트를 파일 기반으로 관리합니다. 코드에 하드코딩된 프롬프트 대신 마크다운 파일을 로드하여 유지보수성과 커스터마이징을 높입니다.

## 디렉토리 구조

```
prompts/
├── shared/              # 모든 에이전트 공통
│   ├── code-style.md    # 코딩 스타일 가이드
│   └── review-criteria.md  # 코드 리뷰 기준
├── director/            # Director 에이전트 전용
│   ├── system.md        # 시스템 프롬프트
│   └── task-analysis.md # 태스크 분석 지침
├── backend/             # Backend 에이전트 전용
│   └── system.md
├── frontend/            # Frontend 에이전트 전용
│   └── system.md
├── docs/                # Docs 에이전트 전용
│   └── system.md
└── git/                 # Git 에이전트 전용
    └── system.md
```

## PromptLoader

`packages/core/src/llm/prompt-loader.ts`에 구현된 싱글톤 클래스.

### 주요 API

```typescript
// 싱글톤 획득
const loader = getPromptLoader(promptsDir?);

// 에이전트별 프롬프트 로드 (shared + agent-specific 결합)
const prompt = await loader.loadAgentPrompt('backend');
// → shared/*.md 내용 + backend/*.md 내용이 결합된 문자열

// 개별 파일 로드
const style = await loader.loadFile('shared/code-style.md');

// 캐시 초기화
loader.clearCache();

// 싱글톤 리셋 (테스트용)
resetPromptLoader();
```

### 프롬프트 결합 순서

`loadAgentPrompt('backend')` 호출 시:

1. `prompts/shared/` 디렉토리의 모든 `.md` 파일을 알파벳순으로 로드
2. `prompts/backend/` 디렉토리의 모든 `.md` 파일을 알파벳순으로 로드
3. 두 결과를 `\n\n---\n\n` 구분자로 결합하여 반환

### 보안

- **경로 순회 방어**: `resolve()` + `startsWith(resolvedBase)` 검증
  - `../../../etc/passwd` 같은 경로 시도 시 에러 발생
- **ENOENT 전용 에러 처리**: 파일이 없으면 빈 문자열 반환, EACCES/EISDIR 등은 re-throw
- **싱글톤 경고**: 다른 `promptsDir`로 재호출 시 콘솔 경고 출력

### 캐싱

- 파일 내용은 메모리에 캐싱 (파일당 1회 디스크 읽기)
- `clearCache()`로 수동 초기화 가능
- 프로세스 재시작 시 자동 초기화

## 프롬프트 커스터마이징

### 새 프롬프트 파일 추가

1. `prompts/<agent>/` 디렉토리에 `.md` 파일 생성
2. 파일명은 알파벳순으로 로드되므로, 순서가 중요하면 `01-system.md`, `02-tools.md` 형식 사용
3. 코드 변경 없이 프롬프트 내용만 수정하여 에이전트 동작 조정 가능

### 공유 프롬프트 수정

`prompts/shared/` 의 파일을 수정하면 모든 에이전트에 반영됩니다.

### 프롬프트에서 사용자 입력 포함 시

보안을 위해 반드시 XML 딜리미터로 감싸야 합니다:

```typescript
const prompt = `다음 사용자 요청을 분석하세요:

<user_request>
${userInput}
</user_request>

위 요청에 대해 태스크를 생성하세요.`;
```

이는 프롬프트 인젝션 공격을 방어합니다.

## 통합 흐름

```
Agent.executeTask()
  → createClaudeClient()     # IClaudeClient 구현체 선택
  → PromptLoader.loadAgentPrompt()  # 프롬프트 파일 로드 + 결합
  → client.chat(systemPrompt, userPrompt)  # LLM 호출
  → extractJSON(response)    # 응답 파싱 (필요시)
```

## 테스트

`prompt-loader.test.ts` — 12개 테스트:
- 프롬프트 로드 및 결합
- 캐싱 동작
- 경로 순회 차단
- EISDIR 등 비정상 에러 전파
- 싱글톤 동작 및 리셋
