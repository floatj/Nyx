<script lang="ts">
  import { gameStore, canSelectChoice, isLoading } from '../stores/gameStore';
  import { t } from '../i18n';

  $: choices = $gameStore.choices;
  let customAction = '';

  function handleChoice(choiceId: string) {
    gameStore.dispatch({ type: 'SELECT_CHOICE', choiceId });
  }

  function handleCustomAction() {
    if (customAction.trim()) {
      gameStore.dispatch({ type: 'SELECT_CUSTOM_CHOICE', customText: customAction.trim() });
      customAction = '';
    }
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && customAction.trim() && $canSelectChoice) {
      handleCustomAction();
    }
  }
</script>

<div class="choice-list max-w-screen-md mx-auto px-4 py-4">
  {#if choices && choices.length > 0}
    <div class="grid grid-cols-1 gap-3">
      {#each choices as choice (choice.id)}
        <button
          class="choice-button relative"
          disabled={!$canSelectChoice}
          on:click={() => handleChoice(choice.id)}
          data-test={`choice-${choice.id}`}
        >
          {#if !$canSelectChoice && $isLoading}
            <span class="absolute left-3 top-1/2 -translate-y-1/2 inline-block animate-spin">⏳</span>
          {/if}
          {choice.label}
        </button>
      {/each}

      <!-- Custom Action Input -->
      <div class="custom-action-container flex gap-3 mt-2">
        <input
          type="text"
          bind:value={customAction}
          on:keypress={handleKeyPress}
          disabled={!$canSelectChoice}
          placeholder={$t('choices.customPlaceholder')}
          class="custom-action-input"
          data-test="custom-action-input"
        />
        <button
          class="custom-action-button relative"
          disabled={!$canSelectChoice || !customAction.trim()}
          on:click={handleCustomAction}
          data-test="custom-action-button"
        >
          {#if !$canSelectChoice && $isLoading}
            <span class="absolute left-3 top-1/2 -translate-y-1/2 inline-block animate-spin">⏳</span>
          {/if}
          {$t('choices.customAction')}
        </button>
      </div>
    </div>
  {/if}
</div>
