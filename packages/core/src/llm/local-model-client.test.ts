import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalModelClient } from './local-model-client.js';

// fetch mock
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createOkResponse(content: string, promptTokens = 100, completionTokens = 50) {
  return {
    ok: true,
    json: () => Promise.resolve({
      id: 'chatcmpl-test',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    }),
  };
}

function createErrorResponse(status: number, text: string): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

describe('LocalModelClient', () => {
  let client: LocalModelClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new LocalModelClient({
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
      maxTokens: 4096,
      temperature: 0.2,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===== chat =====

  it('sends correct request to OpenAI-compatible API', async () => {
    mockFetch.mockResolvedValueOnce(createOkResponse('Hello world'));

    await client.chat('You are helpful.', 'Hi');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('llama3.1');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.2);
    expect(body.stream).toBe(false);
  });

  it('returns content and usage from response', async () => {
    mockFetch.mockResolvedValueOnce(createOkResponse('response text', 200, 100));

    const result = await client.chat('system', 'user');

    expect(result.content).toBe('response text');
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
  });

  it('tracks total token usage', async () => {
    mockFetch.mockResolvedValueOnce(createOkResponse('r1', 100, 50));
    mockFetch.mockResolvedValueOnce(createOkResponse('r2', 200, 100));

    await client.chat('s', 'u');
    await client.chat('s', 'u');

    expect(client.tokensUsed).toBe(450); // 150 + 300
  });

  it('handles missing usage in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'test',
        choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
        // no usage field
      }),
    });

    const result = await client.chat('s', 'u');
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('throws TokenBudgetError when budget exceeded', async () => {
    const budgetClient = new LocalModelClient({
      baseUrl: 'http://localhost:11434/v1',
      model: 'test',
      maxTokens: 1024,
      tokenBudget: 100,
    });

    mockFetch.mockResolvedValueOnce(createOkResponse('r', 80, 30));
    await budgetClient.chat('s', 'u'); // uses 110 tokens

    await expect(budgetClient.chat('s', 'u')).rejects.toThrow('Token budget exhausted');
  });

  // ===== chatJSON =====

  it('parses JSON from response', async () => {
    mockFetch.mockResolvedValueOnce(createOkResponse('{"action": "create_epic", "title": "test"}'));

    const result = await client.chatJSON<{ action: string; title: string }>('s', 'u');

    expect(result.data).toEqual({ action: 'create_epic', title: 'test' });
  });

  it('extracts JSON from markdown code block', async () => {
    mockFetch.mockResolvedValueOnce(createOkResponse('```json\n{"key": "value"}\n```'));

    const result = await client.chatJSON<{ key: string }>('s', 'u');
    expect(result.data).toEqual({ key: 'value' });
  });

  it('throws on invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce(createOkResponse('not json at all'));

    await expect(client.chatJSON('s', 'u')).rejects.toThrow('Failed to parse local model JSON response');
  });

  // ===== Error handling =====

  it('throws on HTTP error', async () => {
    // withRetry는 5xx를 재시도하므로 모든 시도에 대해 mock 설정
    mockFetch.mockResolvedValue(createErrorResponse(500, 'Internal server error'));

    await expect(client.chat('s', 'u')).rejects.toThrow('Local model API error 500');
  });

  it('strips trailing slash from baseUrl', async () => {
    const slashClient = new LocalModelClient({
      baseUrl: 'http://localhost:11434/v1/',
      model: 'test',
      maxTokens: 1024,
    });

    mockFetch.mockResolvedValueOnce(createOkResponse('ok'));
    await slashClient.chat('s', 'u');

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
  });

  // ===== Auth header (HuggingFace, OpenRouter) =====

  it('sends Authorization header when apiKey is set', async () => {
    const hfClient = new LocalModelClient({
      baseUrl: 'https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-70B-Instruct/v1',
      model: 'tgi',
      maxTokens: 4096,
      apiKey: 'hf_test_key_123',
    });

    mockFetch.mockResolvedValueOnce(createOkResponse('hello'));
    await hfClient.chat('system', 'user');

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer hf_test_key_123');
  });

  it('does not send Authorization header when apiKey is not set', async () => {
    mockFetch.mockResolvedValueOnce(createOkResponse('hello'));
    await client.chat('system', 'user');

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('handles empty choices gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'test',
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      }),
    });

    const result = await client.chat('s', 'u');
    expect(result.content).toBe('');
  });
});
