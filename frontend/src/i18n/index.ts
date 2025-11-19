import { derived, type Readable } from 'svelte/store';
import { settingsStore, type Language } from '../stores/settingsStore';
import enTranslations from './en.json';
import zhTWTranslations from './zh-TW.json';

type Translations = typeof enTranslations;

const translations: Record<Language, Translations> = {
  'en': enTranslations,
  'zh-TW': zhTWTranslations,
};

// Helper function to get nested property from object using dot notation
function getNestedProperty(obj: any, path: string): string {
  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key];
    } else {
      return path; // Return the key if not found
    }
  }

  return typeof result === 'string' ? result : path;
}

// Create a derived store that provides the translation function
export const t: Readable<(key: string) => string> = derived(
  settingsStore,
  ($settings) => {
    const currentTranslations = translations[$settings.language];

    return (key: string): string => {
      return getNestedProperty(currentTranslations, key);
    };
  }
);

// Helper function to get current language
export const getCurrentLanguage = (): Readable<Language> => {
  return derived(settingsStore, ($settings) => $settings.language);
};

// Export language type for convenience
export type { Language };
