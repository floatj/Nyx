<script lang="ts">
  export let used: number = 0;
  export let budget: number = 20000;

  $: percentage = Math.min((used / budget) * 100, 100);
  $: remaining = Math.max(budget - used, 0);
  $: color =
    percentage > 80 ? 'bg-red-500' : percentage > 60 ? 'bg-yellow-500' : 'bg-green-500';
</script>

<div class="token-meter bg-gray-800 rounded-lg p-4">
  <div class="flex justify-between items-center mb-2">
    <span class="text-sm font-medium text-gray-300">Token Budget</span>
    <span class="text-sm text-gray-400" data-test="token-used"
      >{used.toLocaleString()} / {budget.toLocaleString()}</span
    >
  </div>

  <div class="meter-bar-container w-full bg-gray-700 rounded-full h-2 overflow-hidden">
    <div class="meter-bar {color} h-full transition-all duration-300" style="width: {percentage}%"></div>
  </div>

  {#if percentage > 80}
    <p class="text-xs text-red-400 mt-2">⚠️ Token budget running low!</p>
  {/if}
</div>
