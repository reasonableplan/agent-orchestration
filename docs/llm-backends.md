# LLM Backend 설정 가이드

이 프로젝트는 3가지 LLM 백엔드를 지원합니다. 모든 백엔드는 `IClaudeClient` 인터페이스를 구현하며, `createClaudeClient()` 팩토리에서 설정에 따라 자동 선택됩니다.

## 백엔드 비교

| 백엔드 | 클래스 | 비용 | 품질 | 속도 | 오프라인 |
|--------|--------|------|------|------|----------|
| Anthropic API | `ClaudeClient` | API 크레딧 | 최고 | 빠름 | X |
| Claude Code CLI | `ClaudeCliClient` | Max 구독 (정액) | 최고 | 보통 | X |
| OpenAI-compat API | `LocalModelClient` | 무료 (로컬) / 저렴 (클라우드) | 모델 의존 | 모델 의존 | O (로컬) |

## 1. Anthropic API (기본)

`.env`:
```env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

- Anthropic 콘솔에서 API 키 발급: https://console.anthropic.com/
- 사용량에 따라 과금
- 가장 안정적인 옵션

## 2. Claude Code CLI

`.env`:
```env
USE_CLAUDE_CLI=true
# ANTHROPIC_API_KEY 불필요
```

- Claude Max/Pro 구독 필요 (정액제, API 크레딧 불필요)
- Claude Code CLI 설치 필요: `npm install -g @anthropic-ai/claude-code`
- 내부적으로 `claude` 명령을 subprocess로 실행
- `withRetry()` 래핑 (CLI 실패 시 자동 재시도)
- stdout/stderr 10MB 버퍼 제한

## 3. OpenAI-compatible API (로컬/클라우드)

### 3a. Ollama (로컬)

```bash
# Ollama 설치 후
ollama pull llama3.1
ollama serve  # http://localhost:11434
```

`.env`:
```env
USE_LOCAL_MODEL=true
LOCAL_MODEL_BASE_URL=http://localhost:11434/v1
LOCAL_MODEL_NAME=llama3.1
```

### 3b. LM Studio (로컬)

LM Studio에서 모델 다운로드 후 Local Server 시작.

`.env`:
```env
USE_LOCAL_MODEL=true
LOCAL_MODEL_BASE_URL=http://localhost:1234/v1
LOCAL_MODEL_NAME=local-model
```

### 3c. vLLM (로컬/서버)

```bash
python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3.1-70B-Instruct
```

`.env`:
```env
USE_LOCAL_MODEL=true
LOCAL_MODEL_BASE_URL=http://localhost:8000/v1
LOCAL_MODEL_NAME=meta-llama/Llama-3.1-70B-Instruct
```

### 3d. HuggingFace Inference API (클라우드)

`.env`:
```env
USE_LOCAL_MODEL=true
LOCAL_MODEL_BASE_URL=https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-70B-Instruct/v1
LOCAL_MODEL_NAME=tgi
LOCAL_MODEL_API_KEY=hf_...
```

- HuggingFace 토큰 발급: https://huggingface.co/settings/tokens
- Pro 구독 시 더 큰 모델 사용 가능

### 3e. OpenRouter (클라우드)

`.env`:
```env
USE_LOCAL_MODEL=true
LOCAL_MODEL_BASE_URL=https://openrouter.ai/api/v1
LOCAL_MODEL_NAME=meta-llama/llama-3.1-70b-instruct
LOCAL_MODEL_API_KEY=sk-or-...
```

- OpenRouter 키 발급: https://openrouter.ai/keys
- 다양한 모델을 단일 API로 접근

## 우선순위

`createClaudeClient()`는 다음 순서로 백엔드를 선택합니다:

1. `USE_LOCAL_MODEL=true` → `LocalModelClient`
2. `USE_CLAUDE_CLI=true` → `ClaudeCliClient`
3. 그 외 → `ClaudeClient` (ANTHROPIC_API_KEY 필수)

## 공통 기능

모든 백엔드가 `IClaudeClient` 인터페이스를 구현하므로 에이전트 코드 변경 없이 백엔드만 교체할 수 있습니다.

| 기능 | ClaudeClient | ClaudeCliClient | LocalModelClient |
|------|:---:|:---:|:---:|
| `chat()` | O | O | O |
| `chatJSON()` | O | O | O |
| `tokensUsed` | O | O | O |
| `tokenBudget` | O | O | O |
| `withRetry()` | O | O | O |
| JSON 추출 (`extractJSON`) | O | O | O |

## 모델 선택 가이드

| 용도 | 추천 |
|------|------|
| 프로덕션 (최고 품질) | Anthropic API 또는 Claude CLI |
| 개발/테스트 (비용 절약) | Ollama + llama3.1 |
| CI/CD (자동화) | Anthropic API |
| 오프라인 환경 | Ollama 또는 LM Studio |
| 다양한 모델 실험 | OpenRouter |
