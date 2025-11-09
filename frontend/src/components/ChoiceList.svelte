<script lang="ts">
  import { gameStore, canSelectChoice } from '../stores/gameStore';

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
          class="choice-button"
          disabled={!$canSelectChoice}
          on:click={() => handleChoice(choice.id)}
          data-test={`choice-${choice.id}`}
        >
          {choice.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
