// Core domain types

export type GameMode = 'dungeon' | 'journey' | 'mystery' | 'magical_girl' | 'time_traveler' | 'software_engineer' | 'bl_story' | 'gl_story' | 'alien_defense' | 'custom';

export type MessageRole = 'system' | 'assistant' | 'user';

export interface Choice {
  id: string;
  label: string;
}

export interface CharacterStatus {
  health: number;
  stamina: number;
  conditions: {
    injured: boolean;
    poisoned: boolean;
    blessed: boolean;
    cursed: boolean;
  };
  inventory: string[];
}

export interface LLMOutput {
  narration: string;
  choices: Choice[];
  characterStatus?: CharacterStatus;
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
  customInitialCharacterStatus?: CharacterStatus;
  history: Message[];
  player_input: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  characterStatusEnabled?: boolean;
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
