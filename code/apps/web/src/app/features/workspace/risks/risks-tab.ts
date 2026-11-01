import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EnvironmentInjector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CaseStore } from '../../../core/advisor/store/case-store';
import {
  ImpactEventKind,
  RiskCategory,
  RiskItem,
  RiskSeverity,
} from '../../../core/advisor/ui-models';
import { ChartJump } from '../../../core/layout/chart-jump';
import { InfoJump } from '../../../core/layout/info-jump';
import { infoForRisk, pushedInfo } from '../info/info-links';
import { RiskRow } from './risk-row';

/** How long the "updated" marker stays after a risk changed. */
export const RISK_UPDATED_MS = 4000;

/** Display order only: the severity itself comes from the backend. */
const SEVERITY_ORDER: Readonly<Record<RiskSeverity, number>> = { high: 0, medium: 1, low: 2 };

/** The life-event scenario a risk points to on the event-impact chart. */
const IMPACT_EVENTS: Readonly<Partial<Record<RiskCategory, ImpactEventKind>>> = {
  retirement: 'retirement',
  disability: 'disability',
  death: 'death',
};

/** What makes a change worth a marker: not the texts, which also change with the language. */
function signature(risk: RiskItem): string {
  return JSON.stringify([
    risk.status,
    risk.severity,
    risk.resultStatus,
    risk.amount,
    risk.pillars,
    risk.relatedChartId ?? null,
  ]);
}

/**
 * The Risks tab (FE-16): the risks the logic backend has identified in the customer's life. Open
 * risks (identified or waiting for data) come first, the most severe on top; addressed risks
 * follow in their own section. New risks slide in during the call and are announced to screen
 * readers; a changed risk is tinted for a moment. "Show in Graphics" opens the related chart,
 * "Show in Info" the related info card (FE-18).
 */
@Component({
  selector: 'app-risks-tab',
  imports: [TranslocoPipe, RiskRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'risks.title' | transloco }}</h1>

    @if (open().length === 0 && addressed().length === 0) {
      <p class="empty">{{ 'risks.empty' | transloco }}</p>
    }

    @if (open().length > 0) {
      <section aria-labelledby="risks-open">
        <h2 id="risks-open">{{ 'risks.open' | transloco }}</h2>
        <ol class="list">
          @for (risk of open(); track risk.riskId) {
            <li [animate.enter]="enterClass()">
              <app-risk-row
                [risk]="risk"
                [chartAvailable]="hasChart(risk)"
                [updated]="updatedIds().has(risk.riskId)"
                [infoAvailable]="infoFor(risk) !== null"
                (showChart)="showChart(risk)"
                (showInfo)="showInfo(risk)"
              />
            </li>
          }
        </ol>
      </section>
    }

    @if (addressed().length > 0) {
      <section aria-labelledby="risks-addressed">
        <h2 id="risks-addressed">{{ 'risks.addressed' | transloco }}</h2>
        <ol class="list">
          @for (risk of addressed(); track risk.riskId) {
            <li [animate.enter]="enterClass()">
              <app-risk-row
                [risk]="risk"
                [chartAvailable]="hasChart(risk)"
                [updated]="updatedIds().has(risk.riskId)"
                [infoAvailable]="infoFor(risk) !== null"
                (showChart)="showChart(risk)"
                (showInfo)="showInfo(risk)"
              />
            </li>
          }
        </ol>
      </section>
    }

    @if (estimated()) {
      <p class="footnote">{{ 'risks.estimatedNote' | transloco }}</p>
    }

    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
  `,
  styles: `
    // Positioned, so the visually hidden live region stays inside the view's scroll area.
    :host {
      position: relative;
      display: block;
    }

    .empty {
      color: var(--text-muted);
    }

    section + section {
      margin-top: 1.5rem;
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
export class RisksTab {
  private readonly store = inject(CaseStore);
  private readonly jump = inject(ChartJump);
  private readonly infoJump = inject(InfoJump);
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(EnvironmentInjector);

  /** In order of first appearance; `Array.sort` is stable, so equal severities keep that order. */
  private readonly risks = this.store.risks;
  protected readonly open = computed(() =>
    this.risks()
      .filter((risk) => risk.status !== 'addressed')
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
  );
  protected readonly addressed = computed(() =>
    this.risks().filter((risk) => risk.status === 'addressed'),
  );
  /** Explains the ≈ in front of an estimated gap, while an open risk shows one. */
  protected readonly estimated = computed(() =>
    this.open().some((risk) => risk.amount !== null && risk.resultStatus === 'estimated'),
  );
  private readonly chartIds = computed(
    () => new Set(this.store.charts().map((chart) => chart.chartId)),
  );
  private readonly pushedInfo = computed(() => pushedInfo(this.store.info()));

  /** Risks that changed in the last few seconds. */
  protected readonly updatedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly announcement = signal('');
  /** Empty for the cards of the first snapshot, so a reload does not replay every entrance. */
  protected readonly enterClass = signal('');

  /** Last seen signature per riskId. */
  private readonly signatures = new Map<string, string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private started = false;

  constructor() {
    effect(() => {
      const risks = this.risks();
      const loaded = this.store.loaded();
      untracked(() => this.receive(risks, loaded));
    });
    inject(DestroyRef).onDestroy(() => this.timers.forEach((timer) => clearTimeout(timer)));
  }

  protected hasChart(risk: RiskItem): boolean {
    return risk.relatedChartId !== undefined && this.chartIds().has(risk.relatedChartId);
  }

  protected showChart(risk: RiskItem): void {
    if (!risk.relatedChartId) return;
    this.jump.show({ chartId: risk.relatedChartId, event: IMPACT_EVENTS[risk.category] });
  }

  protected infoFor(risk: RiskItem): string | null {
    return infoForRisk(risk, this.pushedInfo());
  }

  protected showInfo(risk: RiskItem): void {
    const infoId = this.infoFor(risk);
    if (infoId) this.infoJump.show(infoId);
  }

  private receive(risks: readonly RiskItem[], loaded: boolean): void {
    const fresh: RiskItem[] = [];
    const changed: RiskItem[] = [];
    for (const risk of risks) {
      const next = signature(risk);
      const last = this.signatures.get(risk.riskId);
      if (last === undefined) fresh.push(risk);
      else if (last !== next) changed.push(risk);
      this.signatures.set(risk.riskId, next);
    }

    if (!this.started) {
      // The first snapshot is the starting point, not news: no entrance, marker or announcement.
      if (!loaded) return;
      this.started = true;
      afterNextRender(
        { write: () => this.enterClass.set('card-enter') },
        { injector: this.injector },
      );
      return;
    }

    for (const risk of changed) this.markUpdated(risk.riskId);
    this.announce(fresh, changed);
  }

  private markUpdated(riskId: string): void {
    this.updatedIds.update((ids) => new Set(ids).add(riskId));
    clearTimeout(this.timers.get(riskId));
    this.timers.set(
      riskId,
      setTimeout(() => {
        this.timers.delete(riskId);
        this.updatedIds.update((ids) => {
          const next = new Set(ids);
          next.delete(riskId);
          return next;
        });
      }, RISK_UPDATED_MS),
    );
  }

  private announce(fresh: readonly RiskItem[], changed: readonly RiskItem[]): void {
    const messages = [
      ...fresh.map((risk) => this.transloco.translate('risks.announce.new', { title: risk.title })),
      ...changed.map((risk) =>
        this.transloco.translate('risks.announce.updated', { title: risk.title }),
      ),
    ];
    if (messages.length === 0) return;
    // A live region only speaks when its text changes: the same message twice in a row toggles a
    // silent trailing no-break space, so it is read again.
    const message = messages.join(' ');
    this.announcement.update((last) => (last === message ? `${message} ` : message));
  }
}
