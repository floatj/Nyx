/**
 * Service for managing user settings in localStorage
 */

const SETTINGS_KEY = 'rpg_settings';

export interface GameSettings {
  characterStatusEnabled: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  characterStatusEnabled: true,
};

export class SettingsService {
  /**
   * Get all settings
   */
  getSettings(): GameSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<GameSettings>): void {
    try {
      const current = this.getSettings();
      const updated = { ...current, ...settings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  /**
   * Get character status enabled setting
   */
  isCharacterStatusEnabled(): boolean {
    return this.getSettings().characterStatusEnabled;
  }

  /**
   * Set character status enabled setting
   */
  setCharacterStatusEnabled(enabled: boolean): void {
    this.updateSettings({ characterStatusEnabled: enabled });
  }

  /**
   * Reset settings to defaults
   */
  resetSettings(): void {
    localStorage.removeItem(SETTINGS_KEY);
  }
}

export const settingsService = new SettingsService();
