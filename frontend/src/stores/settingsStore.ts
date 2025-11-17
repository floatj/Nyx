import { writable } from 'svelte/store';

export interface SettingsState {
  darkMode: boolean;
  bossKeyEnabled: boolean;
  isBossMode: boolean;
}

const SETTINGS_STORAGE_KEY = 'nyx_settings';

// Load settings from localStorage
function loadSettings(): SettingsState {
  if (typeof window === 'undefined') {
    return { darkMode: true, bossKeyEnabled: false, isBossMode: false };
  }

  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    console.log('[SettingsStore] Loading from localStorage:', stored);
    if (stored) {
      const parsed = JSON.parse(stored);
      const settings = {
        darkMode: parsed.darkMode ?? true,
        bossKeyEnabled: parsed.bossKeyEnabled ?? false,
        isBossMode: false, // Always start with boss mode off
      };
      console.log('[SettingsStore] Loaded settings:', settings);
      return settings;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  console.log('[SettingsStore] Using default settings');
  return { darkMode: true, bossKeyEnabled: false, isBossMode: false };
}

// Save settings to localStorage
function saveSettings(settings: SettingsState): void {
  if (typeof window === 'undefined') return;

  try {
    // Don't persist isBossMode - it's a temporary state
    const toSave = {
      darkMode: settings.darkMode,
      bossKeyEnabled: settings.bossKeyEnabled,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

function createSettingsStore() {
  const { subscribe, set, update } = writable<SettingsState>(loadSettings());

  return {
    subscribe,

    toggleDarkMode: () => {
      update((state) => {
        const newState = { ...state, darkMode: !state.darkMode };
        saveSettings(newState);
        applyDarkMode(newState.darkMode);
        return newState;
      });
    },

    setDarkMode: (enabled: boolean) => {
      update((state) => {
        const newState = { ...state, darkMode: enabled };
        saveSettings(newState);
        applyDarkMode(newState.darkMode);
        return newState;
      });
    },

    toggleBossKeyEnabled: () => {
      update((state) => {
        const newState = { ...state, bossKeyEnabled: !state.bossKeyEnabled };
        saveSettings(newState);
        return newState;
      });
    },

    setBossKeyEnabled: (enabled: boolean) => {
      update((state) => {
        const newState = { ...state, bossKeyEnabled: enabled };
        saveSettings(newState);
        return newState;
      });
    },

    toggleBossMode: () => {
      update((state) => {
        const newState = { ...state, isBossMode: !state.isBossMode };
        // Don't save boss mode state - it's temporary
        return newState;
      });
    },

    setBossMode: (enabled: boolean) => {
      update((state) => ({
        ...state,
        isBossMode: enabled,
      }));
    },

    init: () => {
      console.log('[SettingsStore] Initializing...');
      const settings = loadSettings();
      set(settings);
      applyDarkMode(settings.darkMode);
      console.log('[SettingsStore] Initialization complete');
    },
  };
}

// Apply dark mode to document
function applyDarkMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  console.log('[SettingsStore] Applying dark mode:', enabled);
  console.log('[SettingsStore] Document classes before:', document.documentElement.className);

  if (enabled) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  console.log('[SettingsStore] Document classes after:', document.documentElement.className);
}

export const settingsStore = createSettingsStore();
