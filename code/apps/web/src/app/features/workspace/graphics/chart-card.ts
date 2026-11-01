import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ResultStatus } from '../../../core/advisor/contracts';
import { ChartResult, EventImpactScenario, ImpactEventKind } from '../../../core/advisor/ui-models';
import { LifeEventSelection } from '../../../core/layout/life-event-selection';
import { AppLanguage } from '../../../core/i18n/language';
import { LocaleFormat } from '../../../core/i18n/locale-format';
import { ColorScheme } from '../../../core/theme/color-scheme';
import { MotionPreference } from '../../../core/theme/motion-preference';
import { ChartCanvas } from './chart-canvas';
import { ChartContext, STATUS_KEYS, TITLE_KEYS, buildChartView } from './chart-options';
import { LifeTimeline } from './life-timeline';

/** How long the "updated" marker stays after a new revision arrived. */
export const UPDATED_MARKER_MS = 4000;
/** How long a card stays highlighted after another tab pointed to it. */
export const TARGET_MARKER_MS = 2400;

type Tone = 'success' | 'info' | 'warning' | 'error' | 'muted';

/** Every status gets its own text and icon; the colour only adds to them. */
const STATUS_LOOK: Readonly<Record<ResultStatus, { readonly tone: Tone; readonly icon: string }>> =
  {
    valid: { tone: 'success', icon: 'M5 12.5 9.5 17 19 7' },
    estimated: {
      tone: 'info',
      icon: 'M4 10c2.7-3 5.3-3 8 0s5.3 3 8 0M4 15c2.7-3 5.3-3 8 0s5.3 3 8 0',
    },
    requires_review: { tone: 'warning', icon: 'M12 4 3 20h18ZM12 10v4M12 17h.01' },
    needs_input: { tone: 'warning', icon: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v5M12 16h.01' },
    provider_error: { tone: 'error', icon: 'M6 6l12 12M18 6 6 18' },
    stale: { tone: 'muted', icon: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v4l3 2' },
    provisional: { tone: 'info', icon: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M8 12h.01M12 12h.01M16 12h.01' },
  };

let nextId = 0;

/** Identifies a life-event scenario across updates: the event and the person it happens to. */
function impactKey(scenario: EventImpactScenario): string {
  return `${scenario.event}:${scenario.personId}`;
}

/**
 * One chart in the Graphics feed: title, status as text, the drawn chart, a text legend and a data
 * table for screen readers and anyone who prefers numbers. An update of the same `chartId` arrives
 * as a new `chart` input; the card stays, the chart animates to the new values, and an "updated"
 * marker shows for a few seconds.
 */
@Component({
  selector: 'app-chart-card',
  imports: [TranslocoPipe, ChartCanvas, LifeTimeline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-chart-id]': 'chart().chartId' },
  template: `
    <!-- Focus target when the feed's "New chart" pill or "Show in Graphics" scrolls here. -->
    <article
      class="card"
      tabindex="-1"
      [class.targeted]="targeted()"
      [attr.aria-labelledby]="titleId"
    >
      <header class="head">
        <h2 class="title" [id]="titleId">{{ titleKey() | transloco }}</h2>
        <span class="badges">
          @if (updated()) {
            <span class="updated">{{ 'graphics.updated' | transloco }}</span>
          }
          <span class="status" [attr.data-tone]="look().tone">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path [attr.d]="look().icon" />
            </svg>
            {{ statusKey() | transloco }}
          </span>
        </span>
      </header>

      @if (view().unit; as unit) {
        <p class="unit">{{ unit }}</p>
      }

      @if (view().scenarios; as scenarios) {
        @if (scenarios.length > 1) {
          <div class="scenarios" role="group" [attr.aria-label]="'graphics.scenario' | transloco">
            @for (label of scenarios; track $index) {
              <button
                type="button"
                class="scenario"
                [attr.aria-pressed]="$index === view().scenario"
                (click)="selectScenario($index)"
              >
                {{ label }}
              </button>
            }
          </div>
        } @else if (scenarios.length === 1) {
          <p class="scenario-name">{{ scenarios[0] }}</p>
        }
      }

      @if (view().option; as option) {
        <app-chart-canvas class="chart" [option]="option" />
      }
      @if (view().timeline; as entries) {
        <app-life-timeline [entries]="entries" />
      }

      @if (view().annotation; as annotation) {
        <p class="annotation">{{ annotation }}</p>
      }

      <ul class="legend" [attr.aria-label]="'graphics.legend' | transloco">
        @for (item of view().legend; track item.label) {
          <li>
            <span
              class="swatch"
              [attr.data-mark]="item.mark"
              [style.--swatch]="'var(' + item.token + ')'"
            ></span>
            <!-- One text box, so a long name and its note wrap together like a sentence. -->
            <span
              >{{ item.label }}
              @if (item.note) {
                <span class="note">({{ item.note }})</span>
              }
            </span>
          </li>
        }
      </ul>

      <div class="actions">
        <button
          type="button"
          class="toggle"
          [attr.aria-expanded]="tableOpen()"
          [attr.aria-controls]="tableId"
          (click)="tableOpen.set(!tableOpen())"
        >
          {{ (tableOpen() ? 'graphics.table.hide' : 'graphics.table.show') | transloco }}
        </button>
        @if (infoAvailable()) {
          <button
            type="button"
            class="jump"
            [attr.aria-describedby]="titleId"
            (click)="showInfo.emit()"
          >
            {{ 'graphics.showInInfo' | transloco }}
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        }
      </div>

      <div class="table" [id]="tableId" [hidden]="!tableOpen()">
        @if (tableOpen()) {
          @let table = view().table;
          <table [class.text]="table.text">
            <caption class="visually-hidden">
              {{
                titleKey() | transloco
              }}
            </caption>
            <thead>
              <tr>
                @for (column of table.columns; track $index) {
                  <th scope="col">{{ column }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of table.rows; track $index) {
                <tr>
                  <th scope="row">{{ row.header }}</th>
                  @for (cell of row.cells; track $index) {
                    <td>{{ cell }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </article>
  `,
  styleUrl: './chart-card.scss',
})
export class ChartCard {
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(AppLanguage);
  private readonly format = inject(LocaleFormat);
  private readonly colors = inject(ColorScheme);
  private readonly motion = inject(MotionPreference);

  readonly chart = input.required<ChartResult>();
  /** The Info tab explains this chart (FE-18), so "Show in Info" has somewhere to go. */
  readonly infoAvailable = input(false);
  readonly showInfo = output<void>();

  protected readonly titleId = `chart-card-title-${nextId}`;
  protected readonly tableId = `chart-card-table-${nextId++}`;
  protected readonly tableOpen = signal(false);
  protected readonly updated = signal(false);
  protected readonly targeted = signal(false);
  private targetTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly titleKey = computed(() => TITLE_KEYS[this.chart().type]);
  protected readonly statusKey = computed(() => STATUS_KEYS[this.chart().status]);
  protected readonly look = computed(() => STATUS_LOOK[this.chart().status]);

  /** Rebuilt on a language switch, an OS theme switch and a reduced-motion change. */
  private readonly context = computed<ChartContext>(() => {
    this.language.language();
    return {
      // ColorScheme.token reads the scheme signal, so the view re-themes on an OS switch.
      token: (name) => this.colors.token(name),
      t: (key, params) => this.transloco.translate(key, params),
      chf: (francs) => this.format.chf(francs, { maximumFractionDigits: 0 }),
      short: (francs) => this.format.number(francs, { notation: 'compact' }),
      animate: !this.motion.reduced(),
    };
  });

  /**
   * Scenario shown by an event-impact chart, by event and person rather than position: kept
   * across updates of the same chart, even when the backend sends the scenarios in a new order.
   */
  private readonly scenarioKey = signal<string | null>(null);

  private readonly scenario = computed(() => {
    const chart = this.chart();
    const key = this.scenarioKey();
    if (chart.type !== 'event_impact' || key === null) return 0;
    // A scenario the update no longer has falls back to the first one.
    return Math.max(
      0,
      chart.scenarios.findIndex((s) => impactKey(s) === key),
    );
  });

  private readonly selection = inject(LifeEventSelection);

  protected readonly view = computed(() => {
    const event = this.selection.selected();
    return buildChartView(this.chart(), this.context(), {
      scenario: this.scenario(),
      ...(event ? { event: { year: event.year, label: event.label } } : {}),
    });
  });

  protected selectScenario(index: number): void {
    const chart = this.chart();
    if (chart.type !== 'event_impact' || !chart.scenarios[index]) return;
    this.scenarioKey.set(impactKey(chart.scenarios[index]));
  }

  /**
   * Another tab pointed here (FE-16): selects the first scenario of `event` on an event-impact
   * chart, if there is one, and highlights the card for a moment.
   */
  highlight(event?: ImpactEventKind): void {
    const chart = this.chart();
    const scenario =
      chart.type === 'event_impact' ? chart.scenarios.find((s) => s.event === event) : undefined;
    if (scenario) this.scenarioKey.set(impactKey(scenario));
    this.targeted.set(true);
    clearTimeout(this.targetTimer);
    this.targetTimer = setTimeout(() => this.targeted.set(false), TARGET_MARKER_MS);
  }

  constructor() {
    // A retirement picked on the timeline shows the retirement scenario of the event impact.
    effect(() => {
      const event = this.selection.selected();
      if (event?.kind !== 'retirement') return;
      untracked(() => {
        const chart = this.chart();
        if (chart.type !== 'event_impact') return;
        const scenario = chart.scenarios.find((s) => s.event === 'retirement');
        if (scenario) this.scenarioKey.set(impactKey(scenario));
      });
    });

    let lastRevision: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const revision = this.chart().revision;
      untracked(() => {
        if (lastRevision !== undefined && revision > lastRevision) {
          this.updated.set(true);
          clearTimeout(timer);
          timer = setTimeout(() => this.updated.set(false), UPDATED_MARKER_MS);
        }
        lastRevision = revision;
      });
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer);
      clearTimeout(this.targetTimer);
    });
  }
}
