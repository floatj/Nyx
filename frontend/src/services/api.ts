import type { GameMode, Message, LLMOutput } from '../stores/gameStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface SessionResponse {
  sessionId: string;
  token: string;
  tokenBudget: number;
  expiresIn: number;
}

export interface PlayRequest {
  sessionId: string;
  mode: GameMode;
  history: Message[];
  player_input: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export class ApiService {
  /**
   * Create a new game session
   */
  async createSession(): Promise<SessionResponse> {
    const response = await fetch(`${API_URL}/api/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get session information
   */
  async getSession(sessionId: string): Promise<any> {
    const response = await fetch(`${API_URL}/api/session/${sessionId}`);

    if (!response.ok) {
      throw new Error(`Failed to get session: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Play a turn with streaming response
   * Returns an async generator that yields chunks and final output
   */
  async *playTurn(request: PlayRequest): AsyncGenerator<
    { type: 'content'; chunk: string } | { type: 'complete'; output: LLMOutput } | { type: 'error'; error: string },
    void,
    unknown
  > {
    const response = await fetch(`${API_URL}/api/play`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Play request failed: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'content') {
                yield { type: 'content', chunk: parsed.chunk };
              } else if (parsed.type === 'complete') {
                yield { type: 'complete', output: parsed.output };
              } else if (parsed.type === 'error') {
                yield { type: 'error', error: parsed.error };
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const apiService = new ApiService();
