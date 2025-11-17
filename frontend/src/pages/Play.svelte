<script lang="ts">
  import { onMount } from 'svelte';
  import { gameStore, hasError, isGameOver } from '../stores/gameStore';
  import { settingsStore } from '../stores/settingsStore';
  import { apiService } from '../services/api';
  import SaveSlotModal from '../components/SaveSlotModal.svelte';
  import StoryPane from '../components/StoryPane.svelte';
  import BossModePane from '../components/BossModePane.svelte';
  import ChoiceList from '../components/ChoiceList.svelte';
  import TokenMeter from '../components/TokenMeter.svelte';
  import Settings from './Settings.svelte';
  import type { GameMode } from '../stores/gameStore';
  import type { SaveSlot } from '../services/storage';

  let tokenBudget = 20000;
  let selectedMode: GameMode | null = null;
  let showSaveModal = false;
  let saveModalMode: 'save' | 'load' = 'save';
  let showCustomPromptModal = false;
  let customPromptText = '';
  let fileInput: HTMLInputElement;
  let isGeneratingPrompt = false;
  let isOptimizingPrompt = false;
  let currentPage: 'home' | 'settings' = 'home';

  // Boss key listener
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '/' && $settingsStore.bossKeyEnabled) {
        e.preventDefault();
        settingsStore.toggleBossMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

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
        customPrompt: $gameStore.customPrompt || undefined,
        history: $gameStore.history,
        player_input: $gameStore.history.length > 0 ? ($gameStore.history[$gameStore.history.length - 1].content as string) : '',
      };

      for await (const event of apiService.playTurn(playRequest)) {
        if (event.type === 'content') {
          gameStore.dispatch({ type: 'STREAM_CHUNK', data: event.chunk });
        } else if (event.type === 'complete') {
          gameStore.dispatch({ type: 'STREAM_COMPLETE', output: event.output, tokenUsed: event.tokenUsed });
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

  function openSaveModal() {
    saveModalMode = 'save';
    showSaveModal = true;
  }

  function openLoadModal() {
    saveModalMode = 'load';
    showSaveModal = true;
  }

  function handleLoadGame(slot: SaveSlot) {
    // Restore game state from save
    gameStore.dispatch({ type: 'RESET' });

    // Update game store with loaded data
    const data = slot.data;

    // Dispatch events to restore state
    gameStore.dispatch({ type: 'SELECT_MODE', mode: data.mode as GameMode });
    gameStore.dispatch({ type: 'START_GAME' });
    gameStore.dispatch({
      type: 'SESSION_READY',
      sessionId: data.sessionId || '',
      token: data.sessionToken || '',
    });

    // Manually update store state (workaround for complex restoration)
    gameStore.subscribe((state) => {
      if (state.state === 'streaming') {
        // Inject saved data
        Object.assign(state, {
          history: data.history,
          currentNarration: data.currentNarration,
          choices: data.choices,
          tokenUsed: data.tokenUsed,
          state: 'awaiting_choice',
        });
      }
    })();

    selectedMode = data.mode as GameMode;
    tokenBudget = 20000; // Reset or load from session
  }

  function openCustomPromptModal() {
    showCustomPromptModal = true;
    customPromptText = '';
  }

  function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      customPromptText = content;
    };
    reader.readAsText(file);
  }

  async function generateRandomPrompt() {
    try {
      isGeneratingPrompt = true;
      const prompt = await apiService.generatePrompt();
      customPromptText = prompt;
    } catch (error) {
      console.error('Failed to generate prompt:', error);
      alert('Failed to generate prompt. Please try again.');
    } finally {
      isGeneratingPrompt = false;
    }
  }

  async function optimizePrompt() {
    if (!customPromptText.trim()) {
      alert('Please enter a prompt first');
      return;
    }

    try {
      isOptimizingPrompt = true;
      const optimized = await apiService.optimizePrompt(customPromptText);
      customPromptText = optimized;
    } catch (error) {
      console.error('Failed to optimize prompt:', error);
      alert('Failed to optimize prompt. Please try again.');
    } finally {
      isOptimizingPrompt = false;
    }
  }

  function startCustomGame() {
    if (!customPromptText.trim()) {
      alert('Please enter or load a custom prompt');
      return;
    }

    gameStore.dispatch({ type: 'SELECT_MODE', mode: 'custom' });
    gameStore.dispatch({ type: 'SET_CUSTOM_PROMPT', prompt: customPromptText });
    showCustomPromptModal = false;
    startGame('custom');
  }

  function navigateToSettings() {
    currentPage = 'settings';
  }

  function navigateToHome() {
    currentPage = 'home';
  }
</script>

{#if currentPage === 'settings'}
  <Settings onBack={navigateToHome} />
{:else}
<div class="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
  <!-- Header -->
  <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
    <div class="max-w-screen-lg mx-auto px-4 py-4 flex justify-between items-center">
      <button
        on:click={navigateToHome}
        class="text-2xl font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
      >
        {$settingsStore.isBossMode ? 'Claude Code Web (Research preview)' : 'Project Nyx'}
      </button>
      <div class="flex items-center gap-3">
        {#if $gameStore.sessionId}
          <div class="w-64">
            <TokenMeter used={$gameStore.tokenUsed} budget={tokenBudget} />
          </div>
        {/if}
        {#if !$settingsStore.isBossMode}
          <button
            on:click={navigateToSettings}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            ⚙️ Settings
          </button>
        {/if}
      </div>
    </div>
  </header>

  <main class="py-8">
    {#if $gameStore.state === 'uninitialized' || $gameStore.state === 'mode_selection'}
      <!-- Mode Selection -->
      <div class="max-w-screen-md mx-auto px-4">
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold mb-4">Choose Your Adventure</h2>
          <p class="text-gray-500 dark:text-gray-400">Select a game mode to begin your journey</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => startGame('dungeon')}
          >
            <div class="text-4xl mb-3">🏰</div>
            <h3 class="text-xl font-bold mb-2">Dungeon Crawl</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Explore dark catacombs filled with monsters, traps, and treasure
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => startGame('journey')}
          >
            <div class="text-4xl mb-3">⚔️</div>
            <h3 class="text-xl font-bold mb-2">Hero's Journey</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Embark on an epic quest with companions and moral choices
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => startGame('mystery')}
          >
            <div class="text-4xl mb-3">🔍</div>
            <h3 class="text-xl font-bold mb-2">Mystery Night</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Solve a noir crime with clues, suspects, and time pressure
            </p>
          </button>

          <button
            class="mode-card bg-gradient-to-br from-purple-600 to-pink-600 dark:from-purple-800 dark:to-pink-800 rounded-2xl p-6 hover:from-purple-500 hover:to-pink-500 dark:hover:from-purple-700 dark:hover:to-pink-700 transition-all shadow-lg hover:shadow-xl border-2 border-purple-400 dark:border-purple-500"
            on:click={openCustomPromptModal}
          >
            <div class="text-4xl mb-3">✨</div>
            <h3 class="text-xl font-bold mb-2 text-white">Custom Adventure</h3>
            <p class="text-sm text-purple-50 dark:text-gray-300">
              Create your own story with a custom prompt
            </p>
          </button>
        </div>

        <!-- Load Game Button -->
        <div class="text-center">
          <button
            class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            on:click={openLoadModal}
          >
            📂 Load Saved Game
          </button>
        </div>
      </div>
    {:else}
      <!-- Game In Progress -->
      {#if $settingsStore.isBossMode}
        <BossModePane />
      {:else}
        <StoryPane />
      {/if}
      {#if !$settingsStore.isBossMode}
        <ChoiceList />
      {/if}

      {#if $hasError && !$settingsStore.isBossMode}
        <div class="max-w-screen-md mx-auto px-4 mt-4">
          <div class="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 rounded-lg p-4">
            <p class="text-red-800 dark:text-red-200 mb-3">
              ⚠️ Error: {$gameStore.error?.message || 'Something went wrong'}
            </p>
            <div class="flex gap-3">
              <button class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors" on:click={retryAfterError}>
                Retry
              </button>
              <button class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors" on:click={resetGame}>
                Start Over
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if $isGameOver && !$settingsStore.isBossMode}
        <div class="max-w-screen-md mx-auto px-4 mt-4">
          <div class="bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-400 dark:border-indigo-500 rounded-lg p-6 text-center">
            <h3 class="text-2xl font-bold mb-3">🎭 The End</h3>
            <p class="text-gray-700 dark:text-gray-300 mb-4">Your story has concluded.</p>
            <button class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors" on:click={resetGame}>
              Start New Adventure
            </button>
          </div>
        </div>
      {/if}

      <!-- Footer Actions -->
      {#if !$isGameOver && !$hasError && !$settingsStore.isBossMode}
        <div class="max-w-screen-md mx-auto px-4 mt-8">
          <div class="flex justify-center gap-3">
            <button
              class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
              on:click={openSaveModal}
            >
              💾 Save Game
            </button>
            <button
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              on:click={openLoadModal}
            >
              📂 Load Game
            </button>
            <button
              class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
              on:click={resetGame}
            >
              Reset Game
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </main>

  <!-- Save/Load Modal -->
  <SaveSlotModal
    isOpen={showSaveModal}
    mode={saveModalMode}
    onClose={() => (showSaveModal = false)}
    onLoad={handleLoadGame}
  />

  <!-- Custom Prompt Modal -->
  {#if showCustomPromptModal}
    <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl">
        <h2 class="text-2xl font-bold mb-4 text-purple-600 dark:text-purple-400">Create Custom Adventure</h2>
        <p class="text-gray-700 dark:text-gray-300 mb-4">
          Enter your own story prompt or load from a text/markdown file. The AI will use your prompt to start the adventure.
        </p>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Custom Prompt
          </label>
          <textarea
            bind:value={customPromptText}
            class="w-full h-48 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-3 border border-gray-300 dark:border-gray-600 focus:border-purple-500 focus:outline-none resize-none"
            placeholder="Example: You are a space explorer who has just discovered an ancient alien artifact on a remote planet. The artifact begins to glow as you approach it..."
            disabled={isGeneratingPrompt || isOptimizingPrompt}
          ></textarea>
        </div>

        <!-- Prompt Generation Buttons -->
        <div class="mb-4 flex gap-3">
          <button
            class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
            on:click={generateRandomPrompt}
            disabled={isGeneratingPrompt || isOptimizingPrompt}
          >
            {#if isGeneratingPrompt}
              <span class="inline-block animate-spin">⏳</span>
              Generating...
            {:else}
              🎲 Generate Random Prompt
            {/if}
          </button>
          <button
            class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
            on:click={optimizePrompt}
            disabled={isGeneratingPrompt || isOptimizingPrompt || !customPromptText.trim()}
          >
            {#if isOptimizingPrompt}
              <span class="inline-block animate-spin">⏳</span>
              Optimizing...
            {:else}
              ✨ Optimize Your Prompt
            {/if}
          </button>
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Or Load from File
          </label>
          <input
            type="file"
            accept=".txt,.md,.markdown"
            bind:this={fileInput}
            on:change={handleFileUpload}
            disabled={isGeneratingPrompt || isOptimizingPrompt}
            class="w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2 border border-gray-300 dark:border-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700 file:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div class="flex gap-3 justify-end">
          <button
            class="px-6 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            on:click={() => (showCustomPromptModal = false)}
            disabled={isGeneratingPrompt || isOptimizingPrompt}
          >
            Cancel
          </button>
          <button
            class="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            on:click={startCustomGame}
            disabled={isGeneratingPrompt || isOptimizingPrompt}
          >
            Start Adventure
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
{/if}

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
