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
