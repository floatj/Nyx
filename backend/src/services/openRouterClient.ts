import 'dotenv/config';
import type { Message } from '../types/index.js';

export interface OpenRouterStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
}

export interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required');
    }
  }

  /**
   * Stream completion from OpenRouter
   * Returns an async generator that yields content chunks
   */
  async *streamCompletion(params: {
    model: string;
    messages: Message[];
    temperature?: number;
    max_tokens?: number;
  }): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'AI Text RPG',
      },
      body: JSON.stringify({
        model: params.model || 'anthropic/claude-3-haiku',
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.max_tokens ?? 600,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body from OpenRouter');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const chunk: OpenRouterStreamChunk = JSON.parse(data);
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch (e) {
              console.warn('Failed to parse SSE chunk:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Non-streaming completion (fallback)
   */
  async complete(params: {
    model: string;
    messages: Message[];
    temperature?: number;
    max_tokens?: number;
  }): Promise<OpenRouterResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'AI Text RPG',
      },
      body: JSON.stringify({
        model: params.model || 'anthropic/claude-3-haiku',
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.max_tokens ?? 600,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Fetch available models
   */
  async getModels(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }
}

export const openRouterClient = new OpenRouterClient();
