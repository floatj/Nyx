export interface SaveSlot {
  id: string;
  name: string;
  timestamp: number;
  mode: string;
  turnCount: number;
  tokenUsed: number;
  data: {
    state: any;
    history: any[];
    currentNarration: string;
    choices: any[];
    sessionId: string | null;
    sessionToken: string | null;
    tokenUsed: number;
    mode: string;
    characterStatus?: any;
    customInitialCharacterStatus?: any;
  };
}

const SAVE_SLOTS_KEY = 'rpg_save_slots';
const MAX_SAVE_SLOTS = 5;

export class StorageService {
  /**
   * Get all save slots
   */
  getSaveSlots(): SaveSlot[] {
    try {
      const data = localStorage.getItem(SAVE_SLOTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to load save slots:', error);
      return [];
    }
  }

  /**
   * Save game to a slot
   */
  saveGame(slotName: string, gameState: any): SaveSlot {
    const slots = this.getSaveSlots();

    const saveSlot: SaveSlot = {
      id: Date.now().toString(),
      name: slotName,
      timestamp: Date.now(),
      mode: gameState.mode || 'unknown',
      turnCount: gameState.history.filter((m: any) => m.role === 'assistant').length,
      tokenUsed: gameState.tokenUsed || 0,
      data: {
        state: gameState.state,
        history: gameState.history,
        currentNarration: gameState.currentNarration,
        choices: gameState.choices,
        sessionId: gameState.sessionId,
        sessionToken: gameState.sessionToken,
        tokenUsed: gameState.tokenUsed,
        mode: gameState.mode,
        characterStatus: gameState.characterStatus,
      },
    };

    // Check if slot name exists, replace it
    const existingIndex = slots.findIndex(s => s.name === slotName);
    if (existingIndex >= 0) {
      slots[existingIndex] = saveSlot;
    } else {
      // Add new slot, remove oldest if at max
      if (slots.length >= MAX_SAVE_SLOTS) {
        slots.sort((a, b) => a.timestamp - b.timestamp);
        slots.shift();
      }
      slots.push(saveSlot);
    }

    try {
      localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots));
      return saveSlot;
    } catch (error) {
      console.error('Failed to save game:', error);
      throw new Error('Failed to save game. Storage may be full.');
    }
  }

  /**
   * Load game from a slot
   */
  loadGame(slotId: string): SaveSlot | null {
    const slots = this.getSaveSlots();
    return slots.find(s => s.id === slotId) || null;
  }

  /**
   * Delete a save slot
   */
  deleteSlot(slotId: string): void {
    const slots = this.getSaveSlots().filter(s => s.id !== slotId);
    localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots));
  }

  /**
   * Export save as JSON
   */
  exportSave(slotId: string): string {
    const slot = this.loadGame(slotId);
    if (!slot) throw new Error('Save slot not found');
    return JSON.stringify(slot, null, 2);
  }

  /**
   * Import save from JSON
   */
  importSave(jsonString: string): SaveSlot {
    try {
      const imported: SaveSlot = JSON.parse(jsonString);

      // Validate structure
      if (!imported.data || !imported.name) {
        throw new Error('Invalid save file format');
      }

      // Generate new ID to avoid conflicts
      imported.id = Date.now().toString();
      imported.timestamp = Date.now();

      const slots = this.getSaveSlots();

      // Remove oldest if at max
      if (slots.length >= MAX_SAVE_SLOTS) {
        slots.sort((a, b) => a.timestamp - b.timestamp);
        slots.shift();
      }

      slots.push(imported);
      localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots));

      return imported;
    } catch (error) {
      console.error('Failed to import save:', error);
      throw new Error('Invalid save file');
    }
  }

  /**
   * Clear all saves (with confirmation)
   */
  clearAllSaves(): void {
    localStorage.removeItem(SAVE_SLOTS_KEY);
  }
}

export const storageService = new StorageService();
