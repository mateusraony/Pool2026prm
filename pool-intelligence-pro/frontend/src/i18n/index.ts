import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ptBR } from './pt-br';
import { enUS } from './en-us';

export type Locale = 'pt-BR' | 'en-US';
export type TranslationKey = keyof typeof ptBR;

const translations: Record<Locale, Record<string, string>> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'pt-BR',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'pool-intel-locale' }
  )
);

/**
 * Translate a key to the current locale.
 * Falls back to pt-BR if key not found in target locale.
 */
export function t(key: string, locale?: Locale): string {
  const currentLocale = locale || useI18n.getState().locale;
  return translations[currentLocale]?.[key] || translations['pt-BR']?.[key] || key;
}

/**
 * React hook for translations.
 * Returns { t, locale, setLocale }
 */
export function useTranslation() {
  const { locale, setLocale } = useI18n();

  const translate = (key: string): string => {
    return translations[locale]?.[key] || translations['pt-BR']?.[key] || key;
  };

  return { t: translate, locale, setLocale };
}
