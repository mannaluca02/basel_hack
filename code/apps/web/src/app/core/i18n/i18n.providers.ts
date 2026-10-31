import {
  EnvironmentProviders,
  Injectable,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { TitleStrategy } from '@angular/router';
import {
  Translation,
  TranslocoLoader,
  provideTransloco,
  translocoConfig,
} from '@jsverse/transloco';
import { AppLanguage, LANGUAGES, Language, SOURCE_LANGUAGE, isLanguage } from './language';
import { TranslatedTitleStrategy } from './translated-title-strategy';

export const TRANSLOCO_SETTINGS = translocoConfig({
  availableLangs: [...LANGUAGES],
  defaultLang: SOURCE_LANGUAGE,
  fallbackLang: SOURCE_LANGUAGE,
  reRenderOnLangChange: true,
  // A key missing in fr/it/en shows the German text instead of the raw key; dev mode logs it.
  missingHandler: { useFallbackTranslation: true },
});

// Bundled as one lazy chunk per language: no extra request path, hashed, cached by the service worker.
const TRANSLATIONS: Readonly<Record<Language, () => Promise<{ default: Translation }>>> = {
  de: () => import('../../../i18n/de.json'),
  fr: () => import('../../../i18n/fr.json'),
  it: () => import('../../../i18n/it.json'),
  en: () => import('../../../i18n/en.json'),
};

@Injectable({ providedIn: 'root' })
export class BundledTranslationLoader implements TranslocoLoader {
  async getTranslation(lang: string): Promise<Translation> {
    if (!isLanguage(lang)) throw new Error(`Unsupported language "${lang}"`);
    return (await TRANSLATIONS[lang]()).default;
  }
}

/** Runtime i18n: Transloco, initial language before first render, translated page titles. */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: { ...TRANSLOCO_SETTINGS, prodMode: !isDevMode() },
      loader: BundledTranslationLoader,
    }),
    provideAppInitializer(() => inject(AppLanguage).init()),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
  ]);
}
