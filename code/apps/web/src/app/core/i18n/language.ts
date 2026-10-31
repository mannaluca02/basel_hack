import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

export const LANGUAGES = ['de', 'fr', 'it', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** German is the source language: every key exists in de.json first, the others fall back to it. */
export const SOURCE_LANGUAGE: Language = 'de';

/** BCP 47 locale per language, for `Intl` formatting, `<html lang>` and the backend. */
export const LOCALES: Readonly<Record<Language, string>> = {
  de: 'de-CH',
  fr: 'fr-CH',
  it: 'it-CH',
  en: 'en-CH',
};

/**
 * Each language in its own words, so people can find theirs whatever the current UI language is.
 * Deliberately not in the translation files: these must never be translated.
 */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  en: 'English',
};

export const LANGUAGE_STORAGE_KEY = 'pax.language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Initial language: an explicit earlier choice wins, then the first supported browser language
 * (`fr-CH` → `fr`), then German.
 */
export function detectLanguage(stored: string | null, preferred: readonly string[]): Language {
  if (isLanguage(stored)) return stored;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return SOURCE_LANGUAGE;
}

/**
 * The active UI language. Switching loads the translations first and only then flips the
 * language, so the UI never shows raw keys or a half-translated screen.
 */
@Injectable({ providedIn: 'root' })
export class AppLanguage {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly active = signal<Language>(SOURCE_LANGUAGE);
  /** Increments per switch; a slower earlier load must not overwrite a later choice. */
  private latestRequest = 0;

  readonly language = this.active.asReadonly();
  /** e.g. `fr-CH`. Use it for `Intl`, and send it to the backend so generated text matches. */
  readonly locale = computed(() => LOCALES[this.active()]);

  /** Runs once before the first render. Does not persist: only an explicit choice is stored. */
  async init(): Promise<void> {
    const navigator = this.document.defaultView?.navigator;
    const preferred = navigator?.languages?.length
      ? navigator.languages
      : [navigator?.language ?? ''];
    const language = detectLanguage(this.readStored(), preferred);
    try {
      await this.apply(language);
    } catch (error) {
      if (language === SOURCE_LANGUAGE) throw error;
      console.error(`Could not load "${language}", falling back to German.`, error);
      await this.apply(SOURCE_LANGUAGE);
    }
  }

  /** Switches the UI language without reload and remembers the choice. */
  async use(language: Language): Promise<void> {
    if (await this.apply(language)) this.store(language);
  }

  /** Resolves `false` if a later switch overtook this one. */
  private async apply(language: Language): Promise<boolean> {
    const request = ++this.latestRequest;
    await firstValueFrom(this.transloco.load(language));
    if (request !== this.latestRequest) return false;
    this.transloco.setActiveLang(language);
    this.active.set(language);
    this.document.documentElement.lang = LOCALES[language];
    return true;
  }

  // Storage can throw (Safari private mode, blocked cookies); the language then lasts the session.
  private readStored(): string | null {
    try {
      return this.document.defaultView?.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private store(language: Language): void {
    try {
      this.document.defaultView?.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Not persisted; nothing else to do.
    }
  }
}
