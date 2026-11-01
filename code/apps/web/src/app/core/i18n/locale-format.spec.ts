import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from './i18n-testing';
import { AppLanguage } from './language';
import {
  ChfPipe,
  LocaleFormat,
} from './locale-format';

// Exact strings depend on the ICU/CLDR version of the runtime (Node vs. each browser), so these
// tests check the locale-specific shape, not byte-exact output.
const DAY = new Date(2026, 9, 31);

describe('LocaleFormat', () => {
  let format: LocaleFormat;
  let language: AppLanguage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    format = TestBed.inject(LocaleFormat);
    language = TestBed.inject(AppLanguage);
  });

  it('formats Swiss German by default', () => {
    expect(format.chf(1234.5)).toMatch(/^CHF\s1.234\.50$/);
    expect(format.number(1234567.891)).toMatch(/^1.234.567\.891$/);
    expect(format.percent(0.125)).toMatch(/^12\.5\s?%$/);
    expect(format.date(DAY)).toBe('31.10.2026');
  });

  it('follows a switch to Swiss French', async () => {
    await language.use('fr');

    expect(format.chf(1234.5)).toMatch(/1.234[.,]50\sCHF$/);
    expect(format.number(1234.5)).toMatch(/^1.234,5$/);
    expect(format.percent(0.125)).toMatch(/^12,5\s?%$/);
    expect(format.date(DAY)).toMatch(/^31 oct\.? 2026$/);
  });

  it('accepts options, e.g. whole francs for chart axes', () => {
    expect(format.chf(1234.5, { maximumFractionDigits: 0, minimumFractionDigits: 0 })).toMatch(
      /^CHF\s1.235$/,
    );
    expect(format.date('2026-10-31T12:00:00Z', { year: 'numeric' })).toBe('2026');
  });

  it('renders an unparseable date as empty instead of throwing', () => {
    expect(format.date('not a date')).toBe('');
    expect(format.date(new Date(Number.NaN))).toBe('');
  });

  it('re-computes derived chart labels on a language switch', async () => {
    const label = TestBed.runInInjectionContext(() => computed(() => format.date(DAY)));
    expect(label()).toBe('31.10.2026');

    await language.use('it');

    expect(label()).toMatch(/^31 ott\.? 2026$/);
  });
});

@Component({
  imports: [ChfPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span>{{ amount | chf }}</span><span>{{ missing | chf }}</span>`,
})
class FormatHost {
  readonly language = inject(AppLanguage);
  protected readonly amount = 1234.5;
  protected readonly missing: number | null = null;
}

describe('chf pipe', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
  });

  it('re-renders an OnPush view when the language changes, without reload', async () => {
    const fixture = TestBed.createComponent(FormatHost);
    await fixture.whenStable();
    const texts = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('span'), (s) =>
        s.textContent?.trim(),
      );

    const [chf, missing] = texts();
    expect(chf).toMatch(/^CHF/);
    expect(missing).toBe('');

    await fixture.componentInstance.language.use('fr');
    await fixture.whenStable();

    const [chfFr] = texts();
    expect(chfFr).toMatch(/CHF$/);
  });
});
