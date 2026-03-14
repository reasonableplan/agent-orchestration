import { describe, it, expect } from 'vitest';
import { extractJSON } from './json-extract.js';

describe('extractJSON', () => {
  it('extracts JSON from markdown code block with json tag', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(JSON.parse(extractJSON(input))).toEqual({ key: 'value' });
  });

  it('extracts JSON from markdown code block without tag', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(JSON.parse(extractJSON(input))).toEqual({ key: 'value' });
  });

  it('extracts JSON with CRLF line endings', () => {
    const input = '```json\r\n{"key": "value"}\r\n```';
    expect(JSON.parse(extractJSON(input))).toEqual({ key: 'value' });
  });

  it('extracts JSON object with preamble text', () => {
    const input = 'Here is the result:\n{"action": "create"}';
    expect(JSON.parse(extractJSON(input))).toEqual({ action: 'create' });
  });

  it('extracts JSON object with postamble text', () => {
    const input = '{"action": "create"}\nHope that helps!';
    expect(JSON.parse(extractJSON(input))).toEqual({ action: 'create' });
  });

  it('extracts JSON array', () => {
    const input = 'Results: [{"id": 1}, {"id": 2}]';
    expect(JSON.parse(extractJSON(input))).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('prefers array when it appears before object', () => {
    const input = '[1, 2] and {"a": 1}';
    expect(JSON.parse(extractJSON(input))).toEqual([1, 2]);
  });

  it('handles deeply nested JSON', () => {
    const input = '{"a": {"b": {"c": [1, {"d": true}]}}}';
    const result = JSON.parse(extractJSON(input));
    expect(result.a.b.c[1].d).toBe(true);
  });

  it('handles strings with escaped quotes', () => {
    const input = '{"msg": "he said \\"hello\\""}';
    expect(JSON.parse(extractJSON(input))).toEqual({ msg: 'he said "hello"' });
  });

  it('handles strings with braces inside', () => {
    const input = '{"code": "if (x) { return }"}';
    expect(JSON.parse(extractJSON(input))).toEqual({ code: 'if (x) { return }' });
  });

  it('returns raw text when no JSON found', () => {
    expect(extractJSON('no json here')).toBe('no json here');
  });

  it('returns trimmed text for whitespace-only input', () => {
    expect(extractJSON('  \n  ')).toBe('');
  });

  it('returns null for unbalanced JSON', () => {
    const input = 'prefix {"key": "value"';
    // extractBalancedJSON returns null, falls through to text.trim()
    expect(extractJSON(input)).toBe(input.trim());
  });
});
