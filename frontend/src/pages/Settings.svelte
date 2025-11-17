<script lang="ts">
  import { settingsStore } from '../stores/settingsStore';

  export let onBack: () => void;

  $: darkMode = $settingsStore.darkMode;
  $: bossKeyEnabled = $settingsStore.bossKeyEnabled;

  function handleDarkModeChange() {
    settingsStore.toggleDarkMode();
  }

  function handleBossKeyChange() {
    settingsStore.toggleBossKeyEnabled();
  }
</script>

<div class="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
  <!-- Header -->
  <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
    <div class="max-w-screen-lg mx-auto px-4 py-4 flex justify-between items-center">
      <h1 class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Settings</h1>
      <button
        on:click={onBack}
        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
      >
        ← Back
      </button>
    </div>
  </header>

  <main class="py-8">
    <div class="max-w-screen-md mx-auto px-4">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 space-y-6 transition-colors">
        <!-- Dark Mode Setting -->
        <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex-1">
            <h3 class="text-lg font-semibold mb-1">Dark Mode</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Enable dark theme for the entire application. This setting is saved automatically.
            </p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer ml-4">
            <input
              type="checkbox"
              checked={darkMode}
              on:change={handleDarkModeChange}
              class="sr-only peer"
            />
            <div
              class="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"
            ></div>
          </label>
        </div>

        <!-- Boss Key Setting -->
        <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex-1">
            <h3 class="text-lg font-semibold mb-1">Boss Key</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Enable the boss key feature. When enabled, press <kbd class="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">Ctrl + /</kbd> to quickly switch to a coding interface that looks like you're working.
            </p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer ml-4">
            <input
              type="checkbox"
              checked={bossKeyEnabled}
              on:change={handleBossKeyChange}
              class="sr-only peer"
            />
            <div
              class="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"
            ></div>
          </label>
        </div>

        <!-- Info Section -->
        <div class="pt-4">
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
              ℹ️ About Boss Key
            </h4>
            <p class="text-sm text-blue-800 dark:text-blue-400">
              The boss key feature disguises the game as a code editor. When activated, the interface will look like you're working on a coding project. Press <kbd class="px-2 py-1 bg-blue-200 dark:bg-blue-800 rounded text-xs font-mono">Ctrl + /</kbd> again to return to the game.
            </p>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>

<style>
  kbd {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
</style>
