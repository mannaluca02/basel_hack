import { EnvironmentProviders, importProvidersFrom, makeEnvironmentProviders } from '@angular/core';
import { TitleStrategy } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import de from '../../../i18n/de.json';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import it from '../../../i18n/it.json';
import { TRANSLOCO_SETTINGS } from './i18n.providers';
import { TranslatedTitleStrategy } from './translated-title-strategy';

/**
 * For specs: the real translation files, loaded synchronously, German active. Switch with
 * `await TestBed.inject(AppLanguage).use('fr')`. Only imported by specs, so not in the app bundle.
 */
export function provideI18nTesting(): EnvironmentProviders {
  return makeEnvironmentProviders([
    importProvidersFrom(
      TranslocoTestingModule.forRoot({
        langs: { de, fr, it, en },
        translocoConfig: TRANSLOCO_SETTINGS,
        preloadLangs: true,
      }),
    ),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
  ]);
}
