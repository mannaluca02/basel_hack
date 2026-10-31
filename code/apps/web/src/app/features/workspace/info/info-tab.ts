import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EnvironmentInjector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CaseStore } from '../../../core/advisor/store/case-store';
import { InfoItem } from '../../../core/advisor/ui-models';
import { ChartJump } from '../../../core/layout/chart-jump';
import { InfoJump } from '../../../core/layout/info-jump';
import { ViewScroller } from '../../../core/layout/view-scroller';
import { MotionPreference } from '../../../core/theme/motion-preference';
import { GLOSSARY, pushedInfo } from './info-links';
import { InfoRow } from './info-row';

/**
 * The Info tab (FE-18): neutral information for the customer. Cards the advisor pushes during the
 * call come first, the newest on top and marked; the basics of the three pillars follow and are
 * always there. Risk rows and chart cards link here ("Show in Info"). Product content never
 * appears in this tab (`pushedInfo`).
 */
@Component({
  selector: 'app-info-tab',
  imports: [TranslocoPipe, InfoRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'info.title' | transloco }}</h1>

    <section aria-labelledby="info-call">
      <h2 id="info-call">{{ 'info.call' | transloco }}</h2>
      @if (pushed().length === 0) {
        <p class="empty">{{ 'info.empty' | transloco }}</p>
      } @else {
        <ol class="list">
          @for (item of pushed(); track item.infoId; let first = $first) {
            <li [animate.enter]="enterClass()">
              <app-info-row
                [infoId]="item.infoId"
                [category]="item.category"
                [title]="item.title"
                [body]="item.body"
                [fresh]="first"
                [chartAvailable]="hasChart(item)"
                (showChart)="showChart(item)"
              />
            </li>
          }
        </ol>
      }
    </section>

    <section aria-labelledby="info-basics">
      <h2 id="info-basics">{{ 'info.basics' | transloco }}</h2>
      <ol class="list">
        @for (entry of glossary; track entry.infoId) {
          <li>
            <app-info-row
              [infoId]="entry.infoId"
              category="basics"
              [title]="entry.titleKey | transloco"
              [body]="entry.bodyKey | transloco"
              [labelled]="false"
            />
          </li>
        }
      </ol>
    </section>

    <p class="footnote">{{ 'info.neutral' | transloco }}</p>

    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
  `,
  styles: `
    // Positioned, so the visually hidden live region stays inside the view's scroll area.
    :host {
      position: relative;
      display: block;
    }

    .empty {
      margin: 0;
      color: var(--text-muted);
    }

    section + section {
      margin-top: 1.5rem;
    }

    h2 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
    }

    .list {
      margin: 0;
      padding: 0;
      border-top: var(--stroke-border) solid var(--border-soft);
      list-style: none;
    }

    .footnote {
      margin: 1rem 0 0;
      color: var(--text-muted);
      font-size: 0.8125rem;
    }

    // Added by animate.enter to a new card only, removed when the animation ends.
    .card-enter {
      animation: card-enter 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }

    @keyframes card-enter {
      from {
        opacity: 0;
        transform: translateY(0.75rem);
      }
    }

    @keyframes card-fade {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .card-enter {
        animation-name: card-fade;
      }
    }
  `,
})
export class InfoTab {
  private readonly store = inject(CaseStore);
  private readonly chartJump = inject(ChartJump);
  private readonly infoJump = inject(InfoJump);
  private readonly scroller = inject(ViewScroller);
  private readonly motion = inject(MotionPreference);
  private readonly transloco = inject(TranslocoService);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly rows = viewChildren(InfoRow);
  private readonly injector = inject(EnvironmentInjector);

  protected readonly glossary = GLOSSARY;
  protected readonly pushed = computed(() => pushedInfo(this.store.info()));
  private readonly chartIds = computed(
    () => new Set(this.store.charts().map((chart) => chart.chartId)),
  );

  protected readonly announcement = signal('');
  /** Empty for the cards of the first snapshot, so a reload does not replay every entrance. */
  protected readonly enterClass = signal('');

  private readonly seen = new Set<string>();
  private started = false;

  constructor() {
    effect(() => {
      const items = this.pushed();
      const loaded = this.store.loaded();
      untracked(() => this.receive(items, loaded));
    });

    // "Show in Info" from another tab. Wait until the shell has restored this tab's scroll
    // offset, or the restore would undo the jump.
    effect(() => {
      if (this.infoJump.pending() && this.scroller.settled()) untracked(() => this.showTarget());
    });
  }

  protected hasChart(item: InfoItem): boolean {
    return item.relatedChartId !== undefined && this.chartIds().has(item.relatedChartId);
  }

  protected showChart(item: InfoItem): void {
    if (item.relatedChartId) this.chartJump.show({ chartId: item.relatedChartId });
  }

  /** Opens the card another tab pointed to, scrolls to it and highlights it. */
  private showTarget(): void {
    // Detached while another tab is shown: the next tab switch runs this again.
    if (!this.host.isConnected) return;
    const infoId = this.infoJump.take();
    if (!infoId) return;
    afterNextRender(
      {
        write: () => {
          const row = this.rows().find((r) => r.infoId() === infoId);
          const element = this.host.querySelector<HTMLElement>(
            `app-info-row[data-info-id="${CSS.escape(infoId)}"]`,
          );
          if (!row || !element) return;
          row.highlight();
          this.scroller.reveal(element, !this.motion.reduced());
        },
      },
      { injector: this.injector },
    );
  }

  private receive(items: readonly InfoItem[], loaded: boolean): void {
    const fresh = items.filter((item) => !this.seen.has(item.infoId));
    for (const item of items) this.seen.add(item.infoId);

    if (!this.started) {
      // The first snapshot is the starting point, not news: no entrance or announcement.
      if (!loaded) return;
      this.started = true;
      afterNextRender(
        { write: () => this.enterClass.set('card-enter') },
        { injector: this.injector },
      );
      return;
    }

    if (fresh.length === 0) return;
    // A live region only speaks when its text changes: the same message twice in a row toggles a
    // silent trailing space, so it is read again.
    const message = fresh
      .map((item) => this.transloco.translate('info.announce', { title: item.title }))
      .join(' ');
    this.announcement.update((last) => (last === message ? `${message} ` : message));
  }
}
