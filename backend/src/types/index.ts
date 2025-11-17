// Core domain types

export type GameMode = 'dungeon' | 'journey' | 'mystery' | 'custom';

export type MessageRole = 'system' | 'assistant' | 'user';

export interface Choice {
  id: string;
  label: string;
}

export interface LLMOutput {
  narration: string;
  choices: Choice[];
  meta?: {
    danger?: number;
    loot?: boolean;
    ending?: boolean;
  };
}

export interface Message {
  role: MessageRole;
  content: string | LLMOutput;
}

export interface PlayRequest {
  sessionId: string;
  mode: GameMode;
  customPrompt?: string;
  history: Message[];
  player_input: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface Session {
  id: string;
  tokenUsed: number;
  tokenBudget: number;
  createdAt: number;
  lastActive: number;
}

export interface SessionResponse {
  sessionId: string;
  token: string;
  tokenBudget: number;
  expiresIn: number;
}
