<script lang="ts">
  import { settingsStore, type Language } from '../stores/settingsStore';
  import { t } from '../i18n';

  export let onBack: () => void;

  $: darkMode = $settingsStore.darkMode;
  $: bossKeyEnabled = $settingsStore.bossKeyEnabled;
  $: language = $settingsStore.language;

  function handleDarkModeChange() {
    settingsStore.toggleDarkMode();
  }

  function handleBossKeyChange() {
    settingsStore.toggleBossKeyEnabled();
  }

  function handleLanguageChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    settingsStore.setLanguage(target.value as Language);
  }
</script>

<div class="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
  <!-- Header -->
  <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
    <div class="max-w-screen-lg mx-auto px-4 py-4 flex justify-between items-center">
      <h1 class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{$t('settings.title')}</h1>
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
            <h3 class="text-lg font-semibold mb-1">{$t('settings.darkMode.label')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('settings.darkMode.description')}
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
            <h3 class="text-lg font-semibold mb-1">{$t('settings.bossKey.label')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('settings.bossKey.description')}
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

        <!-- Language Setting -->
        <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex-1">
            <h3 class="text-lg font-semibold mb-1">{$t('settings.language.label')}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {$t('settings.language.description')}
            </p>
          </div>
          <select
            value={language}
            on:change={handleLanguageChange}
            class="ml-4 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            <option value="en">{$t('settings.language.options.en')}</option>
            <option value="zh-TW">{$t('settings.language.options.zh-TW')}</option>
          </select>
        </div>

        <!-- Info Section -->
        <div class="pt-4">
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
              ℹ️ {$t('settings.aboutBossKey.title')}
            </h4>
            <p class="text-sm text-blue-800 dark:text-blue-400">
              {$t('settings.aboutBossKey.description')} <kbd class="px-2 py-1 bg-blue-200 dark:bg-blue-800 rounded text-xs font-mono">{$t('settings.aboutBossKey.key')}</kbd> {$t('settings.aboutBossKey.action')} {$t('settings.aboutBossKey.tip')}
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
