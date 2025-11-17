import 'dotenv/config';
import type { Message, GameMode, LLMOutput } from '../types/index.js';

const KEEP_RECENT_TURNS = 8;
const MAX_TOTAL_TURNS = 15;

interface HistoryConfig {
  recentTurnLimit: number;
  totalTurnLimit: number;
  enableSummarization: boolean;
}

const defaultConfig: HistoryConfig = {
  recentTurnLimit: KEEP_RECENT_TURNS,
  totalTurnLimit: MAX_TOTAL_TURNS,
  enableSummarization: true,
};

/**
 * Manages conversation history to stay within token limits
 */
export class HistoryManager {
  constructor(private config: HistoryConfig = defaultConfig) {}

  /**
   * Prepare history for API call
   * Returns: [systemMessage, ...processedHistory]
   */
  async prepareMessages(
    systemPrompt: string,
    fullHistory: Message[],
    mode: GameMode
  ): Promise<Message[]> {
    const turnCount = this.countTurns(fullHistory);

    // Convert all messages to API-compatible format (content must be string)
    const normalizedHistory = this.normalizeMessages(fullHistory);

    // Early return if history is short
    if (turnCount <= this.config.recentTurnLimit) {
      return [{ role: 'system', content: systemPrompt }, ...normalizedHistory];
    }

    // Split history
    const splitPoint = normalizedHistory.length - this.config.recentTurnLimit * 2;
    const olderHistory = normalizedHistory.slice(0, splitPoint);
    const recentHistory = normalizedHistory.slice(splitPoint);

    // Strategy A: Simple truncation (fast, loses context)
    if (!this.config.enableSummarization) {
      return [{ role: 'system', content: systemPrompt }, ...recentHistory];
    }

    // Strategy B: Summarization (better quality, costs tokens)
    const summary = await this.summarizeHistory(olderHistory, mode);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `Story so far: ${summary}` },
      ...recentHistory,
    ];
  }

  /**
   * Normalize messages to have string content only (required by OpenRouter API)
   */
  private normalizeMessages(messages: Message[]): Message[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? msg.content
        : (msg.content as LLMOutput).narration || JSON.stringify(msg.content),
    }));
  }

  /**
   * Count assistant-user turn pairs
   */
  private countTurns(history: Message[]): number {
    return history.filter((m) => m.role === 'assistant').length;
  }

  /**
   * Generate summary of older turns using cheap LLM
   */
  private async summarizeHistory(messages: Message[], mode: GameMode): Promise<string> {
    // Extract narration from assistant messages
    const narrations = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => {
        if (typeof m.content === 'string') return m.content;
        return (m.content as LLMOutput).narration || '';
      })
      .join('\n\n');

    const summaryPrompt = `Summarize this ${mode} RPG story in 4-5 concise sentences. Focus on key events, decisions, and current situation:\n\n${narrations}`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
          'X-Title': 'AI Text RPG',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku',
          messages: [{ role: 'user', content: summaryPrompt }],
          max_tokens: 250,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`Summarization failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.warn('Summarization failed, using fallback', error);
      return this.fallbackSummary(messages);
    }
  }

  /**
   * Fallback: Extract key events without LLM
   */
  private fallbackSummary(messages: Message[]): string {
    const userChoices = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content as string)
      .slice(0, 5); // First 5 choices

    return `The adventurer made these key decisions: ${userChoices.join(', ')}. The story continues...`;
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(messages: Message[]): number {
    const text = messages
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n');

    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if history needs pruning
   */
  needsPruning(history: Message[]): boolean {
    return this.estimateTokens(history) > 4000; // Trigger at 4k tokens
  }
}

export const historyManager = new HistoryManager();
