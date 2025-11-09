<script lang="ts">
  import { gameStore, isLoading } from '../stores/gameStore';

  $: narration = $gameStore.currentNarration;
  $: streamBuffer = $gameStore.streamBuffer;
</script>

<div class="story-pane-container max-w-screen-md mx-auto px-4 py-6">
  {#if narration}
    <div class="story-pane prose prose-invert max-w-none">
      <p class="text-lg leading-relaxed">{narration}</p>
    </div>
  {/if}

  {#if $isLoading && streamBuffer}
    <div class="streaming-text prose prose-invert max-w-none mt-4">
      <p class="text-lg leading-relaxed">
        {streamBuffer}<span class="streaming-cursor"></span>
      </p>
    </div>
  {/if}

  {#if $isLoading && !streamBuffer}
    <div class="loading-indicator flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
    </div>
  {/if}
</div>

<style>
  .story-pane-container {
    min-height: 300px;
  }
</style>
