<script lang="ts">
  import type { CharacterStatus } from '../stores/gameStore';

  export let status: CharacterStatus | null;

  $: healthPercent = status ? status.health : 100;
  $: staminaPercent = status ? status.stamina : 100;
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
</script>

{#if status}
  <div class="character-sheet bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
    <h3 class="text-lg font-bold text-gray-100">Character Status</h3>

    <!-- Health Bar -->
    <div class="stat-bar">
      <div class="flex justify-between mb-1">
        <span class="text-sm text-gray-300">Health</span>
        <span class="text-sm text-gray-300">{status.health}/100</span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-2.5">
        <div
          class="{healthColor} h-2.5 rounded-full transition-all duration-300"
          style="width: {healthPercent}%"
        ></div>
      </div>
    </div>

    <!-- Stamina Bar -->
    <div class="stat-bar">
      <div class="flex justify-between mb-1">
        <span class="text-sm text-gray-300">Stamina</span>
        <span class="text-sm text-gray-300">{status.stamina}/100</span>
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
      <span class="text-sm text-gray-400 font-semibold">Inventory:</span>
      {#if status.inventory.length > 0}
        <ul class="mt-1 space-y-1 max-h-40 overflow-y-auto">
          {#each status.inventory as item}
            <li class="text-sm text-gray-300">• {item}</li>
          {/each}
        </ul>
      {:else}
        <div class="text-sm text-gray-500 italic mt-1">No items</div>
      {/if}
    </div>
  </div>
{/if}
