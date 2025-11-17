<script lang="ts">
  import { gameStore, isLoading } from '../stores/gameStore';
  import { onMount, afterUpdate } from 'svelte';
  import type { Message, LLMOutput } from '../stores/gameStore';

  $: history = $gameStore.history;
  $: streamBuffer = $gameStore.streamBuffer;

  let scrollContainer: HTMLDivElement;
  let shouldAutoScroll = true;

  // Auto-scroll to bottom when new content appears
  afterUpdate(() => {
    if (scrollContainer && shouldAutoScroll) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  });

  // Check if user has scrolled up
  function handleScroll() {
    if (scrollContainer) {
      const isAtBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop <= scrollContainer.clientHeight + 50;
      shouldAutoScroll = isAtBottom;
    }
  }

  // Extract narration from message content
  function getNarration(content: string | LLMOutput): string {
    if (typeof content === 'string') {
      return content;
    }
    return content.narration;
  }
</script>

<div
  class="story-pane-container max-w-screen-md mx-auto px-4 py-6"
  bind:this={scrollContainer}
  on:scroll={handleScroll}
>
  {#if history.length > 0}
    <div class="story-history">
      {#each history as message, index}
        {#if message.role === 'assistant'}
          <div class="story-entry prose dark:prose-invert max-w-none mb-6">
            <p class="text-lg leading-relaxed text-gray-800 dark:text-gray-100">{getNarration(message.content)}</p>
          </div>
        {:else if message.role === 'user'}
          <div class="choice-entry mb-6">
            <div class="inline-block bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-300 dark:border-indigo-500/50 rounded-lg px-4 py-2">
              <p class="text-indigo-800 dark:text-indigo-200 font-medium">▶ {message.content}</p>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if $isLoading && streamBuffer}
    <div class="streaming-text prose dark:prose-invert max-w-none mt-4">
      <p class="text-lg leading-relaxed text-gray-800 dark:text-gray-100">
        {streamBuffer}<span class="streaming-cursor"></span>
      </p>
    </div>
  {/if}

  {#if $isLoading && !streamBuffer && history.length === 0}
    <div class="loading-indicator flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
    </div>
  {/if}
</div>

<style>
  .story-pane-container {
    min-height: 300px;
    max-height: 600px;
    overflow-y: auto;
    scroll-behavior: smooth;
  }

  /* Custom scrollbar styling */
  .story-pane-container::-webkit-scrollbar {
    width: 8px;
  }

  .story-pane-container::-webkit-scrollbar-track {
    background: rgba(31, 41, 55, 0.5);
    border-radius: 4px;
  }

  .story-pane-container::-webkit-scrollbar-thumb {
    background: rgba(99, 102, 241, 0.5);
    border-radius: 4px;
  }

  .story-pane-container::-webkit-scrollbar-thumb:hover {
    background: rgba(99, 102, 241, 0.7);
  }

  .story-entry {
    animation: fadeIn 0.3s ease-in;
  }

  .choice-entry {
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
