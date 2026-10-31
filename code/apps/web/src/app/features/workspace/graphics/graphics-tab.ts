import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EnvironmentInjector,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CaseStore } from '../../../core/advisor/store/case-store';
import { ChartResult } from '../../../core/advisor/ui-models';
import { ViewScroller } from '../../../core/layout/view-scroller';
import { MotionPreference } from '../../../core/theme/motion-preference';
import { ChartCard } from './chart-card';
import { TITLE_KEYS } from './chart-options';

/**
 * The Graphics tab: charts as a feed, like messages in a chat (FE-11). Cards keep the order in
 * which their chart first appeared (`CaseStore.charts`); the newest is at the bottom and slides
 * in. An update to a known `chartId` changes that card in place.
 *
 * Auto-follow: when a new chart arrives and the user is at the bottom, the view scrolls down to
 * it. When the user has scrolled up to read, or is on another tab, the position is left alone
 * and a "New chart" pill offers the way down.
 */
@Component({
  selector: 'app-graphics-tab',
  imports: [TranslocoPipe, ChartCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'graphics.title' | transloco }}</h1>

    @if (charts().length === 0) {
      <p class="empty">{{ 'graphics.empty' | transloco }}</p>
    }

    <ol class="feed">
      @for (chart of charts(); track chart.chartId) {
        <li [animate.enter]="enterClass()">
          <app-chart-card [chart]="chart" />
        </li>
      }
    </ol>

    @if (unseen().length > 0) {
      <button type="button" class="pill" (click)="showUnseen()">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
        {{ 'graphics.newChart' | transloco }}
      </button>
    }

    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
  `,
  styles: `
    // Positioned, so the visually hidden live region stays inside the view's scroll area instead
    // of extending the document, which then scrolled the whole shell.
    :host {
      position: relative;
      display: block;
    }

    .empty {
      color: var(--text-muted);
    }

    .feed {
      display: grid;
      gap: 1rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    // Added by animate.enter to a new card only, removed when the animation ends.
    .card-enter {
      animation: card-enter 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }

    @keyframes card-enter {
      from {
        opacity: 0;
        transform: translateY(1.5rem);
      }
    }

    @keyframes card-fade {
      from {
        opacity: 0;
      }
    }

    // Sticks to the bottom of the view while the cards it points to are further down.
    .pill {
      position: sticky;
      bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 2.75rem;
      margin: 1rem auto 0;
      padding: 0 1rem;
      border: 0;
      border-radius: var(--radius-full);
      color: var(--text-inverse);
      background: var(--bg-brand-purple);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .icon {
      width: 1.125rem;
      height: 1.125rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    @media (prefers-reduced-motion: reduce) {
      .card-enter {
        animation-name: card-fade;
      }
    }
  `,
})
export class GraphicsTab {
  private readonly store = inject(CaseStore);
  private readonly scroller = inject(ViewScroller);
  private readonly motion = inject(MotionPreference);
  private readonly transloco = inject(TranslocoService);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  /**
   * Not the component injector: a hook registered with that during this view's refresh waits for
   * the view's next refresh, so the follow-scroll fired one event late (seen in the browser).
   */
  private readonly injector = inject(EnvironmentInjector);

  protected readonly charts = this.store.charts;
  /** Charts that arrived while the user was not at the bottom, in order of arrival. */
  protected readonly unseen = signal<readonly string[]>([]);
  protected readonly announcement = signal('');
  /** Empty for the cards of the first snapshot, so a reload does not replay every entrance. */
  protected readonly enterClass = signal('');

  /** Last revision rendered per chartId. */
  private readonly revisions = new Map<string, number>();
  private started = false;

  constructor() {
    effect(() => {
      const charts = this.charts();
      const loaded = this.store.loaded();
      untracked(() => this.receive(charts, loaded));
    });

    // Reaching the bottom means every card has been seen.
    effect(() => {
      if (this.scroller.settled() && this.scroller.atBottom()) untracked(() => this.unseen.set([]));
    });
  }

  /** Scrolls to the first card that arrived while the user was reading further up. */
  protected showUnseen(): void {
    const [first] = this.unseen();
    this.unseen.set([]);
    const card = this.cardElement(first);
    if (!card) return;
    this.scroller.reveal(card, !this.motion.reduced());
    // The pill is gone; continue from the card instead of losing focus to <body>.
    card.querySelector<HTMLElement>('article')?.focus({ preventScroll: true });
  }

  /**
   * Runs before the template shows `charts`, so the position read here is the one the user was
   * reading at before the new card was added.
   */
  private receive(charts: readonly ChartResult[], loaded: boolean): void {
    const fresh = charts.filter((chart) => !this.revisions.has(chart.chartId));
    const updated = charts.filter(
      (chart) => chart.revision > (this.revisions.get(chart.chartId) ?? Infinity),
    );
    for (const chart of charts) this.revisions.set(chart.chartId, chart.revision);

    if (!this.started) {
      // The first snapshot is the starting point, not news: no entrance, pill or announcement.
      if (!loaded) return;
      this.started = true;
      afterNextRender(
        { write: () => this.enterClass.set('card-enter') },
        { injector: this.injector },
      );
      return;
    }

    this.announce(fresh, updated);
    if (fresh.length === 0) return;

    // While the shell switches tabs, or this tab is detached, offsets belong to another tab.
    const follow = this.scroller.settled() && this.host.isConnected && this.scroller.measure();
    if (follow) {
      afterNextRender(
        { write: () => this.scroller.scrollToEnd(!this.motion.reduced()) },
        { injector: this.injector },
      );
    } else {
      this.unseen.update((ids) => [...ids, ...fresh.map((chart) => chart.chartId)]);
    }
  }

  private announce(fresh: readonly ChartResult[], updated: readonly ChartResult[]): void {
    const title = (chart: ChartResult) => this.transloco.translate(TITLE_KEYS[chart.type]);
    const messages = [
      ...fresh.map((chart) =>
        this.transloco.translate('graphics.announce.new', { title: title(chart) }),
      ),
      ...updated.map((chart) =>
        this.transloco.translate('graphics.announce.updated', { title: title(chart) }),
      ),
    ];
    if (messages.length === 0) return;
    // A live region only speaks when its text changes. The same message twice in a row (one chart
    // updated twice) toggles a silent trailing no-break space, so it is read again.
    const message = messages.join(' ');
    this.announcement.update((last) => (last === message ? `${message} ` : message));
  }

  private cardElement(chartId: string | undefined): HTMLElement | undefined {
    return Array.from(this.host.querySelectorAll<HTMLElement>('app-chart-card')).find(
      (card) => card.dataset['chartId'] === chartId,
    );
  }
}
