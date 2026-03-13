import { describe, it, expect } from 'vitest';
import { parseDependencies, parseGeneratedBy, parseEpicId, toBoardIssue } from '../issue-parser.js';

describe('issue-parser', () => {
  // ===== parseDependencies =====
  describe('parseDependencies', () => {
    it('extracts issue numbers from Dependencies section', () => {
      const body = 'Some text\n\n### Dependencies\n- #10\n- #20\n- #30\n\n### Other';
      expect(parseDependencies(body)).toEqual([10, 20, 30]);
    });

    it('returns empty array when no Dependencies section', () => {
      expect(parseDependencies('No deps here')).toEqual([]);
      expect(parseDependencies('')).toEqual([]);
    });

    it('handles Dependencies at end of body (no trailing section)', () => {
      const body = '### Dependencies\n- #5\n- #15';
      expect(parseDependencies(body)).toEqual([5, 15]);
    });

    it('handles CRLF line endings', () => {
      const body = '### Dependencies\r\n- #42\r\n- #99\r\n\r\n### Next';
      expect(parseDependencies(body)).toEqual([42, 99]);
    });

    it('handles single dependency', () => {
      const body = '### Dependencies\n- #1';
      expect(parseDependencies(body)).toEqual([1]);
    });

    it('ignores non-matching lines in Dependencies section', () => {
      const body = '### Dependencies\nSome text\n- #7\nMore text\n- #8';
      expect(parseDependencies(body)).toEqual([7, 8]);
    });
  });

  // ===== parseGeneratedBy =====
  describe('parseGeneratedBy', () => {
    it('extracts agent name from agent: label', () => {
      expect(parseGeneratedBy(['bug', 'agent:backend', 'priority:high'])).toBe('backend');
    });

    it('returns first agent: label if multiple exist', () => {
      expect(parseGeneratedBy(['agent:git', 'agent:frontend'])).toBe('git');
    });

    it('returns "unknown" when no agent: label', () => {
      expect(parseGeneratedBy(['bug', 'enhancement'])).toBe('unknown');
    });

    it('returns "unknown" for empty labels', () => {
      expect(parseGeneratedBy([])).toBe('unknown');
    });
  });

  // ===== parseEpicId =====
  describe('parseEpicId', () => {
    it('extracts epic ID from epic: label', () => {
      expect(parseEpicId(['epic:ep-1', 'bug'])).toBe('ep-1');
    });

    it('returns first epic: label if multiple exist', () => {
      expect(parseEpicId(['epic:ep-1', 'epic:ep-2'])).toBe('ep-1');
    });

    it('returns null when no epic: label', () => {
      expect(parseEpicId(['bug', 'enhancement'])).toBeNull();
    });

    it('returns null for empty labels', () => {
      expect(parseEpicId([])).toBeNull();
    });
  });

  // ===== toBoardIssue =====
  describe('toBoardIssue', () => {
    it('converts full issue data to BoardIssue', () => {
      const issue = {
        number: 42,
        title: 'Test issue',
        body: 'Body text\n\n### Dependencies\n- #10',
        labels: [{ name: 'agent:backend' }, { name: 'epic:ep-1' }],
        assignee: { login: 'user1' },
      };

      const result = toBoardIssue(issue, 'In Progress');
      expect(result).toEqual({
        issueNumber: 42,
        title: 'Test issue',
        body: 'Body text\n\n### Dependencies\n- #10',
        labels: ['agent:backend', 'epic:ep-1'],
        column: 'In Progress',
        dependencies: [10],
        assignee: 'user1',
        generatedBy: 'backend',
        epicId: 'ep-1',
      });
    });

    it('handles null body', () => {
      const issue = { number: 1, title: 'T', body: null };
      const result = toBoardIssue(issue, 'Backlog');
      expect(result.body).toBe('');
      expect(result.dependencies).toEqual([]);
    });

    it('handles undefined body', () => {
      const issue = { number: 1, title: 'T' };
      const result = toBoardIssue(issue, 'Backlog');
      expect(result.body).toBe('');
    });

    it('handles missing labels', () => {
      const issue = { number: 1, title: 'T', body: '' };
      const result = toBoardIssue(issue, 'Backlog');
      expect(result.labels).toEqual([]);
      expect(result.generatedBy).toBe('unknown');
      expect(result.epicId).toBeNull();
    });

    it('handles null assignee', () => {
      const issue = { number: 1, title: 'T', body: '', assignee: null };
      const result = toBoardIssue(issue, 'Backlog');
      expect(result.assignee).toBeNull();
    });

    it('handles undefined assignee', () => {
      const issue = { number: 1, title: 'T', body: '' };
      const result = toBoardIssue(issue, 'Backlog');
      expect(result.assignee).toBeNull();
    });
  });
});
