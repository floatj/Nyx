<script lang="ts">
  import { onMount } from 'svelte';
  import { gameStore, hasError, isGameOver } from '../stores/gameStore';
  import { apiService } from '../services/api';
  import StoryPane from '../components/StoryPane.svelte';
  import ChoiceList from '../components/ChoiceList.svelte';
  import TokenMeter from '../components/TokenMeter.svelte';
  import type { GameMode } from '../stores/gameStore';

  let tokenBudget = 20000;
  let selectedMode: GameMode | null = null;

  // Watch for choice selection to trigger next turn
  $: {
    if ($gameStore.state === 'processing_input') {
      executeTurn();
    }
  }

  async function startGame(mode: GameMode) {
    try {
      selectedMode = mode;
      gameStore.dispatch({ type: 'SELECT_MODE', mode });
      gameStore.dispatch({ type: 'START_GAME' });

      // Create session
      const session = await apiService.createSession();
      tokenBudget = session.tokenBudget;

      gameStore.dispatch({
        type: 'SESSION_READY',
        sessionId: session.sessionId,
        token: session.token,
      });

      // Start first turn
      await executeTurn();
    } catch (error) {
      console.error('Failed to start game:', error);
      gameStore.dispatch({
        type: 'ERROR',
        error: error as Error,
        recoverable: true,
      });
    }
  }

  async function executeTurn() {
    if (!$gameStore.sessionId || !$gameStore.mode) return;

    try {
      gameStore.dispatch({ type: 'STREAM_START' });

      const playRequest = {
        sessionId: $gameStore.sessionId,
        mode: $gameStore.mode,
        history: $gameStore.history,
        player_input: $gameStore.history.length > 0 ? ($gameStore.history[$gameStore.history.length - 1].content as string) : '',
      };

      for await (const event of apiService.playTurn(playRequest)) {
        if (event.type === 'content') {
          gameStore.dispatch({ type: 'STREAM_CHUNK', data: event.chunk });
        } else if (event.type === 'complete') {
          gameStore.dispatch({ type: 'STREAM_COMPLETE', output: event.output });
        } else if (event.type === 'error') {
          throw new Error(event.error);
        }
      }
    } catch (error) {
      console.error('Turn execution error:', error);
      gameStore.dispatch({
        type: 'ERROR',
        error: error as Error,
        recoverable: true,
      });
    }
  }

  function resetGame() {
    gameStore.reset();
    selectedMode = null;
  }

  function retryAfterError() {
    gameStore.dispatch({ type: 'RETRY' });
    if ($gameStore.state === 'processing_input') {
      executeTurn();
    }
  }
</script>

<div class="min-h-screen bg-gray-900 text-gray-100">
  <!-- Header -->
  <header class="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
    <div class="max-w-screen-lg mx-auto px-4 py-4 flex justify-between items-center">
      <h1 class="text-2xl font-bold text-indigo-400">AI Text RPG</h1>
      {#if $gameStore.sessionId}
        <div class="w-64">
          <TokenMeter used={$gameStore.tokenUsed} budget={tokenBudget} />
        </div>
      {/if}
    </div>
  </header>

  <main class="py-8">
    {#if $gameStore.state === 'uninitialized' || $gameStore.state === 'mode_selection'}
      <!-- Mode Selection -->
      <div class="max-w-screen-md mx-auto px-4">
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold mb-4">Choose Your Adventure</h2>
          <p class="text-gray-400">Select a game mode to begin your journey</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            class="mode-card bg-gray-800 rounded-2xl p-6 hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl"
            on:click={() => startGame('dungeon')}
          >
            <div class="text-4xl mb-3">🏰</div>
            <h3 class="text-xl font-bold mb-2">Dungeon Crawl</h3>
            <p class="text-sm text-gray-400">
              Explore dark catacombs filled with monsters, traps, and treasure
            </p>
          </button>

          <button
            class="mode-card bg-gray-800 rounded-2xl p-6 hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl"
            on:click={() => startGame('journey')}
          >
            <div class="text-4xl mb-3">⚔️</div>
            <h3 class="text-xl font-bold mb-2">Hero's Journey</h3>
            <p class="text-sm text-gray-400">
              Embark on an epic quest with companions and moral choices
            </p>
          </button>

          <button
            class="mode-card bg-gray-800 rounded-2xl p-6 hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl"
            on:click={() => startGame('mystery')}
          >
            <div class="text-4xl mb-3">🔍</div>
            <h3 class="text-xl font-bold mb-2">Mystery Night</h3>
            <p class="text-sm text-gray-400">
              Solve a noir crime with clues, suspects, and time pressure
            </p>
          </button>
        </div>
      </div>
    {:else}
      <!-- Game In Progress -->
      <StoryPane />
      <ChoiceList />

      {#if $hasError}
        <div class="max-w-screen-md mx-auto px-4 mt-4">
          <div class="bg-red-900/50 border border-red-500 rounded-lg p-4">
            <p class="text-red-200 mb-3">
              ⚠️ Error: {$gameStore.error?.message || 'Something went wrong'}
            </p>
            <div class="flex gap-3">
              <button class="choice-button bg-red-600 hover:bg-red-700" on:click={retryAfterError}>
                Retry
              </button>
              <button class="choice-button bg-gray-600 hover:bg-gray-700" on:click={resetGame}>
                Start Over
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if $isGameOver}
        <div class="max-w-screen-md mx-auto px-4 mt-4">
          <div class="bg-indigo-900/50 border border-indigo-500 rounded-lg p-6 text-center">
            <h3 class="text-2xl font-bold mb-3">🎭 The End</h3>
            <p class="text-gray-300 mb-4">Your story has concluded.</p>
            <button class="choice-button bg-indigo-600 hover:bg-indigo-700" on:click={resetGame}>
              Start New Adventure
            </button>
          </div>
        </div>
      {/if}

      <!-- Footer Actions -->
      {#if !$isGameOver && !$hasError}
        <div class="max-w-screen-md mx-auto px-4 mt-8">
          <div class="flex justify-center gap-3">
            <button
              class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
              on:click={resetGame}
            >
              Reset Game
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </main>
</div>

<style>
  .mode-card {
    min-height: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    cursor: pointer;
  }
</style>
