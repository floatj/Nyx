<script lang="ts">
  import { onMount } from 'svelte';
  import { gameStore, hasError, isGameOver } from '../stores/gameStore';
  import { settingsStore } from '../stores/settingsStore';
  import { apiService, type ModelConfig } from '../services/api';
  import SaveSlotModal from '../components/SaveSlotModal.svelte';
  import GameSettingsModal from '../components/GameSettingsModal.svelte';
  import StoryPane from '../components/StoryPane.svelte';
  import BossModePane from '../components/BossModePane.svelte';
  import ChoiceList from '../components/ChoiceList.svelte';
  import TokenMeter from '../components/TokenMeter.svelte';
  import Settings from './Settings.svelte';
  import CharacterSheet from '../components/CharacterSheet.svelte';
  import type { GameMode } from '../stores/gameStore';
  import type { SaveSlot } from '../services/storage';
  import { settingsService } from '../services/settings';
  import { t } from '../i18n';

  let tokenBudget = 20000;
  let selectedMode: GameMode | null = null;
  let showSaveModal = false;
  let saveModalMode: 'save' | 'load' = 'save';
  let showGameSettingsModal = false;
  let pendingGameMode: GameMode | null = null;
  let showCustomPromptModal = false;
  let customPromptText = '';
  let customCharacterStatusEnabled = settingsService.isCharacterStatusEnabled();
  let customCharacterStatus = {
    health: 100,
    stamina: 100,
    conditions: {
      injured: false,
      poisoned: false,
      blessed: false,
      cursed: false,
    },
    inventory: [] as string[],
  };
  let newInventoryItem = '';
  let showCustomStatusEditor = false;
  let fileInput: HTMLInputElement;
  let isGeneratingPrompt = false;
  let isOptimizingPrompt = false;
  let currentPage: 'home' | 'settings' = 'home';
  let availableModels: ModelConfig[] = [];
  let showModelSelector = false;

  // Load available models
  onMount(async () => {
    try {
      const modelsResponse = await apiService.getModels();
      availableModels = modelsResponse.models;

      // Initialize selected model from settings if not already set
      if (!$gameStore.selectedModel && $settingsStore.defaultModel) {
        gameStore.dispatch({ type: 'SET_SELECTED_MODEL', modelId: $settingsStore.defaultModel });
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  });

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

  function showGameSettings(mode: GameMode) {
    pendingGameMode = mode;
    showGameSettingsModal = true;
  }

  function confirmGameSettings(characterStatusEnabled: boolean) {
    if (pendingGameMode) {
      gameStore.dispatch({ type: 'SET_CHARACTER_STATUS_ENABLED', enabled: characterStatusEnabled });
      startGameWithSettings(pendingGameMode);
      pendingGameMode = null;
    }
  }

  async function startGameWithSettings(mode: GameMode) {
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
        customInitialCharacterStatus: $gameStore.customInitialCharacterStatus || undefined,
        history: $gameStore.history,
        player_input: $gameStore.history.length > 0 ? ($gameStore.history[$gameStore.history.length - 1].content as string) : '',
        characterStatusEnabled: $gameStore.characterStatusEnabled,
        language: $settingsStore.language,
        model: $gameStore.selectedModel || $settingsStore.defaultModel,
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
          characterStatus: data.characterStatus || null,
          customInitialCharacterStatus: data.customInitialCharacterStatus || null,
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
    customCharacterStatusEnabled = settingsService.isCharacterStatusEnabled();
    // Reset custom character status to defaults
    customCharacterStatus = {
      health: 100,
      stamina: 100,
      conditions: {
        injured: false,
        poisoned: false,
        blessed: false,
        cursed: false,
      },
      inventory: [],
    };
    newInventoryItem = '';
    showCustomStatusEditor = false;
  }

  function addInventoryItem() {
    if (newInventoryItem.trim() && customCharacterStatus.inventory.length < 20) {
      customCharacterStatus.inventory = [...customCharacterStatus.inventory, newInventoryItem.trim()];
      newInventoryItem = '';
    }
  }

  function removeInventoryItem(index: number) {
    customCharacterStatus.inventory = customCharacterStatus.inventory.filter((_, i) => i !== index);
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

    // Save the character status setting
    settingsService.setCharacterStatusEnabled(customCharacterStatusEnabled);

    gameStore.dispatch({ type: 'SELECT_MODE', mode: 'custom' });
    gameStore.dispatch({ type: 'SET_CUSTOM_PROMPT', prompt: customPromptText });
    gameStore.dispatch({ type: 'SET_CHARACTER_STATUS_ENABLED', enabled: customCharacterStatusEnabled });

    // Set custom character status if enabled
    if (customCharacterStatusEnabled) {
      gameStore.dispatch({
        type: 'SET_CUSTOM_CHARACTER_STATUS',
        status: customCharacterStatus
      });
    }

    showCustomPromptModal = false;
    startGameWithSettings('custom');
  }

  function navigateToSettings() {
    currentPage = 'settings';
  }

  function navigateToHome() {
    currentPage = 'home';
  }

  function handleModelChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = target.value === '' ? undefined : target.value;
    gameStore.dispatch({ type: 'SET_SELECTED_MODEL', modelId: value });
  }
</script>

{#if currentPage === 'settings'}
  <Settings onBack={navigateToHome} />
{:else}
<div class="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
  <!-- Header -->
  <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
    <div class="max-w-screen-lg mx-auto px-4 py-4">
      <div class="flex justify-between items-center mb-2">
        <button
          on:click={navigateToHome}
          class="text-2xl font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
        >
          {$settingsStore.isBossMode ? $t('app.bossTitle') : $t('app.title')}
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
              ⚙️ {$t('common.settings')}
            </button>
          {/if}
        </div>
      </div>
      <!-- Model Selector -->
      {#if availableModels.length > 0 && ($gameStore.state === 'mode_selection' || $gameStore.state === 'awaiting_choice' || $gameStore.sessionId)}
        <div class="flex items-center gap-2 text-sm">
          <label class="text-gray-600 dark:text-gray-400 font-medium">AI Model:</label>
          <select
            value={$gameStore.selectedModel || $settingsStore.defaultModel || ''}
            on:change={handleModelChange}
            class="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors text-sm"
          >
            {#each availableModels as model}
              <option value={model.id}>
                {model.name} ({model.provider}) {model.recommended ? '⭐' : ''}
              </option>
            {/each}
          </select>
          {@const currentModel = availableModels.find(m => m.id === ($gameStore.selectedModel || $settingsStore.defaultModel))}
          {#if currentModel}
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {currentModel.description} | Max: {currentModel.max_tokens} tokens
            </span>
          {/if}
        </div>
      {/if}
    </div>
  </header>

  <main class="py-8">
    {#if $gameStore.state === 'uninitialized' || $gameStore.state === 'mode_selection'}
      <!-- Mode Selection -->
      <div class="max-w-screen-md mx-auto px-4">
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold mb-4">{$t('modeSelection.title')}</h2>
          <p class="text-gray-500 dark:text-gray-400">{$t('modeSelection.subtitle')}</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => showGameSettings('dungeon')}
          >
            <div class="text-4xl mb-3">🏰</div>
            <h3 class="text-xl font-bold mb-2">{$t('modeSelection.modes.dungeon.name')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('modeSelection.modes.dungeon.description')}
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => showGameSettings('journey')}
          >
            <div class="text-4xl mb-3">⚔️</div>
            <h3 class="text-xl font-bold mb-2">{$t('modeSelection.modes.journey.name')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('modeSelection.modes.journey.description')}
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => showGameSettings('mystery')}
          >
            <div class="text-4xl mb-3">🔍</div>
            <h3 class="text-xl font-bold mb-2">{$t('modeSelection.modes.mystery.name')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('modeSelection.modes.mystery.description')}
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => showGameSettings('magical_girl')}
          >
            <div class="text-4xl mb-3">🌟</div>
            <h3 class="text-xl font-bold mb-2">{$t('modeSelection.modes.magical_girl.name')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('modeSelection.modes.magical_girl.description')}
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => showGameSettings('time_traveler')}
          >
            <div class="text-4xl mb-3">⏰</div>
            <h3 class="text-xl font-bold mb-2">{$t('modeSelection.modes.time_traveler.name')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('modeSelection.modes.time_traveler.description')}
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => showGameSettings('software_engineer')}
          >
            <div class="text-4xl mb-3">💻</div>
            <h3 class="text-xl font-bold mb-2">{$t('modeSelection.modes.software_engineer.name')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('modeSelection.modes.software_engineer.description')}
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => showGameSettings('bl_story')}
          >
            <div class="text-4xl mb-3">💙</div>
            <h3 class="text-xl font-bold mb-2">{$t('modeSelection.modes.bl_story.name')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('modeSelection.modes.bl_story.description')}
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => showGameSettings('gl_story')}
          >
            <div class="text-4xl mb-3">💖</div>
            <h3 class="text-xl font-bold mb-2">{$t('modeSelection.modes.gl_story.name')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('modeSelection.modes.gl_story.description')}
            </p>
          </button>

          <button
            class="mode-card bg-white dark:bg-gray-800 rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700"
            on:click={() => showGameSettings('alien_defense')}
          >
            <div class="text-4xl mb-3">🛸</div>
            <h3 class="text-xl font-bold mb-2">{$t('modeSelection.modes.alien_defense.name')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('modeSelection.modes.alien_defense.description')}
            </p>
          </button>

          <button
            class="mode-card bg-gradient-to-br from-purple-600 to-pink-600 dark:from-purple-800 dark:to-pink-800 rounded-2xl p-6 hover:from-purple-500 hover:to-pink-500 dark:hover:from-purple-700 dark:hover:to-pink-700 transition-all shadow-lg hover:shadow-xl border-2 border-purple-400 dark:border-purple-500"
            on:click={openCustomPromptModal}
          >
            <div class="text-4xl mb-3">✨</div>
            <h3 class="text-xl font-bold mb-2 text-white">{$t('modeSelection.modes.custom.name')}</h3>
            <p class="text-sm text-purple-50 dark:text-gray-300">
              {$t('modeSelection.modes.custom.description')}
            </p>
          </button>
        </div>

        <!-- Load Game Button -->
        <div class="text-center">
          <button
            class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            on:click={openLoadModal}
          >
            📂 {$t('common.loadSavedGame')}
          </button>
        </div>
      </div>
    {:else}
      <!-- Game In Progress -->
      {#if $settingsStore.isBossMode}
        <BossModePane />
      {:else}
        <div class="max-w-screen-xl mx-auto px-4">
        {#if $gameStore.characterStatusEnabled}
          <!-- Layout with Character Sheet -->
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <!-- Left Sidebar: Character Sheet -->
            <div class="lg:col-span-1">
              <div class="sticky top-20">
                <CharacterSheet status={$gameStore.characterStatus} />
              </div>
            </div>

            <!-- Main Content: Story and Choices -->
            <div class="lg:col-span-3">
              <StoryPane />
              <ChoiceList />
            </div>
          </div>
        {:else}
          <!-- Layout without Character Sheet -->
          <div class="max-w-screen-md mx-auto">
            <StoryPane />
            <ChoiceList />
          </div>
        {/if}
      </div>
      {/if}

      <!-- Error Handling -->
      {#if $hasError && !$settingsStore.isBossMode}
        <div class="max-w-screen-md mx-auto px-4 mt-4">
          <div class="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 rounded-lg p-4">
            <p class="text-red-800 dark:text-red-200 mb-3">
              ⚠️ {$t('common.error')}: {$gameStore.error?.message || $t('errors.generic')}
            </p>
            <div class="flex gap-3">
              <button class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors" on:click={retryAfterError}>
                {$t('common.retry')}
              </button>
              <button class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors" on:click={resetGame}>
                {$t('common.startOver')}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Character Death Screen -->
      {#if $gameStore.characterStatusEnabled && $gameStore.characterStatus?.health === 0 && !$settingsStore.isBossMode}
        <div class="max-w-screen-md mx-auto px-4 mt-4">
          <div class="bg-red-900/90 border-2 border-red-500 rounded-lg p-8 text-center shadow-2xl">
            <div class="text-6xl mb-4 animate-pulse">💀</div>
            <h3 class="text-3xl font-bold text-red-100 mb-3">{$t('gameOver.death.title')}</h3>
            <p class="text-red-200 mb-6">{$t('gameOver.death.message')}</p>
            <button class="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium shadow-lg hover:shadow-xl" on:click={resetGame}>
              {$t('common.startNewAdventure')}
            </button>
          </div>
        </div>
      {:else if $isGameOver && !$settingsStore.isBossMode}
        <!-- Regular Game Over -->
        <div class="max-w-screen-md mx-auto px-4 mt-4">
          <div class="bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-400 dark:border-indigo-500 rounded-lg p-6 text-center">
            <h3 class="text-2xl font-bold mb-3">🎭 {$t('gameOver.regular.title')}</h3>
            <p class="text-gray-700 dark:text-gray-300 mb-4">{$t('gameOver.regular.message')}</p>
            <button class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors" on:click={resetGame}>
              {$t('common.startNewAdventure')}
            </button>
          </div>
        </div>
      {/if}

      <!-- Footer Actions -->
      {#if !$isGameOver && !$hasError && !($gameStore.characterStatus?.health === 0) && !$settingsStore.isBossMode}
        <div class="max-w-screen-md mx-auto px-4 mt-8">
          <div class="flex justify-center gap-3">
            <button
              class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
              on:click={openSaveModal}
            >
              💾 {$t('common.saveGame')}
            </button>
            <button
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              on:click={openLoadModal}
            >
              📂 {$t('common.loadGame')}
            </button>
            <button
              class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
              on:click={resetGame}
            >
              {$t('common.resetGame')}
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

  <!-- Game Settings Modal -->
  {#if pendingGameMode}
    <GameSettingsModal
      isOpen={showGameSettingsModal}
      mode={pendingGameMode}
      onClose={() => (showGameSettingsModal = false)}
      onConfirm={confirmGameSettings}
    />
  {/if}

  <!-- Custom Prompt Modal -->
  {#if showCustomPromptModal}
    <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl">
        <h2 class="text-2xl font-bold mb-4 text-purple-600 dark:text-purple-400">{$t('customPrompt.title')}</h2>
        <p class="text-gray-700 dark:text-gray-300 mb-4">
          {$t('customPrompt.description')}
        </p>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {$t('customPrompt.label')}
          </label>
          <textarea
            bind:value={customPromptText}
            class="w-full h-48 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-3 border border-gray-300 dark:border-gray-600 focus:border-purple-500 focus:outline-none resize-none"
            placeholder={$t('customPrompt.placeholder')}
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
              {$t('customPrompt.generating')}
            {:else}
              🎲 {$t('customPrompt.generateRandom')}
            {/if}
          </button>
          <button
            class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
            on:click={optimizePrompt}
            disabled={isGeneratingPrompt || isOptimizingPrompt || !customPromptText.trim()}
          >
            {#if isOptimizingPrompt}
              <span class="inline-block animate-spin">⏳</span>
              {$t('customPrompt.optimizing')}
            {:else}
              ✨ {$t('customPrompt.optimizeYourPrompt')}
            {/if}
          </button>
        </div>

        <!-- Character Status Toggle -->
        <div class="mb-4 bg-gray-700 rounded-lg p-4">
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={customCharacterStatusEnabled}
              disabled={isGeneratingPrompt || isOptimizingPrompt}
              class="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div class="flex-1">
              <div class="font-medium text-gray-100">{$t('customPrompt.enableCharacterStatus')}</div>
              <p class="text-sm text-gray-400 mt-1">
                {$t('customPrompt.characterStatusDescription')}
              </p>
            </div>
          </label>

          {#if customCharacterStatusEnabled}
            <div class="mt-4 pt-4 border-t border-gray-600">
              <button
                class="w-full flex items-center justify-between text-gray-200 hover:text-white transition-colors mb-3"
                on:click={() => showCustomStatusEditor = !showCustomStatusEditor}
              >
                <span class="font-medium">⚙️ {$t('customPrompt.customizeInitialStatus')}</span>
                <span class="text-xl">{showCustomStatusEditor ? '▼' : '▶'}</span>
              </button>

              {#if showCustomStatusEditor}
                <div class="space-y-4 bg-gray-800 rounded-lg p-4">
                  <!-- Health & Stamina -->
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm text-gray-300 mb-2">
                        {$t('customPrompt.health')}: {customCharacterStatus.health}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        bind:value={customCharacterStatus.health}
                        class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                      />
                    </div>
                    <div>
                      <label class="block text-sm text-gray-300 mb-2">
                        {$t('customPrompt.stamina')}: {customCharacterStatus.stamina}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        bind:value={customCharacterStatus.stamina}
                        class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>

                  <!-- Conditions -->
                  <div>
                    <label class="block text-sm text-gray-300 mb-2">{$t('customPrompt.startingConditions')}</label>
                    <div class="grid grid-cols-2 gap-2">
                      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={customCharacterStatus.conditions.injured}
                          class="w-4 h-4 rounded border-gray-600 bg-gray-600 text-red-600"
                        />
                        <span>🩹 {$t('customPrompt.conditionsLabel.injured')}</span>
                      </label>
                      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={customCharacterStatus.conditions.poisoned}
                          class="w-4 h-4 rounded border-gray-600 bg-gray-600 text-green-600"
                        />
                        <span>☠️ {$t('customPrompt.conditionsLabel.poisoned')}</span>
                      </label>
                      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={customCharacterStatus.conditions.blessed}
                          class="w-4 h-4 rounded border-gray-600 bg-gray-600 text-yellow-600"
                        />
                        <span>✨ {$t('customPrompt.conditionsLabel.blessed')}</span>
                      </label>
                      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={customCharacterStatus.conditions.cursed}
                          class="w-4 h-4 rounded border-gray-600 bg-gray-600 text-purple-600"
                        />
                        <span>🌑 {$t('customPrompt.conditionsLabel.cursed')}</span>
                      </label>
                    </div>
                  </div>

                  <!-- Inventory -->
                  <div>
                    <label class="block text-sm text-gray-300 mb-2">
                      {$t('customPrompt.startingInventory')} ({customCharacterStatus.inventory.length}/20)
                    </label>
                    <div class="flex gap-2 mb-2">
                      <input
                        type="text"
                        bind:value={newInventoryItem}
                        on:keydown={(e) => e.key === 'Enter' && addInventoryItem()}
                        placeholder={$t('customPrompt.addItemPlaceholder')}
                        class="flex-1 bg-gray-700 text-gray-100 rounded px-3 py-2 text-sm border border-gray-600 focus:border-purple-500 focus:outline-none"
                        maxlength="50"
                      />
                      <button
                        on:click={addInventoryItem}
                        disabled={!newInventoryItem.trim() || customCharacterStatus.inventory.length >= 20}
                        class="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
                      >
                        {$t('customPrompt.add')}
                      </button>
                    </div>
                    {#if customCharacterStatus.inventory.length > 0}
                      <div class="space-y-1 max-h-32 overflow-y-auto">
                        {#each customCharacterStatus.inventory as item, index}
                          <div class="flex items-center justify-between bg-gray-700 rounded px-3 py-2 text-sm">
                            <span class="text-gray-200">{index + 1}. {item}</span>
                            <button
                              on:click={() => removeInventoryItem(index)}
                              class="text-red-400 hover:text-red-300 transition-colors"
                              title="Remove item"
                            >
                              ✕
                            </button>
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <div class="text-sm text-gray-500 italic text-center py-2 bg-gray-700/30 rounded">
                        {$t('customPrompt.noStartingItems')}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {$t('customPrompt.orLoadFromFile')}
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
            {$t('customPrompt.cancel')}
          </button>
          <button
            class="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            on:click={startCustomGame}
            disabled={isGeneratingPrompt || isOptimizingPrompt}
          >
            {$t('customPrompt.startAdventure')}
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
