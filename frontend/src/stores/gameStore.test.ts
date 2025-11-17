import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { gameStore, isLoading, canSelectChoice, showChoices, hasError } from './gameStore';
import type { LLMOutput } from './gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    gameStore.reset();
  });

  describe('initial state', () => {
    it('should start in uninitialized state', () => {
      const state = get(gameStore);
      expect(state.state).toBe('uninitialized');
      expect(state.mode).toBeNull();
      expect(state.history).toEqual([]);
      expect(state.sessionId).toBeNull();
    });
  });

  describe('mode selection', () => {
    it('should transition to mode_selection when SELECT_MODE is dispatched', () => {
      gameStore.dispatch({ type: 'SELECT_MODE', mode: 'dungeon' });
      const state = get(gameStore);

      expect(state.state).toBe('mode_selection');
      expect(state.mode).toBe('dungeon');
    });

    it('should reject invalid transitions', () => {
      // Try to stream without starting game
      const initialState = get(gameStore);
      gameStore.dispatch({ type: 'STREAM_START' });
      const afterState = get(gameStore);

      expect(afterState.state).toBe(initialState.state);
    });
  });

  describe('game flow', () => {
    it('should handle complete game start flow', () => {
      // Select mode
      gameStore.dispatch({ type: 'SELECT_MODE', mode: 'journey' });
      expect(get(gameStore).state).toBe('mode_selection');

      // Start game
      gameStore.dispatch({ type: 'START_GAME' });
      expect(get(gameStore).state).toBe('starting');

      // Session ready
      gameStore.dispatch({
        type: 'SESSION_READY',
        sessionId: 'test-session',
        token: 'test-token',
      });

      const state = get(gameStore);
      expect(state.state).toBe('streaming');
      expect(state.sessionId).toBe('test-session');
      expect(state.sessionToken).toBe('test-token');
    });

    it('should handle streaming chunks', () => {
      setupGameInStreamingState();

      gameStore.dispatch({ type: 'STREAM_CHUNK', data: 'You enter' });
      expect(get(gameStore).streamBuffer).toBe('You enter');

      gameStore.dispatch({ type: 'STREAM_CHUNK', data: ' a dark room.' });
      expect(get(gameStore).streamBuffer).toBe('You enter a dark room.');
    });

    it('should complete stream and show choices', () => {
      setupGameInStreamingState();

      const output: LLMOutput = {
        narration: 'You stand at a crossroads.',
        choices: [
          { id: 'left', label: 'Go left' },
          { id: 'right', label: 'Go right' },
        ],
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });

      const state = get(gameStore);
      expect(state.state).toBe('awaiting_choice');
      expect(state.currentNarration).toBe('You stand at a crossroads.');
      expect(state.choices).toHaveLength(2);
      expect(state.history).toHaveLength(1);
      expect(state.history[0].role).toBe('assistant');
    });

    it('should handle choice selection', () => {
      setupGameAwaitingChoice();

      gameStore.dispatch({ type: 'SELECT_CHOICE', choiceId: 'left' });

      const state = get(gameStore);
      expect(state.state).toBe('processing_input');
      expect(state.history).toHaveLength(2); // assistant + user
      expect(state.history[1].role).toBe('user');
      expect(state.history[1].content).toBe('Go left');
    });

    it('should detect game ending', () => {
      setupGameInStreamingState();

      const output: LLMOutput = {
        narration: 'You have completed your quest!',
        choices: [],
        meta: { ending: true },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });

      expect(get(gameStore).state).toBe('game_over');
    });
  });

  describe('error handling', () => {
    it('should transition to error_recoverable on recoverable error', () => {
      setupGameInStreamingState();

      gameStore.dispatch({
        type: 'ERROR',
        error: new Error('Network timeout'),
        recoverable: true,
      });

      const state = get(gameStore);
      expect(state.state).toBe('error_recoverable');
      expect(state.error?.message).toBe('Network timeout');
      expect(state.previousState).toBe('streaming');
    });

    it('should transition to error_fatal on fatal error', () => {
      setupGameInStreamingState();

      gameStore.dispatch({
        type: 'ERROR',
        error: new Error('Budget exceeded'),
        recoverable: false,
      });

      expect(get(gameStore).state).toBe('error_fatal');
    });

    it('should retry from error state', () => {
      setupGameInStreamingState();

      gameStore.dispatch({
        type: 'ERROR',
        error: new Error('Test'),
        recoverable: true,
      });

      expect(get(gameStore).state).toBe('error_recoverable');

      gameStore.dispatch({ type: 'RETRY' });

      const state = get(gameStore);
      expect(state.state).toBe('streaming');
      expect(state.error).toBeNull();
    });
  });

  describe('pause/resume', () => {
    it('should pause and resume game', () => {
      setupGameAwaitingChoice();

      gameStore.dispatch({ type: 'PAUSE' });

      let state = get(gameStore);
      expect(state.state).toBe('paused');
      expect(state.previousState).toBe('awaiting_choice');

      gameStore.dispatch({ type: 'RESUME' });

      state = get(gameStore);
      expect(state.state).toBe('awaiting_choice');
      expect(state.previousState).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset game to initial state', () => {
      setupGameAwaitingChoice();

      gameStore.dispatch({ type: 'RESET' });

      const state = get(gameStore);
      expect(state.state).toBe('uninitialized');
      expect(state.history).toEqual([]);
      expect(state.mode).toBeNull();
      expect(state.sessionId).toBeNull();
    });
  });

  describe('character status', () => {
    it('should initialize with null character status', () => {
      const state = get(gameStore);
      expect(state.characterStatus).toBeNull();
    });

    it('should update character status on STREAM_COMPLETE', () => {
      setupGameInStreamingState();

      const output: LLMOutput = {
        narration: 'You take damage from the trap!',
        choices: [
          { id: 'heal', label: 'Use healing potion' },
          { id: 'continue', label: 'Press on' },
        ],
        characterStatus: {
          health: 75,
          stamina: 90,
          conditions: {
            injured: true,
            poisoned: false,
            blessed: false,
            cursed: false,
          },
          inventory: ['torch', 'rusty dagger'],
        },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });

      const state = get(gameStore);
      expect(state.characterStatus).toBeDefined();
      expect(state.characterStatus?.health).toBe(75);
      expect(state.characterStatus?.stamina).toBe(90);
      expect(state.characterStatus?.conditions.injured).toBe(true);
      expect(state.characterStatus?.inventory).toContain('torch');
    });

    it('should preserve character status when not provided in response', () => {
      setupGameInStreamingState();

      // First turn with character status
      const output1: LLMOutput = {
        narration: 'You enter the dungeon.',
        choices: [{ id: 'explore', label: 'Explore' }],
        characterStatus: {
          health: 100,
          stamina: 100,
          conditions: {
            injured: false,
            poisoned: false,
            blessed: false,
            cursed: false,
          },
          inventory: ['torch'],
        },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output: output1 });

      // Second turn without character status
      gameStore.dispatch({ type: 'SELECT_CHOICE', choiceId: 'explore' });
      gameStore.dispatch({ type: 'STREAM_START' });

      const output2: LLMOutput = {
        narration: 'You continue exploring.',
        choices: [{ id: 'proceed', label: 'Proceed' }],
        // No characterStatus field
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output: output2 });

      const state = get(gameStore);
      // Should preserve previous character status
      expect(state.characterStatus).toBeDefined();
      expect(state.characterStatus?.health).toBe(100);
      expect(state.characterStatus?.inventory).toContain('torch');
    });

    it('should handle character status with multiple conditions', () => {
      setupGameInStreamingState();

      const output: LLMOutput = {
        narration: 'You are cursed and poisoned!',
        choices: [{ id: 'rest', label: 'Rest' }],
        characterStatus: {
          health: 50,
          stamina: 30,
          conditions: {
            injured: true,
            poisoned: true,
            blessed: false,
            cursed: true,
          },
          inventory: ['cursed amulet'],
        },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });

      const state = get(gameStore);
      expect(state.characterStatus?.conditions.injured).toBe(true);
      expect(state.characterStatus?.conditions.poisoned).toBe(true);
      expect(state.characterStatus?.conditions.cursed).toBe(true);
      expect(state.characterStatus?.conditions.blessed).toBe(false);
    });

    it('should handle empty inventory', () => {
      setupGameInStreamingState();

      const output: LLMOutput = {
        narration: 'You lost all your items!',
        choices: [{ id: 'continue', label: 'Continue' }],
        characterStatus: {
          health: 80,
          stamina: 60,
          conditions: {
            injured: false,
            poisoned: false,
            blessed: false,
            cursed: false,
          },
          inventory: [],
        },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });

      const state = get(gameStore);
      expect(state.characterStatus?.inventory).toEqual([]);
    });

    it('should reset character status on game reset', () => {
      setupGameInStreamingState();

      const output: LLMOutput = {
        narration: 'You find treasure!',
        choices: [{ id: 'take', label: 'Take it' }],
        characterStatus: {
          health: 80,
          stamina: 70,
          conditions: {
            injured: false,
            poisoned: false,
            blessed: false,
            cursed: false,
          },
          inventory: ['treasure'],
        },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });
      expect(get(gameStore).characterStatus).toBeDefined();

      gameStore.dispatch({ type: 'RESET' });

      const state = get(gameStore);
      expect(state.characterStatus).toBeNull();
    });
  });

  describe('characterStatusEnabled flag', () => {
    it('should initialize with characterStatusEnabled true by default', () => {
      const state = get(gameStore);
      expect(state.characterStatusEnabled).toBe(true);
    });

    it('should set characterStatusEnabled flag with SET_CHARACTER_STATUS_ENABLED event', () => {
      gameStore.dispatch({ type: 'SET_CHARACTER_STATUS_ENABLED', enabled: false });

      let state = get(gameStore);
      expect(state.characterStatusEnabled).toBe(false);

      gameStore.dispatch({ type: 'SET_CHARACTER_STATUS_ENABLED', enabled: true });

      state = get(gameStore);
      expect(state.characterStatusEnabled).toBe(true);
    });

    it('should update character status when characterStatusEnabled is true', () => {
      gameStore.dispatch({ type: 'SET_CHARACTER_STATUS_ENABLED', enabled: true });
      setupGameInStreamingState();

      const output: LLMOutput = {
        narration: 'You take damage!',
        choices: [{ id: 'heal', label: 'Heal' }],
        characterStatus: {
          health: 75,
          stamina: 90,
          conditions: {
            injured: true,
            poisoned: false,
            blessed: false,
            cursed: false,
          },
          inventory: ['torch'],
        },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });

      const state = get(gameStore);
      expect(state.characterStatus).toBeDefined();
      expect(state.characterStatus?.health).toBe(75);
      expect(state.characterStatus?.stamina).toBe(90);
    });

    it('should NOT update character status when characterStatusEnabled is false', () => {
      gameStore.dispatch({ type: 'SET_CHARACTER_STATUS_ENABLED', enabled: false });
      setupGameInStreamingState();

      const output: LLMOutput = {
        narration: 'You take damage!',
        choices: [{ id: 'heal', label: 'Heal' }],
        characterStatus: {
          health: 75,
          stamina: 90,
          conditions: {
            injured: true,
            poisoned: false,
            blessed: false,
            cursed: false,
          },
          inventory: ['torch'],
        },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });

      const state = get(gameStore);
      // Character status should remain null even though LLM returned it
      expect(state.characterStatus).toBeNull();
    });

    it('should keep character status null across multiple turns when disabled', () => {
      gameStore.dispatch({ type: 'SET_CHARACTER_STATUS_ENABLED', enabled: false });
      setupGameInStreamingState();

      // First turn with character status in response
      const output1: LLMOutput = {
        narration: 'Turn 1',
        choices: [{ id: 'next', label: 'Next' }],
        characterStatus: {
          health: 100,
          stamina: 100,
          conditions: { injured: false, poisoned: false, blessed: false, cursed: false },
          inventory: ['torch'],
        },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output: output1 });
      expect(get(gameStore).characterStatus).toBeNull();

      // Second turn
      gameStore.dispatch({ type: 'SELECT_CHOICE', choiceId: 'next' });
      gameStore.dispatch({ type: 'STREAM_START' });

      const output2: LLMOutput = {
        narration: 'Turn 2',
        choices: [{ id: 'continue', label: 'Continue' }],
        characterStatus: {
          health: 80,
          stamina: 70,
          conditions: { injured: true, poisoned: false, blessed: false, cursed: false },
          inventory: ['torch', 'sword'],
        },
      };

      gameStore.dispatch({ type: 'STREAM_COMPLETE', output: output2 });

      // Should still be null
      const state = get(gameStore);
      expect(state.characterStatus).toBeNull();
    });

    it('should allow toggling characterStatusEnabled during mode_selection', () => {
      gameStore.dispatch({ type: 'SELECT_MODE', mode: 'dungeon' });
      expect(get(gameStore).state).toBe('mode_selection');

      gameStore.dispatch({ type: 'SET_CHARACTER_STATUS_ENABLED', enabled: false });

      const state = get(gameStore);
      expect(state.state).toBe('mode_selection');
      expect(state.characterStatusEnabled).toBe(false);
    });

    it('should preserve characterStatusEnabled value through game reset', () => {
      gameStore.dispatch({ type: 'SET_CHARACTER_STATUS_ENABLED', enabled: false });
      setupGameAwaitingChoice();

      gameStore.dispatch({ type: 'RESET' });

      const state = get(gameStore);
      expect(state.state).toBe('uninitialized');
      // characterStatusEnabled should be reset to default (true)
      expect(state.characterStatusEnabled).toBe(true);
    });
  });

  describe('custom action input', () => {
    it('should handle custom action input in awaiting_choice state', () => {
      setupGameAwaitingChoice();

      const customText = 'I search for hidden doors';
      gameStore.dispatch({ type: 'SELECT_CUSTOM_CHOICE', customText });

      const state = get(gameStore);
      expect(state.state).toBe('processing_input');
      expect(state.history).toHaveLength(2); // assistant + user
      expect(state.history[1].role).toBe('user');
      expect(state.history[1].content).toBe(customText);
    });

    it('should handle custom action with trimmed text', () => {
      setupGameAwaitingChoice();

      const customText = '  I look around carefully  ';
      gameStore.dispatch({ type: 'SELECT_CUSTOM_CHOICE', customText });

      const state = get(gameStore);
      expect(state.state).toBe('processing_input');
      expect(state.history[1].content).toBe(customText);
    });

    it('should not allow custom action in non-awaiting_choice state', () => {
      setupGameInStreamingState();

      const initialHistory = get(gameStore).history;
      gameStore.dispatch({ type: 'SELECT_CUSTOM_CHOICE', customText: 'Try to act' });

      const state = get(gameStore);
      expect(state.state).toBe('streaming'); // Should remain in streaming
      expect(state.history).toEqual(initialHistory); // History unchanged
    });

    it('should handle multiple custom actions in sequence', () => {
      setupGameAwaitingChoice();

      // First custom action
      gameStore.dispatch({ type: 'SELECT_CUSTOM_CHOICE', customText: 'First action' });
      expect(get(gameStore).history[1].content).toBe('First action');

      // Simulate getting to awaiting_choice again
      gameStore.dispatch({ type: 'STREAM_START' });
      const output: LLMOutput = {
        narration: 'Next situation',
        choices: [{ id: 'option1', label: 'Option 1' }],
      };
      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });

      // Second custom action
      gameStore.dispatch({ type: 'SELECT_CUSTOM_CHOICE', customText: 'Second action' });

      const state = get(gameStore);
      expect(state.history).toHaveLength(4); // 2 assistant + 2 user
      expect(state.history[3].content).toBe('Second action');
    });

    it('should work alongside regular choice selection', () => {
      setupGameAwaitingChoice();

      // First select a regular choice
      gameStore.dispatch({ type: 'SELECT_CHOICE', choiceId: 'left' });
      expect(get(gameStore).history[1].content).toBe('Go left');

      // Simulate getting to awaiting_choice again
      gameStore.dispatch({ type: 'STREAM_START' });
      const output: LLMOutput = {
        narration: 'Next situation',
        choices: [{ id: 'option1', label: 'Option 1' }],
      };
      gameStore.dispatch({ type: 'STREAM_COMPLETE', output });

      // Now use custom action
      gameStore.dispatch({ type: 'SELECT_CUSTOM_CHOICE', customText: 'Custom action' });

      const state = get(gameStore);
      expect(state.history).toHaveLength(4); // 2 assistant + 2 user
      expect(state.history[1].content).toBe('Go left');
      expect(state.history[3].content).toBe('Custom action');
    });
  });

  describe('derived stores', () => {
    it('isLoading should be true during processing states', () => {
      expect(get(isLoading)).toBe(false);

      setupGameInStreamingState();
      expect(get(isLoading)).toBe(true);

      gameStore.dispatch({
        type: 'STREAM_COMPLETE',
        output: { narration: 'Test', choices: [] },
      });
      expect(get(isLoading)).toBe(false);
    });

    it('canSelectChoice should be true only in awaiting_choice state', () => {
      expect(get(canSelectChoice)).toBe(false);

      setupGameAwaitingChoice();
      expect(get(canSelectChoice)).toBe(true);

      gameStore.dispatch({ type: 'SELECT_CHOICE', choiceId: 'left' });
      expect(get(canSelectChoice)).toBe(false);
    });

    it('showChoices should be true when choices exist in awaiting_choice', () => {
      expect(get(showChoices)).toBe(false);

      setupGameAwaitingChoice();
      expect(get(showChoices)).toBe(true);
    });

    it('hasError should be true in error states', () => {
      expect(get(hasError)).toBe(false);

      gameStore.dispatch({
        type: 'ERROR',
        error: new Error('Test'),
        recoverable: true,
      });

      expect(get(hasError)).toBe(true);
    });
  });
});

// Helper functions
function setupGameInStreamingState() {
  gameStore.dispatch({ type: 'SELECT_MODE', mode: 'dungeon' });
  gameStore.dispatch({ type: 'START_GAME' });
  gameStore.dispatch({
    type: 'SESSION_READY',
    sessionId: 'test',
    token: 'test-token',
  });
  gameStore.dispatch({ type: 'STREAM_START' });
}

function setupGameAwaitingChoice() {
  setupGameInStreamingState();

  const output: LLMOutput = {
    narration: 'Test narration',
    choices: [
      { id: 'left', label: 'Go left' },
      { id: 'right', label: 'Go right' },
    ],
  };

  gameStore.dispatch({ type: 'STREAM_COMPLETE', output });
}
