<script lang="ts">
  import { gameStore, canSelectChoice, isLoading } from '../stores/gameStore';

  $: choices = $gameStore.choices;

  function handleChoice(choiceId: string) {
    gameStore.dispatch({ type: 'SELECT_CHOICE', choiceId });
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
    </div>
  {/if}
</div>
