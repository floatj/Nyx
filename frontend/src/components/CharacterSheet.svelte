<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import type { CharacterStatus } from '../stores/gameStore';

  export let status: CharacterStatus | null;

  // Animated values for smooth transitions
  const healthTween = tweened(100, { duration: 500, easing: cubicOut });
  const staminaTween = tweened(100, { duration: 500, easing: cubicOut });

  // Track previous values for change indicators
  let previousHealth = 100;
  let previousStamina = 100;
  let healthChange: 'up' | 'down' | null = null;
  let staminaChange: 'up' | 'down' | null = null;
  let changeTimeout: ReturnType<typeof setTimeout> | null = null;

  // Update tweened values when status changes
  $: if (status) {
    // Detect changes
    if (status.health > previousHealth) {
      healthChange = 'up';
      clearChangeIndicators();
    } else if (status.health < previousHealth) {
      healthChange = 'down';
      clearChangeIndicators();
    }

    if (status.stamina > previousStamina) {
      staminaChange = 'up';
      clearChangeIndicators();
    } else if (status.stamina < previousStamina) {
      staminaChange = 'down';
      clearChangeIndicators();
    }

    // Update previous values
    previousHealth = status.health;
    previousStamina = status.stamina;

    // Update tweened values
    healthTween.set(status.health);
    staminaTween.set(status.stamina);
  }

  function clearChangeIndicators() {
    if (changeTimeout) {
      clearTimeout(changeTimeout);
    }
    changeTimeout = setTimeout(() => {
      healthChange = null;
      staminaChange = null;
    }, 2000);
  }

  $: healthPercent = $healthTween;
  $: staminaPercent = $staminaTween;
  $: healthColor =
    healthPercent > 60 ? 'bg-green-500' : healthPercent > 30 ? 'bg-yellow-500' : 'bg-red-500';
  $: staminaColor =
    staminaPercent > 60 ? 'bg-blue-500' : staminaPercent > 30 ? 'bg-yellow-500' : 'bg-orange-500';
  $: hasConditions =
    status &&
    (status.conditions.injured ||
      status.conditions.poisoned ||
      status.conditions.blessed ||
      status.conditions.cursed);

  // Check if health is critical
  $: isCriticalHealth = healthPercent <= 20 && healthPercent > 0;
</script>

{#if status}
  <div class="character-sheet bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
    <h3 class="text-lg font-bold text-gray-100">Character Status</h3>

    <!-- Health Bar -->
    <div class="stat-bar">
      <div class="flex justify-between mb-1">
        <span class="text-sm text-gray-300">Health</span>
        <span class="text-sm text-gray-300 flex items-center gap-1">
          {Math.round(status.health)}/100
          {#if healthChange === 'up'}
            <span class="text-green-400 font-bold animate-bounce">↑</span>
          {:else if healthChange === 'down'}
            <span class="text-red-400 font-bold animate-bounce">↓</span>
          {/if}
        </span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-2.5">
        <div
          class="{healthColor} h-2.5 rounded-full transition-all duration-300 {isCriticalHealth ? 'health-critical' : ''}"
          style="width: {healthPercent}%"
        ></div>
      </div>
    </div>

    <!-- Stamina Bar -->
    <div class="stat-bar">
      <div class="flex justify-between mb-1">
        <span class="text-sm text-gray-300">Stamina</span>
        <span class="text-sm text-gray-300 flex items-center gap-1">
          {Math.round(status.stamina)}/100
          {#if staminaChange === 'up'}
            <span class="text-blue-400 font-bold animate-bounce">↑</span>
          {:else if staminaChange === 'down'}
            <span class="text-orange-400 font-bold animate-bounce">↓</span>
          {/if}
        </span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-2.5">
        <div
          class="{staminaColor} h-2.5 rounded-full transition-all duration-300"
          style="width: {staminaPercent}%"
        ></div>
      </div>
    </div>

    <!-- Conditions -->
    {#if hasConditions}
      <div class="conditions">
        <span class="text-sm text-gray-400">Conditions:</span>
        <div class="flex flex-wrap gap-2 mt-1">
          {#if status.conditions.injured}
            <span class="badge bg-red-900 text-red-200 px-2 py-1 rounded text-xs">🩹 Injured</span>
          {/if}
          {#if status.conditions.poisoned}
            <span class="badge bg-green-900 text-green-200 px-2 py-1 rounded text-xs"
              >☠️ Poisoned</span
            >
          {/if}
          {#if status.conditions.blessed}
            <span class="badge bg-yellow-900 text-yellow-200 px-2 py-1 rounded text-xs"
              >✨ Blessed</span
            >
          {/if}
          {#if status.conditions.cursed}
            <span class="badge bg-purple-900 text-purple-200 px-2 py-1 rounded text-xs"
              >🌑 Cursed</span
            >
          {/if}
        </div>
      </div>
    {/if}

    <!-- Inventory -->
    <div class="inventory">
      <div class="flex justify-between items-center mb-1">
        <span class="text-sm text-gray-400 font-semibold">Inventory</span>
        <span class="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
          {status.inventory.length}/20
        </span>
      </div>
      {#if status.inventory.length > 0}
        <ul class="mt-1 space-y-1 max-h-40 overflow-y-auto pr-1">
          {#each status.inventory as item, index}
            <li class="text-sm text-gray-300 flex items-start justify-between group hover:bg-gray-700/50 rounded px-2 py-1 transition-colors">
              <span class="flex items-start gap-2">
                <span class="text-gray-500 text-xs mt-0.5">{index + 1}.</span>
                <span class="flex-1">{item}</span>
              </span>
              <button
                class="text-xs text-gray-500 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                title="Item details"
                on:click={() => {}}
              >
                ℹ️
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="text-sm text-gray-500 italic mt-1 text-center py-2 bg-gray-700/30 rounded">
          Empty
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes pulse-red {
    0%, 100% {
      opacity: 1;
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
    }
    50% {
      opacity: 0.7;
      box-shadow: 0 0 10px 2px rgba(239, 68, 68, 0.9);
    }
  }

  .health-critical {
    animation: pulse-red 1.5s ease-in-out infinite;
  }

  /* Smooth scrollbar for inventory */
  .inventory ul::-webkit-scrollbar {
    width: 6px;
  }

  .inventory ul::-webkit-scrollbar-track {
    background: #374151;
    border-radius: 3px;
  }

  .inventory ul::-webkit-scrollbar-thumb {
    background: #6b7280;
    border-radius: 3px;
  }

  .inventory ul::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
</style>
