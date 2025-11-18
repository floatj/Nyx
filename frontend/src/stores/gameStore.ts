import { writable, derived } from 'svelte/store';

// Types
export type GameState =
  | 'uninitialized'
  | 'mode_selection'
  | 'starting'
  | 'streaming'
  | 'awaiting_choice'
  | 'processing_input'
  | 'paused'
  | 'error_recoverable'
  | 'error_fatal'
  | 'game_over';

export type GameMode = 'dungeon' | 'journey' | 'mystery' | 'custom';
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

export type GameEvent =
  | { type: 'SELECT_MODE'; mode: GameMode }
  | { type: 'SET_CUSTOM_PROMPT'; prompt: string }
  | { type: 'SET_CHARACTER_STATUS_ENABLED'; enabled: boolean }
  | { type: 'START_GAME' }
  | { type: 'SESSION_READY'; sessionId: string; token: string }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_CHUNK'; data: string }
  | { type: 'STREAM_COMPLETE'; output: LLMOutput; tokenUsed?: number }
  | { type: 'SELECT_CHOICE'; choiceId: string }
  | { type: 'SELECT_CUSTOM_CHOICE'; customText: string }
  | { type: 'INPUT_SUBMITTED'; text: string }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'ERROR'; error: Error; recoverable: boolean }
  | { type: 'RETRY' }
  | { type: 'RESET' }
  | { type: 'END_GAME'; ending: 'victory' | 'defeat' | 'abandoned' };

interface GameStoreState {
  state: GameState;
  previousState: GameState | null;
  mode: GameMode | null;
  customPrompt: string | null;
  history: Message[];
  currentNarration: string;
  streamBuffer: string;
  choices: Choice[];
  error: Error | null;
  sessionId: string | null;
  sessionToken: string | null;
  tokenUsed: number;
  characterStatus: CharacterStatus | null;
  characterStatusEnabled: boolean;
}

// Valid state transitions
const VALID_TRANSITIONS: Record<GameState, Partial<Record<GameEvent['type'], GameState>>> = {
  uninitialized: {
    SELECT_MODE: 'mode_selection',
    SET_CHARACTER_STATUS_ENABLED: 'uninitialized',
    ERROR: 'error_recoverable',
    RESET: 'uninitialized',
  },
  mode_selection: {
    SET_CUSTOM_PROMPT: 'mode_selection',
    SET_CHARACTER_STATUS_ENABLED: 'mode_selection',
    START_GAME: 'starting',
    RESET: 'uninitialized',
  },
  starting: {
    SESSION_READY: 'streaming',
    ERROR: 'error_recoverable',
    RESET: 'uninitialized',
  },
  streaming: {
    STREAM_CHUNK: 'streaming', // Allow chunks during streaming
    STREAM_COMPLETE: 'awaiting_choice',
    ERROR: 'error_recoverable',
    PAUSE: 'paused',
    RESET: 'uninitialized',
  },
  awaiting_choice: {
    SELECT_CHOICE: 'processing_input',
    SELECT_CUSTOM_CHOICE: 'processing_input',
    INPUT_SUBMITTED: 'processing_input',
    PAUSE: 'paused',
    END_GAME: 'game_over',
    RESET: 'uninitialized',
  },
  processing_input: {
    STREAM_START: 'streaming',
    ERROR: 'error_recoverable',
    RESET: 'uninitialized',
  },
  paused: {
    RESUME: 'uninitialized', // Will be overridden by previousState
    RESET: 'uninitialized',
  },
  error_recoverable: {
    RETRY: 'uninitialized', // Will be overridden by previousState
    RESET: 'uninitialized',
  },
  error_fatal: {
    RESET: 'uninitialized',
  },
  game_over: {
    RESET: 'uninitialized',
  },
};

const initialState: GameStoreState = {
  state: 'uninitialized',
  previousState: null,
  mode: null,
  customPrompt: null,
  history: [],
  currentNarration: '',
  streamBuffer: '',
  choices: [],
  error: null,
  sessionId: null,
  sessionToken: null,
  tokenUsed: 0,
  characterStatus: null,
  characterStatusEnabled: true, // Default to enabled
};

function createGameStore() {
  const { subscribe, update, set } = writable<GameStoreState>(initialState);

  // State transition validator
  function canTransition(currentState: GameState, eventType: GameEvent['type']): boolean {
    const allowed = VALID_TRANSITIONS[currentState];
    return !!(allowed && eventType in allowed);
  }

  return {
    subscribe,

    dispatch(event: GameEvent) {
      update((state) => {
        if (!canTransition(state.state, event.type)) {
          console.warn(`Invalid transition: ${state.state} -> ${event.type}`);
          return state;
        }

        // Handle events
        switch (event.type) {
          case 'SELECT_MODE':
            return {
              ...state,
              mode: event.mode,
              state: 'mode_selection',
            };

          case 'SET_CUSTOM_PROMPT':
            return {
              ...state,
              customPrompt: event.prompt,
            };

          case 'SET_CHARACTER_STATUS_ENABLED':
            return {
              ...state,
              characterStatusEnabled: event.enabled,
            };

          case 'START_GAME':
            return {
              ...state,
              state: 'starting',
              history: [],
              currentNarration: '',
              choices: [],
              error: null,
              tokenUsed: 0,
            };

          case 'SESSION_READY':
            return {
              ...state,
              sessionId: event.sessionId,
              sessionToken: event.token,
              state: 'streaming',
            };

          case 'STREAM_START':
            return {
              ...state,
              streamBuffer: '',
              state: 'streaming',
            };

          case 'STREAM_CHUNK':
            return {
              ...state,
              streamBuffer: state.streamBuffer + event.data,
            };

          case 'STREAM_COMPLETE': {
            const newHistory: Message[] = [
              ...state.history,
              {
                role: 'assistant',
                content: event.output,
              },
            ];

            // Only update character status if it's enabled
            const newCharacterStatus = state.characterStatusEnabled
              ? (event.output.characterStatus || state.characterStatus)
              : null;

            return {
              ...state,
              currentNarration: event.output.narration,
              choices: event.output.choices,
              history: newHistory,
              streamBuffer: '',
              tokenUsed: event.tokenUsed !== undefined ? event.tokenUsed : state.tokenUsed,
              characterStatus: newCharacterStatus,
              state: event.output.meta?.ending ? 'game_over' : 'awaiting_choice',
            };
          }

          case 'SELECT_CHOICE': {
            const choice = state.choices.find((c) => c.id === event.choiceId);
            if (!choice) return state;

            return {
              ...state,
              history: [...state.history, { role: 'user', content: choice.label }],
              state: 'processing_input',
            };
          }

          case 'SELECT_CUSTOM_CHOICE': {
            return {
              ...state,
              history: [...state.history, { role: 'user', content: event.customText }],
              state: 'processing_input',
            };
          }

          case 'INPUT_SUBMITTED':
            return {
              ...state,
              history: [...state.history, { role: 'user', content: event.text }],
              state: 'processing_input',
            };

          case 'PAUSE':
            return {
              ...state,
              previousState: state.state,
              state: 'paused',
            };

          case 'RESUME':
            return {
              ...state,
              state: state.previousState || 'uninitialized',
              previousState: null,
            };

          case 'ERROR':
            return {
              ...state,
              error: event.error,
              previousState: state.state,
              state: event.recoverable ? 'error_recoverable' : 'error_fatal',
            };

          case 'RETRY':
            return {
              ...state,
              error: null,
              state: state.previousState || 'uninitialized',
              previousState: null,
            };

          case 'RESET':
            return {
              ...initialState,
            };

          case 'END_GAME':
            return {
              ...state,
              state: 'game_over',
            };

          default:
            return state;
        }
      });
    },

    reset() {
      set(initialState);
    },
  };
}

export const gameStore = createGameStore();

// Derived stores for UI
export const isLoading = derived(
  gameStore,
  ($game) => ['starting', 'processing_input', 'streaming'].includes($game.state)
);

export const canSelectChoice = derived(
  gameStore,
  ($game) => $game.state === 'awaiting_choice'
);

export const showChoices = derived(
  gameStore,
  ($game) => $game.state === 'awaiting_choice' && $game.choices.length > 0
);

export const hasError = derived(
  gameStore,
  ($game) => $game.state.startsWith('error_')
);

export const isGameOver = derived(
  gameStore,
  ($game) => $game.state === 'game_over'
);
