import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * The OS `prefers-reduced-motion` setting as a signal. CSS handles it with a media query; this is
 * for motion started from code, such as smooth scrolling and ECharts' own update animation.
 */
@Injectable({ providedIn: 'root' })
export class MotionPreference {
  private readonly query = inject(DOCUMENT).defaultView?.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  );
  private readonly reducedState = signal(this.query?.matches ?? false);

  readonly reduced = this.reducedState.asReadonly();

  constructor() {
    const query = this.query;
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => this.reducedState.set(event.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }
}
