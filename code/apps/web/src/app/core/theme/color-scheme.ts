import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';

export type Scheme = 'light' | 'dark';

/**
 * The OS colour scheme as a signal. CSS follows the OS by itself via tokens.css; this is for
 * renderers that cannot read `var()`, such as ECharts on a canvas.
 */
@Injectable({ providedIn: 'root' })
export class ColorScheme {
  private readonly document = inject(DOCUMENT);
  private readonly query = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly current = signal<Scheme>(this.query?.matches ? 'dark' : 'light');

  readonly scheme = this.current.asReadonly();

  constructor() {
    const query = this.query;
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) =>
      this.current.set(event.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }

  /**
   * Resolved value of a semantic token, e.g. `token('--chart-1')`. Reads `scheme()`, so a
   * `computed` that calls it re-resolves when the OS switches between light and dark.
   */
  token(name: `--${string}`): string {
    this.scheme();
    return getComputedStyle(this.document.documentElement).getPropertyValue(name).trim();
  }
}
