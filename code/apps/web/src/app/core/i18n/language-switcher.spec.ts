import { ErrorHandler } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from './i18n-testing';
import { AppLanguage, LANGUAGE_STORAGE_KEY } from './language';
import { LanguageSwitcher } from './language-switcher';

describe('LanguageSwitcher', () => {
  let fixture: ComponentFixture<LanguageSwitcher>;
  let root: HTMLElement;
  const handleError = vi.fn();

  beforeEach(async () => {
    localStorage.clear();
    handleError.mockReset();
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: ErrorHandler, useValue: { handleError } }],
    });
    fixture = TestBed.createComponent(LanguageSwitcher);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  const trigger = () => root.querySelector('.trigger') as HTMLButtonElement;
  const menu = () => root.querySelector('.menu');
  const option = (lang: string) =>
    root.querySelector(`.option[lang="${lang}"]`) as HTMLButtonElement;

  async function openMenu(): Promise<void> {
    trigger().click();
    await fixture.whenStable();
  }

  async function choose(lang: string): Promise<void> {
    await openMenu();
    option(lang).click();
    await fixture.whenStable();
  }

  it('shows the flag of the active language and names it in words', () => {
    expect(trigger().querySelector('img')?.getAttribute('src')).toBe('flags/de.svg');
    expect(trigger().querySelector('img')?.getAttribute('alt')).toBe('');
    expect(trigger().textContent?.trim()).toBe('Sprache: Deutsch');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();
  });

  it('lists every language with its flag and own name and marks the active one', async () => {
    await openMenu();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(menu()?.id);
    expect(menu()?.getAttribute('aria-label')).toBe('Sprache');
    const options = Array.from(root.querySelectorAll('.option'), (o) => [
      o.getAttribute('lang'),
      o.querySelector('img')?.getAttribute('src'),
      o.textContent?.trim(),
    ]);
    expect(options).toEqual([
      ['de', 'flags/de.svg', 'Deutsch'],
      ['fr', 'flags/fr.svg', 'Français'],
      ['it', 'flags/it.svg', 'Italiano'],
      ['en', 'flags/gb.svg', 'English'],
    ]);
    expect(
      Array.from(root.querySelectorAll('.option[aria-current="true"]'), (o) =>
        o.getAttribute('lang'),
      ),
    ).toEqual(['de']);
  });

  it('switches and persists the language, then closes and returns focus', async () => {
    await choose('fr');

    expect(TestBed.inject(AppLanguage).language()).toBe('fr');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().querySelector('img')?.getAttribute('src')).toBe('flags/fr.svg');
    expect(trigger().textContent?.trim()).toBe('Langue : Français');
  });

  it('closes on Escape and on a click elsewhere', async () => {
    await openMenu();
    option('it').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());

    await openMenu();
    document.body.click();
    await fixture.whenStable();
    expect(menu()).toBeNull();
    expect(TestBed.inject(AppLanguage).language()).toBe('de');
  });

  it('keeps showing the active language and reports the error when a switch fails', async () => {
    const error = new Error('offline');
    vi.spyOn(TestBed.inject(AppLanguage), 'use').mockRejectedValue(error);

    await choose('it');
    await Promise.resolve();
    await fixture.whenStable();

    expect(trigger().querySelector('img')?.getAttribute('src')).toBe('flags/de.svg');
    expect(handleError).toHaveBeenCalledWith(error);
  });
});
