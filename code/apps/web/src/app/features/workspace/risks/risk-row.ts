import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MoneyPeriod, Pillar } from '../../../core/advisor/contracts';
import { RiskItem, RiskSeverity } from '../../../core/advisor/ui-models';
import { LocaleFormat } from '../../../core/i18n/locale-format';
import { STATUS_KEYS } from '../graphics/chart-options';

// Translation keys, written out in full for the i18n check.

/**
 * Severity as a level meter: the number of filled bars carries the level, the colour only adds to
 * it, and the name is there for screen readers and as a tooltip.
 */
const SEVERITY_LOOK: Readonly<
  Record<RiskSeverity, { readonly key: string; readonly level: number }>
> = {
  high: { key: 'risks.severity.high', level: 3 },
  medium: { key: 'risks.severity.medium', level: 2 },
  low: { key: 'risks.severity.low', level: 1 },
};

/** Three bars of rising height on an 18×16 grid, bottom-aligned. */
const METER_BARS = [
  { x: 0, y: 9, height: 6 },
  { x: 7, y: 5, height: 10 },
  { x: 14, y: 1, height: 14 },
] as const;

const ADDRESSED_ICON = 'M5 12.5 9.5 17 19 7';

const PILLAR_KEYS: Readonly<Record<Pillar, string>> = {
  pillar1: 'graphics.series.pillar1',
  pillar2: 'graphics.series.pillar2',
  pillar3: 'graphics.series.pillar3',
};

const GAP_KEYS: Readonly<Record<MoneyPeriod, string>> = {
  month: 'risks.gapAmount.month',
  year: 'risks.gapAmount.year',
  once: 'risks.gapAmount.once',
};

let nextId = 0;

/**
 * One risk from the logic backend (FE-16) as a quiet row: severity, title and the gap. The row
 * opens to the explanation, the affected pillars, "Show in Graphics" and "Show in Info" (FE-18).
 * Severity, status and amount come as they are; the row only formats them (rule 3).
 */
@Component({
  selector: 'app-risk-row',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-risk-id]': 'risk().riskId',
    '[class.updated]': 'updated()',
  },
  template: `
    <h3 class="heading">
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="panelId"
        (click)="open.set(!open())"
      >
        @if (addressed()) {
          <span class="severity" data-severity="addressed">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path [attr.d]="addressedIcon" />
            </svg>
            <span class="visually-hidden">{{ 'risks.status.addressed' | transloco }}:&ngsp;</span>
          </span>
        } @else {
          <span
            class="severity"
            [attr.data-severity]="risk().severity"
            [attr.title]="severity().key | transloco"
          >
            <svg class="meter" viewBox="0 0 18 16" aria-hidden="true" focusable="false">
              @for (bar of meterBars; track $index) {
                <rect
                  [attr.x]="bar.x"
                  [attr.y]="bar.y"
                  width="4"
                  [attr.height]="bar.height"
                  rx="1"
                  [class.filled]="$index < severity().level"
                />
              }
            </svg>
            <span class="visually-hidden">{{ severity().key | transloco }}:&ngsp;</span>
          </span>
        }
        <span class="main">
          <!-- Spaces are explicit: Angular drops the whitespace between elements. -->
          <span class="title" [id]="titleId">{{ risk().title }}</span
          >&ngsp;
          @if (summary(); as summary) {
            <span class="summary">
              @if (summary.amount; as amount) {
                @if (summary.estimated) {
                  <span aria-hidden="true">≈</span>&ngsp;<span class="visually-hidden"
                    >{{ 'graphics.status.estimated' | transloco }}:</span
                  >&ngsp;
                }
                <span class="amount">{{ amount.key | transloco: { amount: amount.value } }}</span>
              }
              @if (summary.noteKey; as noteKey) {
                @if (summary.amount) {
                  &ngsp;·&ngsp;
                }
                <span class="note">{{ noteKey | transloco }}</span>
              }
            </span>
          }
        </span>
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </h3>

    <div class="panel" [id]="panelId" [hidden]="!open()">
      <p class="explanation">{{ risk().explanation }}</p>
      <p class="pillars">
        {{ 'risks.pillars' | transloco }}:
        @for (pillar of risk().pillars; track pillar; let last = $last) {
          {{ pillarKeys[pillar] | transloco }}{{ last ? '' : ' · ' }}
        }
      </p>
      @if (chartAvailable() || infoAvailable()) {
        <div class="links">
          @if (chartAvailable()) {
            <button
              type="button"
              class="jump"
              [attr.aria-describedby]="titleId"
              (click)="showChart.emit()"
            >
              {{ 'risks.showInGraphics' | transloco }}
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          }
          @if (infoAvailable()) {
            <button
              type="button"
              class="jump"
              [attr.aria-describedby]="titleId"
              (click)="showInfo.emit()"
            >
              {{ 'risks.showInInfo' | transloco }}
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './risk-row.scss',
})
export class RiskRow {
  private readonly format = inject(LocaleFormat);

  readonly risk = input.required<RiskItem>();
  /** The related chart is in the Graphics feed, so "Show in Graphics" has somewhere to go. */
  readonly chartAvailable = input(false);
  /** Tints the row; the tab sets it for a few seconds after a change. */
  readonly updated = input(false);
  readonly showChart = output<void>();
  /** The Info tab has a card for this risk, so "Show in Info" has somewhere to go. */
  readonly infoAvailable = input(false);
  readonly showInfo = output<void>();

  protected readonly open = signal(false);
  protected readonly titleId = `risk-row-title-${nextId}`;
  protected readonly panelId = `risk-row-panel-${nextId++}`;
  protected readonly pillarKeys = PILLAR_KEYS;
  protected readonly addressedIcon = ADDRESSED_ICON;
  protected readonly meterBars = METER_BARS;

  protected readonly addressed = computed(() => this.risk().status === 'addressed');
  protected readonly severity = computed(() => SEVERITY_LOOK[this.risk().severity]);

  /**
   * The second line of an open risk: the gap as the backend sent it (≈ when estimated), or what
   * stands in its way. Addressed risks have none.
   */
  protected readonly summary = computed(() => {
    const risk = this.risk();
    if (risk.status === 'addressed') return null;
    const money = risk.amount;
    const amount = money && {
      key: GAP_KEYS[money.period],
      // Rappen to francs is a unit change for display, not a calculation.
      value: this.format.chf(money.amount / 100, { maximumFractionDigits: 0 }),
    };
    let noteKey: string | null = null;
    if (!money && risk.status === 'needs_data') noteKey = 'risks.status.needs_data';
    else if (risk.resultStatus !== 'valid' && risk.resultStatus !== 'estimated')
      noteKey = STATUS_KEYS[risk.resultStatus];
    if (!amount && !noteKey) return null;
    return { amount, estimated: risk.resultStatus === 'estimated', noteKey };
  });
}
