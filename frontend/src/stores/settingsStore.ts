import { writable } from 'svelte/store';

export type Language = 'en' | 'zh-TW';

export const MAX_TOKEN_BUDGET = 100000;
export const DEFAULT_TOKEN_BUDGET = 20000;

export interface SettingsState {
  darkMode: boolean;
  bossKeyEnabled: boolean;
  isBossMode: boolean;
  language: Language;
  defaultModel?: string;
  tokenBudget: number;
}

const SETTINGS_STORAGE_KEY = 'nyx_settings';

// Load settings from localStorage
function loadSettings(): SettingsState {
  if (typeof window === 'undefined') {
    return { darkMode: true, bossKeyEnabled: false, isBossMode: false, language: 'en', defaultModel: undefined, tokenBudget: DEFAULT_TOKEN_BUDGET };
  }

  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    console.log('[SettingsStore] Loading from localStorage:', stored);
    if (stored) {
      const parsed = JSON.parse(stored);
      const settings = {
        darkMode: parsed.darkMode ?? true,
        bossKeyEnabled: parsed.bossKeyEnabled ?? false,
        isBossMode: false,
        language: (parsed.language ?? 'en') as Language,
        defaultModel: parsed.defaultModel,
        tokenBudget: parsed.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
      };
      console.log('[SettingsStore] Loaded settings:', settings);
      return settings;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  console.log('[SettingsStore] Using default settings');
  return { darkMode: true, bossKeyEnabled: false, isBossMode: false, language: 'en', defaultModel: undefined, tokenBudget: DEFAULT_TOKEN_BUDGET };
}

// Save settings to localStorage
function saveSettings(settings: SettingsState): void {
  if (typeof window === 'undefined') return;

  try {
    // Don't persist isBossMode - it's a temporary state
    const toSave = {
      darkMode: settings.darkMode,
      bossKeyEnabled: settings.bossKeyEnabled,
      language: settings.language,
      defaultModel: settings.defaultModel,
      tokenBudget: settings.tokenBudget,
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

    setLanguage: (language: Language) => {
      update((state) => {
        const newState = { ...state, language };
        saveSettings(newState);
        return newState;
      });
    },

    setDefaultModel: (modelId: string | undefined) => {
      update((state) => {
        const newState = { ...state, defaultModel: modelId };
        saveSettings(newState);
        return newState;
      });
    },

    setTokenBudget: (budget: number) => {
      update((state) => {
        const clamped = Math.min(Math.max(budget, 1000), MAX_TOKEN_BUDGET);
        const newState = { ...state, tokenBudget: clamped };
        saveSettings(newState);
        return newState;
      });
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
