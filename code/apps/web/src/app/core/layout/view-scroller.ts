import { Injectable, signal } from '@angular/core';

/** Distance from the end, in px, that still counts as "at the bottom". */
const NEAR_BOTTOM_PX = 120;

/**
 * The scroll position of the Dynamic View, the one scroll container all workspace tabs share.
 * The shell registers the element and marks tab switches; a feed tab reads the position to decide
 * whether it may follow new content (FE-11) and scrolls through here, never through `window`.
 */
@Injectable({ providedIn: 'root' })
export class ViewScroller {
  private element: HTMLElement | null = null;
  private readonly atBottomState = signal(true);
  private readonly settledState = signal(true);
  private readonly onScroll = () => this.measure();

  /** The view is scrolled to its end, or close to it. Updated on scroll and by `measure()`. */
  readonly atBottom = this.atBottomState.asReadonly();
  /**
   * False while the shell switches tabs and restores the scroll offset of the next tab. Offsets
   * read in between still belong to the previous tab.
   */
  readonly settled = this.settledState.asReadonly();

  attach(element: HTMLElement): void {
    this.detach();
    this.element = element;
    element.addEventListener('scroll', this.onScroll, { passive: true });
    this.measure();
  }

  detach(): void {
    this.element?.removeEventListener('scroll', this.onScroll);
    this.element = null;
  }

  /** Shell: a tab switch starts. */
  unsettle(): void {
    this.settledState.set(false);
  }

  /** Shell: the next tab is shown and its scroll offset restored. */
  settle(): void {
    this.settledState.set(true);
    this.measure();
  }

  /** Reads the current position; call it after content was added or removed. */
  measure(): boolean {
    const view = this.element;
    const near = !view || view.scrollHeight - view.scrollTop - view.clientHeight <= NEAR_BOTTOM_PX;
    this.atBottomState.set(near);
    return near;
  }

  scrollToEnd(smooth: boolean): void {
    const view = this.element;
    view?.scrollTo({ top: view.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }

  /**
   * Scrolls `target`, an element inside the view, to the top of the view. Only the view moves:
   * `scrollIntoView` would also scroll every scrollable ancestor, up to the document.
   */
  reveal(target: HTMLElement, smooth: boolean): void {
    const view = this.element;
    if (!view) return;
    const top =
      view.scrollTop + target.getBoundingClientRect().top - view.getBoundingClientRect().top;
    view.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' });
  }
}
