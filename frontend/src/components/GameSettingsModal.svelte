<script lang="ts">
  import { settingsService } from '../services/settings';
  import type { GameMode } from '../stores/gameStore';

  export let isOpen: boolean = false;
  export let mode: GameMode;
  export let onClose: () => void;
  export let onConfirm: (characterStatusEnabled: boolean) => void;

  let characterStatusEnabled = settingsService.isCharacterStatusEnabled();

  $: if (isOpen) {
    // Load current setting when modal opens
    characterStatusEnabled = settingsService.isCharacterStatusEnabled();
  }

  function handleConfirm() {
    // Save to localStorage
    settingsService.setCharacterStatusEnabled(characterStatusEnabled);
    onConfirm(characterStatusEnabled);
    onClose();
  }

  function handleCancel() {
    onClose();
  }

  function getModeDisplayName(mode: GameMode): string {
    const names: Record<GameMode, string> = {
      dungeon: 'Dungeon Crawl',
      journey: "Hero's Journey",
      mystery: 'Mystery Night',
      magical_girl: 'Magical Girl Battle',
      time_traveler: 'Time Traveler',
      software_engineer: 'Lazy Office Day',
      bl_story: 'Boys-Love Story',
      gl_story: 'Girls-Love Story',
      alien_defense: 'Alien Defense',
      custom: 'Custom Adventure',
    };
    return names[mode] || mode;
  }

  function getModeIcon(mode: GameMode): string {
    const icons: Record<GameMode, string> = {
      dungeon: '🏰',
      journey: '⚔️',
      mystery: '🔍',
      magical_girl: '🌟',
      time_traveler: '⏰',
      software_engineer: '💻',
      bl_story: '💙',
      gl_story: '💖',
      alien_defense: '🛸',
      custom: '✨',
    };
    return icons[mode] || '🎮';
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
    <div class="bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
      <div class="flex items-center gap-3 mb-4">
        <span class="text-4xl">{getModeIcon(mode)}</span>
        <div>
          <h2 class="text-2xl font-bold text-gray-100">Game Settings</h2>
          <p class="text-sm text-gray-400">{getModeDisplayName(mode)}</p>
        </div>
      </div>

      <div class="space-y-4 mb-6">
        <p class="text-gray-300 text-sm">
          Configure your game settings before starting the adventure.
        </p>

        <!-- Character Status Toggle -->
        <div class="bg-gray-700 rounded-lg p-4">
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={characterStatusEnabled}
              class="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
            />
            <div class="flex-1">
              <div class="font-medium text-gray-100">Enable Character Status Tracking</div>
              <p class="text-sm text-gray-400 mt-1">
                Track health, stamina, conditions, and inventory throughout your adventure. This
                adds RPG-style mechanics to your story.
              </p>
            </div>
          </label>
        </div>

        <div class="text-xs text-gray-500 italic">
          Your preference will be saved and applied to future games.
        </div>
      </div>

      <div class="flex gap-3 justify-end">
        <button
          class="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
          on:click={handleCancel}
        >
          Cancel
        </button>
        <button
          class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors font-medium"
          on:click={handleConfirm}
        >
          Start Adventure
        </button>
      </div>
    </div>
  </div>
{/if}
