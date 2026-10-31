import { TestBed } from '@angular/core/testing';
import {
  TRANSLOCO_LOADER,
  Translation,
  TranslocoLoader,
  TranslocoService,
  provideTransloco,
} from '@jsverse/transloco';
import { Subject, throwError } from 'rxjs';
import { BundledTranslationLoader, TRANSLOCO_SETTINGS } from './i18n.providers';
import { provideI18nTesting } from './i18n-testing';
import { AppLanguage, LANGUAGES, LANGUAGE_STORAGE_KEY, detectLanguage } from './language';

describe('detectLanguage', () => {
  it.each([
    ['it', ['fr-CH'], 'it'],
    [null, ['fr-CH', 'de-CH'], 'fr'],
    [null, ['en-US', 'it'], 'en'],
    [null, ['IT-ch'], 'it'],
    [null, ['es-ES', 'pt'], 'de'],
    [null, [], 'de'],
    ['xx', ['it-CH'], 'it'],
  ] as const)('stored %s, browser %j → %s', (stored, preferred, expected) => {
    expect(detectLanguage(stored, preferred)).toBe(expected);
  });
});

describe('AppLanguage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  describe('with the real translations', () => {
    let language: AppLanguage;
    let transloco: TranslocoService;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
      language = TestBed.inject(AppLanguage);
      transloco = TestBed.inject(TranslocoService);
    });

    it('switches language, locale, <html lang> and storage together', async () => {
      await language.use('fr');

      expect(language.language()).toBe('fr');
      expect(language.locale()).toBe('fr-CH');
      expect(transloco.getActiveLang()).toBe('fr');
      expect(transloco.translate('nav.graphics')).toBe('Graphiques');
      expect(document.documentElement.lang).toBe('fr-CH');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
    });

    it('starts with the stored choice over the browser language', async () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-CH']);

      await language.init();

      expect(language.language()).toBe('it');
    });

    it('starts with the browser language without persisting it', async () => {
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-CH', 'de-CH']);

      await language.init();

      expect(language.language()).toBe('fr');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    });

    it('still starts when storage is unavailable', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['it-CH']);

      await language.init();
      await language.use('en');

      expect(language.language()).toBe('en');
    });

    it('falls back to German when the detected language fails to load', async () => {
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['it-CH']);
      const load = transloco.load.bind(transloco);
      vi.spyOn(transloco, 'load').mockImplementation((lang) =>
        lang === 'it' ? throwError(() => new Error('offline')) : load(lang),
      );
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await language.init();

      expect(language.language()).toBe('de');
      expect(transloco.getActiveLang()).toBe('de');
    });

    it('keeps the current language when a switch fails to load', async () => {
      vi.spyOn(transloco, 'load').mockReturnValue(throwError(() => new Error('offline')));

      await expect(language.use('it')).rejects.toThrow('offline');

      expect(language.language()).toBe('de');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    });
  });

  it('lets the last switch win even if an earlier one loads later', async () => {
    const loads = new Map<string, Subject<Translation>>();
    const loader: TranslocoLoader = {
      getTranslation: (lang) => {
        const subject = new Subject<Translation>();
        loads.set(lang, subject);
        return subject;
      },
    };
    const finish = (lang: string) => {
      loads.get(lang)?.next({ greeting: lang });
      loads.get(lang)?.complete();
    };
    TestBed.configureTestingModule({
      providers: [
        provideTransloco({
          config: { ...TRANSLOCO_SETTINGS, missingHandler: { useFallbackTranslation: false } },
        }),
        { provide: TRANSLOCO_LOADER, useValue: loader },
      ],
    });
    const language = TestBed.inject(AppLanguage);

    const slow = language.use('it');
    const fast = language.use('en');
    finish('en');
    await fast;
    finish('it');
    await slow;

    expect(language.language()).toBe('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });
});

describe('BundledTranslationLoader', () => {
  it.each(LANGUAGES)('loads %s from the bundle', async (lang) => {
    const translation = await new BundledTranslationLoader().getTranslation(lang);

    expect(translation['app']).toEqual({ name: 'Pax Digital Advisor', product: 'Digital Advisor' });
  });

  it('rejects unsupported languages', async () => {
    await expect(new BundledTranslationLoader().getTranslation('es')).rejects.toThrow('"es"');
  });
});
