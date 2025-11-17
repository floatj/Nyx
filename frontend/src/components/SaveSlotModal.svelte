<script lang="ts">
  import { storageService } from '../services/storage';
  import type { SaveSlot } from '../services/storage';
  import { gameStore } from '../stores/gameStore';

  export let isOpen = false;
  export let mode: 'save' | 'load' = 'save';
  export let onClose: () => void;
  export let onLoad: (slot: SaveSlot) => void = () => {};

  let saveSlots: SaveSlot[] = [];
  let newSaveName = '';
  let selectedFile: File | null = null;
  let error = '';
  let success = '';

  $: if (isOpen) {
    loadSlots();
    newSaveName = mode === 'save' ? `Save ${new Date().toLocaleString()}` : '';
    error = '';
    success = '';
  }

  function loadSlots() {
    saveSlots = storageService.getSaveSlots();
  }

  function handleSave() {
    if (!newSaveName.trim()) {
      error = 'Please enter a save name';
      return;
    }

    try {
      storageService.saveGame(newSaveName, $gameStore);
      success = 'Game saved successfully!';
      loadSlots();
      newSaveName = '';
      setTimeout(() => {
        success = '';
      }, 2000);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save';
    }
  }

  function handleLoad(slot: SaveSlot) {
    onLoad(slot);
    onClose();
  }

  function handleDelete(slotId: string, event: Event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this save?')) {
      storageService.deleteSlot(slotId);
      loadSlots();
    }
  }

  function handleExport(slotId: string, event: Event) {
    event.stopPropagation();
    try {
      const json = storageService.exportSave(slotId);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rpg-save-${slotId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success = 'Save exported successfully!';
      setTimeout(() => {
        success = '';
      }, 2000);
    } catch (err) {
      error = 'Failed to export save';
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    selectedFile = input.files?.[0] || null;
  }

  function handleImport() {
    if (!selectedFile) {
      error = 'Please select a file to import';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const imported = storageService.importSave(json);
        success = 'Save imported successfully!';
        loadSlots();
        selectedFile = null;
        setTimeout(() => {
          success = '';
        }, 2000);
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to import save';
      }
    };
    reader.readAsText(selectedFile);
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  function formatMode(mode: string): string {
    const modes: Record<string, string> = {
      dungeon: '🏰 Dungeon',
      journey: '⚔️ Journey',
      mystery: '🔍 Mystery',
    };
    return modes[mode] || mode;
  }
</script>

{#if isOpen}
  <div class="modal-overlay fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
    <div class="modal-content bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="modal-header bg-gray-900 px-6 py-4 flex justify-between items-center">
        <h2 class="text-2xl font-bold">
          {mode === 'save' ? '💾 Save Game' : '📂 Load Game'}
        </h2>
        <button
          class="text-gray-400 hover:text-white text-2xl leading-none"
          on:click={onClose}
        >
          ✕
        </button>
      </div>

      <!-- Content -->
      <div class="modal-body flex-1 overflow-y-auto p-6">
        {#if error}
          <div class="bg-red-900/50 border border-red-500 rounded-lg p-3 mb-4">
            <p class="text-red-200 text-sm">⚠️ {error}</p>
          </div>
        {/if}

        {#if success}
          <div class="bg-green-900/50 border border-green-500 rounded-lg p-3 mb-4">
            <p class="text-green-200 text-sm">✓ {success}</p>
          </div>
        {/if}

        {#if mode === 'save'}
          <!-- Save Section -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-300 mb-2">
              Save Name
            </label>
            <div class="flex gap-3">
              <input
                type="text"
                class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter save name..."
                bind:value={newSaveName}
                on:keypress={(e) => e.key === 'Enter' && handleSave()}
              />
              <button class="choice-button px-6" on:click={handleSave}>
                Save
              </button>
            </div>
            <p class="text-xs text-gray-400 mt-2">
              Maximum {5} save slots. Oldest will be replaced if full.
            </p>
          </div>
        {/if}

        <!-- Existing Saves -->
        <div class="mb-6">
          <h3 class="text-lg font-medium text-gray-300 mb-3">
            {mode === 'save' ? 'Existing Saves' : 'Load from Save'}
          </h3>

          {#if saveSlots.length === 0}
            <div class="text-center py-12 text-gray-400">
              <p class="text-4xl mb-3">📭</p>
              <p>No saved games found</p>
            </div>
          {:else}
            <div class="space-y-3">
              {#each saveSlots as slot (slot.id)}
                <div
                  class="save-slot bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors cursor-pointer"
                  on:click={() => mode === 'load' && handleLoad(slot)}
                  role="button"
                  tabindex="0"
                >
                  <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                      <h4 class="font-medium text-white text-lg">{slot.name}</h4>
                      <p class="text-sm text-gray-400">{formatMode(slot.mode)}</p>
                    </div>
                    <div class="flex gap-2">
                      <button
                        class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                        on:click={(e) => handleExport(slot.id, e)}
                        title="Export"
                      >
                        📤
                      </button>
                      <button
                        class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                        on:click={(e) => handleDelete(slot.id, e)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div class="flex gap-4 text-xs text-gray-400">
                    <span>📅 {formatDate(slot.timestamp)}</span>
                    <span>🎲 {slot.turnCount} turns</span>
                    <span>🪙 {slot.tokenUsed} tokens</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Import Section -->
        <div class="border-t border-gray-700 pt-6">
          <h3 class="text-lg font-medium text-gray-300 mb-3">
            📥 Import Save File
          </h3>
          <div class="flex gap-3">
            <input
              type="file"
              accept=".json"
              class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white file:mr-4 file:py-1 file:px-4 file:rounded file:border-0 file:text-sm file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
              on:change={handleFileSelect}
            />
            <button
              class="choice-button px-6"
              disabled={!selectedFile}
              on:click={handleImport}
            >
              Import
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-2">
            Import a previously exported save file (.json)
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer bg-gray-900 px-6 py-4 flex justify-end">
        <button
          class="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          on:click={onClose}
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .save-slot:focus {
    outline: 2px solid #6366f1;
    outline-offset: 2px;
  }
</style>
