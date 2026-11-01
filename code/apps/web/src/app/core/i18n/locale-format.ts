import { Injectable, Pipe, PipeTransform, inject } from '@angular/core';
import { AppLanguage } from './language';

export type DateInput = Date | string | number;

/**
 * Locale-aware formatting for the active language (`de-CH`, `fr-CH`, `it-CH`, `en-CH`), backed by
 * `Intl`, so separators follow CLDR instead of hand-written rules. Every method reads the
 * `locale` signal: called inside a `computed` or template, the result re-formats on a language
 * switch. Use it for chart axes, tooltips and legends; use the pipes below in templates.
 */
@Injectable({ providedIn: 'root' })
export class LocaleFormat {
  private readonly locale = inject(AppLanguage).locale;
  private readonly numberFormats = new Map<string, Intl.NumberFormat>();
  private readonly dateFormats = new Map<string, Intl.DateTimeFormat>();

  /** `chf(1234.5)` → `CHF 1'234.50` in de-CH. */
  chf(value: number, options: Intl.NumberFormatOptions = {}): string {
    return this.numberFormat({ ...options, style: 'currency', currency: 'CHF' }).format(value);
  }

  number(value: number, options: Intl.NumberFormatOptions = {}): string {
    return this.numberFormat(options).format(value);
  }

  /** Takes a ratio: `percent(0.125)` → `12.5%` in de-CH. One decimal unless overridden. */
  percent(ratio: number, options: Intl.NumberFormatOptions = {}): string {
    return this.numberFormat({ maximumFractionDigits: 1, ...options, style: 'percent' }).format(
      ratio,
    );
  }

  /**
   * Medium date by default: `31.10.2026` in de-CH, `31 oct. 2026` in fr-CH. An unparseable
   * value yields `''` instead of throwing, so one bad date cannot break a whole view.
   */
  date(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const locale = this.locale();
    const key = `${locale}|${JSON.stringify(options)}`;
    let format = this.dateFormats.get(key);
    if (!format) {
      format = new Intl.DateTimeFormat(locale, options);
      this.dateFormats.set(key, format);
    }
    return format.format(date);
  }

  private numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
    const locale = this.locale();
    const key = `${locale}|${JSON.stringify(options)}`;
    let format = this.numberFormats.get(key);
    if (!format) {
      format = new Intl.NumberFormat(locale, options);
      this.numberFormats.set(key, format);
    }
    return format;
  }
}

// The pipe is impure so it re-runs when the locale signal changes; LocaleFormat caches the
// Intl formatters, so a re-run is cheap. `null`/`undefined` render as an empty string.

@Pipe({ name: 'chf', pure: false })
export class ChfPipe implements PipeTransform {
  private readonly format = inject(LocaleFormat);
  transform(value: number | null | undefined, options?: Intl.NumberFormatOptions): string {
    return value == null ? '' : this.format.chf(value, options);
  }
}
