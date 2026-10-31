import { ErrorHandler } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from './i18n-testing';
import { AppLanguage, LANGUAGE_STORAGE_KEY } from './language';
import { LanguageSwitcher } from './language-switcher';

describe('LanguageSwitcher', () => {
  let fixture: ComponentFixture<LanguageSwitcher>;
  let select: HTMLSelectElement;
  const handleError = vi.fn();

  beforeEach(async () => {
    localStorage.clear();
    handleError.mockReset();
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: ErrorHandler, useValue: { handleError } }],
    });
    fixture = TestBed.createComponent(LanguageSwitcher);
    await fixture.whenStable();
    select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
  });

  async function choose(value: string): Promise<void> {
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  it('lists every language by its own name and marks the active one', () => {
    const options = Array.from(select.options, (o) => [o.value, o.text.trim(), o.lang]);

    expect(options).toEqual([
      ['de', 'Deutsch', 'de'],
      ['fr', 'Français', 'fr'],
      ['it', 'Italiano', 'it'],
      ['en', 'English', 'en'],
    ]);
    expect(select.value).toBe('de');
    expect(select.getAttribute('aria-label')).toBe('Sprache');
  });

  it('switches and persists the language', async () => {
    await choose('fr');

    expect(TestBed.inject(AppLanguage).language()).toBe('fr');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
    expect(select.getAttribute('aria-label')).toBe('Langue');
  });

  it('shows the active language again and reports the error when a switch fails', async () => {
    const error = new Error('offline');
    vi.spyOn(TestBed.inject(AppLanguage), 'use').mockRejectedValue(error);

    await choose('it');
    await Promise.resolve();

    expect(select.value).toBe('de');
    expect(handleError).toHaveBeenCalledWith(error);
  });
});
