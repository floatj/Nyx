<script lang="ts">
  import { gameStore, isLoading } from '../stores/gameStore';
  import { afterUpdate } from 'svelte';
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
      const isAtBottom =
        scrollContainer.scrollHeight - scrollContainer.scrollTop <=
        scrollContainer.clientHeight + 50;
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

  // Transform story text into fake code
  function transformToCode(text: string, isUser: boolean = false): string {
    if (isUser) {
      return `// User action: ${text}`;
    }

    // Split text into sentences
    const sentences = text.split(/([.!?]+\s+)/);
    const codeLines: string[] = [];

    // Generate random fake code patterns
    const patterns = [
      (s: string) => `const ${randomVar()} = await processStory("${s.trim().slice(0, 30)}...");`,
      (s: string) => `function ${randomFunc()}() {\n  return "${s.trim().slice(0, 30)}...";\n}`,
      (s: string) => `if (${randomVar()} === true) {\n  console.log("${s.trim().slice(0, 30)}...");\n}`,
      (s: string) => `// Story: ${s.trim()}`,
      (s: string) => `const data = { message: "${s.trim().slice(0, 30)}...", timestamp: Date.now() };`,
      (s: string) => `async function ${randomFunc()}() {\n  const result = await api.fetch("${s.trim().slice(0, 20)}...");\n  return result;\n}`,
    ];

    let lineCount = 0;
    for (const sentence of sentences) {
      if (sentence.trim() && lineCount < 15) {
        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        codeLines.push(pattern(sentence));
        lineCount++;
      }
    }

    return codeLines.join('\n\n');
  }

  function randomVar(): string {
    const vars = ['storyData', 'gameState', 'playerChoice', 'narrative', 'result', 'output', 'response'];
    return vars[Math.floor(Math.random() * vars.length)];
  }

  function randomFunc(): string {
    const funcs = ['handleStory', 'processGame', 'updateNarrative', 'executeChoice', 'generateOutput', 'fetchData'];
    return funcs[Math.floor(Math.random() * funcs.length)];
  }

  // Syntax highlighting classes (random colors)
  function getRandomSyntaxClass(): string {
    const classes = ['text-blue-400', 'text-green-400', 'text-yellow-400', 'text-purple-400', 'text-pink-400'];
    return classes[Math.floor(Math.random() * classes.length)];
  }
</script>

<div
  class="boss-mode-container max-w-screen-lg mx-auto px-4 py-6 font-mono text-sm"
  bind:this={scrollContainer}
  on:scroll={handleScroll}
>
  {#if history.length > 0}
    <div class="code-history">
      {#each history as message, index}
        {#if message.role === 'assistant'}
          <div class="code-block mb-6 bg-gray-900 dark:bg-gray-950 p-4 rounded-lg border border-gray-700">
            <div class="text-gray-500 text-xs mb-2">// src/game/story.ts</div>
            <pre class="text-green-400 whitespace-pre-wrap">{transformToCode(getNarration(message.content))}</pre>
          </div>
        {:else if message.role === 'user'}
          <div class="code-block mb-6 bg-gray-900 dark:bg-gray-950 p-4 rounded-lg border border-gray-700">
            <div class="text-gray-500 text-xs mb-2">// src/game/input.ts</div>
            <pre class="text-blue-400 whitespace-pre-wrap">{transformToCode(message.content, true)}</pre>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if $isLoading && streamBuffer}
    <div class="code-block mb-6 bg-gray-900 dark:bg-gray-950 p-4 rounded-lg border border-gray-700">
      <div class="text-gray-500 text-xs mb-2">// src/game/stream.ts</div>
      <pre class="text-yellow-400 whitespace-pre-wrap">{transformToCode(streamBuffer)}<span class="boss-cursor"></span></pre>
    </div>
  {/if}

  {#if $isLoading && !streamBuffer && history.length === 0}
    <div class="loading-indicator flex items-center justify-center py-12">
      <div class="text-gray-500">
        <span class="animate-pulse">// Compiling...</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .boss-mode-container {
    min-height: 300px;
    max-height: 600px;
    overflow-y: auto;
    scroll-behavior: smooth;
    background: #0d1117;
    border-radius: 8px;
    border: 1px solid #30363d;
  }

  /* Custom scrollbar styling */
  .boss-mode-container::-webkit-scrollbar {
    width: 8px;
  }

  .boss-mode-container::-webkit-scrollbar-track {
    background: rgba(31, 41, 55, 0.5);
    border-radius: 4px;
  }

  .boss-mode-container::-webkit-scrollbar-thumb {
    background: rgba(99, 102, 241, 0.5);
    border-radius: 4px;
  }

  .boss-mode-container::-webkit-scrollbar-thumb:hover {
    background: rgba(99, 102, 241, 0.7);
  }

  .code-block {
    animation: fadeIn 0.3s ease-in;
  }

  .boss-cursor {
    display: inline-block;
    width: 8px;
    height: 16px;
    background-color: #eab308;
    margin-left: 2px;
    animation: blink 1s infinite;
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

  @keyframes blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }

  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    line-height: 1.6;
  }
</style>
