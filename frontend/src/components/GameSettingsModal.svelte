<script lang="ts">
  import { settingsService } from '../services/settings';
  import type { GameMode } from '../stores/gameStore';
  import { t } from '../i18n';

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

  function getModeDisplayName(mode: GameMode, t: any): string {
    const nameKeys: Record<GameMode, string> = {
      dungeon: 'modeSelection.modes.dungeon.name',
      journey: 'modeSelection.modes.journey.name',
      mystery: 'modeSelection.modes.mystery.name',
      magical_girl: 'modeSelection.modes.magical_girl.name',
      time_traveler: 'modeSelection.modes.time_traveler.name',
      software_engineer: 'modeSelection.modes.software_engineer.name',
      bl_story: 'modeSelection.modes.bl_story.name',
      gl_story: 'modeSelection.modes.gl_story.name',
      alien_defense: 'modeSelection.modes.alien_defense.name',
      custom: 'modeSelection.modes.custom.name',
    };
    return t(nameKeys[mode]) || mode;
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
          <h2 class="text-2xl font-bold text-gray-100">{$t('gameSettings.title')}</h2>
          <p class="text-sm text-gray-400">{getModeDisplayName(mode, $t)}</p>
        </div>
      </div>

      <div class="space-y-4 mb-6">
        <!-- Character Status Toggle -->
        <div class="bg-gray-700 rounded-lg p-4">
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={characterStatusEnabled}
              class="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
            />
            <div class="flex-1">
              <div class="font-medium text-gray-100">{$t('gameSettings.characterStatus.label')}</div>
              <p class="text-sm text-gray-400 mt-1">
                {$t('gameSettings.characterStatus.description')}
              </p>
            </div>
          </label>
        </div>
      </div>

      <div class="flex gap-3 justify-end">
        <button
          class="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
          on:click={handleCancel}
        >
          {$t('customPrompt.cancel')}
        </button>
        <button
          class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors font-medium"
          on:click={handleConfirm}
        >
          {$t('gameSettings.start')}
        </button>
      </div>
    </div>
  </div>
{/if}
