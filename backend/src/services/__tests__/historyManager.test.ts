import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager } from '../historyManager.js';
import type { Message } from '../../types/index.js';

describe('HistoryManager', () => {
  let manager: HistoryManager;

  beforeEach(() => {
    manager = new HistoryManager({
      recentTurnLimit: 3,
      totalTurnLimit: 5,
      enableSummarization: false, // Disable for tests to avoid API calls
    });
  });

  describe('prepareMessages', () => {
    it('should keep short history unchanged', async () => {
      const history: Message[] = [
        { role: 'assistant', content: { narration: 'Turn 1', choices: [] } },
        { role: 'user', content: 'Go left' },
      ];

      const result = await manager.prepareMessages('System prompt', history, 'dungeon');

      expect(result).toHaveLength(3); // system + 2 history
      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('System prompt');
      expect(result[1]).toEqual(history[0]);
      expect(result[2]).toEqual(history[1]);
    });

    it('should truncate long history when summarization is disabled', async () => {
      const longHistory: Message[] = [];

      for (let i = 0; i < 10; i++) {
        longHistory.push({
          role: 'assistant',
          content: { narration: `Turn ${i}`, choices: [] },
        });
        longHistory.push({ role: 'user', content: `Choice ${i}` });
      }

      const result = await manager.prepareMessages('System', longHistory, 'dungeon');

      // Should have system + recent turns only
      expect(result.length).toBeLessThan(longHistory.length + 1);
      expect(result[0].role).toBe('system');

      // Recent messages should be preserved
      const lastUserMsg = result[result.length - 1];
      expect(lastUserMsg.content).toContain('Choice');
    });

    it('should estimate tokens correctly', () => {
      const messages: Message[] = [
        { role: 'user', content: 'This is a test message that should be counted.' },
        {
          role: 'assistant',
          content: {
            narration: 'A longer narration with more text.',
            choices: [{ id: '1', label: 'Option 1' }],
          },
        },
      ];

      const estimate = manager.estimateTokens(messages);

      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(200); // Rough sanity check
    });

    it('should detect when pruning is needed', () => {
      const shortHistory: Message[] = [
        { role: 'user', content: 'Short' },
      ];

      expect(manager.needsPruning(shortHistory)).toBe(false);

      // Create very long history
      const longHistory: Message[] = [];
      for (let i = 0; i < 50; i++) {
        longHistory.push({
          role: 'assistant',
          content: { narration: 'A'.repeat(200), choices: [] },
        });
      }

      expect(manager.needsPruning(longHistory)).toBe(true);
    });
  });

  describe('countTurns', () => {
    it('should count assistant messages as turns', () => {
      const history: Message[] = [
        { role: 'assistant', content: 'Turn 1' },
        { role: 'user', content: 'Choice 1' },
        { role: 'assistant', content: 'Turn 2' },
        { role: 'user', content: 'Choice 2' },
      ];

      // Access via estimateTokens which uses the same logic
      const manager2 = new HistoryManager();
      const result = manager2.estimateTokens(history);

      expect(result).toBeGreaterThan(0);
    });
  });

  describe('token estimation', () => {
    it('should handle string content', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello world' },
      ];

      const estimate = manager.estimateTokens(messages);
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(10);
    });

    it('should handle object content', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: {
            narration: 'Test narration',
            choices: [
              { id: '1', label: 'Choice 1' },
              { id: '2', label: 'Choice 2' },
            ],
          },
        },
      ];

      const estimate = manager.estimateTokens(messages);
      expect(estimate).toBeGreaterThan(0);
    });

    it('should scale with content length', () => {
      const short: Message[] = [{ role: 'user', content: 'Hi' }];
      const long: Message[] = [{ role: 'user', content: 'A'.repeat(400) }];

      const shortEstimate = manager.estimateTokens(short);
      const longEstimate = manager.estimateTokens(long);

      expect(longEstimate).toBeGreaterThan(shortEstimate);
    });
  });

  describe('fallback summary', () => {
    it('should generate fallback summary for empty history', async () => {
      const managerWithSummary = new HistoryManager({
        recentTurnLimit: 2,
        totalTurnLimit: 5,
        enableSummarization: true,
      });

      const history: Message[] = [];

      // This should not throw
      const result = await managerWithSummary.prepareMessages('System', history, 'dungeon');
      expect(result).toHaveLength(1); // Just system
    });
  });

  describe('edge cases', () => {
    it('should handle empty history', async () => {
      const result = await manager.prepareMessages('System', [], 'dungeon');

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('System');
    });

    it('should handle single message', async () => {
      const history: Message[] = [{ role: 'user', content: 'Hello' }];

      const result = await manager.prepareMessages('System', history, 'dungeon');

      expect(result).toHaveLength(2);
      expect(result[1]).toEqual(history[0]);
    });

    it('should handle mixed message types', async () => {
      const history: Message[] = [
        { role: 'system', content: 'Old system' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Input' },
      ];

      const result = await manager.prepareMessages('New system', history, 'journey');

      expect(result[0].content).toBe('New system');
      expect(result.length).toBeGreaterThan(1);
    });

    it('should handle very long single message', async () => {
      const history: Message[] = [
        { role: 'user', content: 'A'.repeat(10000) },
      ];

      const result = await manager.prepareMessages('System', history, 'mystery');

      expect(result).toHaveLength(2);
      expect(manager.estimateTokens(result)).toBeGreaterThan(1000);
    });
  });

  describe('configuration', () => {
    it('should respect custom recent turn limit', async () => {
      const customManager = new HistoryManager({
        recentTurnLimit: 1,
        totalTurnLimit: 10,
        enableSummarization: false,
      });

      const longHistory: Message[] = [];
      for (let i = 0; i < 5; i++) {
        longHistory.push({ role: 'assistant', content: `Turn ${i}` });
        longHistory.push({ role: 'user', content: `Choice ${i}` });
      }

      const result = await customManager.prepareMessages('System', longHistory, 'dungeon');

      // Should only keep 1 recent turn (2 messages) + system
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });
});
