import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProgressSnapshot } from '../../core/advisor/contracts';
import { AgentActivity } from '../../core/advisor/ui-models';
import { LocaleFormat } from '../../core/i18n/locale-format';
import { SummarySheet } from '../../core/layout/summary-sheet';

/** Translation keys, written out in full for the i18n check. */
const ACTIVITY_LABELS: Readonly<Record<AgentActivity, string>> = {
  idle: 'dock.activity.idle',
  listening: 'dock.activity.listening',
  thinking: 'dock.activity.thinking',
  speaking: 'dock.activity.speaking',
  error: 'dock.activity.error',
};

let nextId = 0;

/**
 * The agent, sized by its parent (Paxi's stage, FE-28). The ring around the avatar shows how much
 * of the information for the advice is captured (I09 `ProgressSnapshot`, data capture only, never
 * an insurance score); an outer dotted halo marks an agent error. Tapping the avatar opens the
 * summary sheet (FE-19).
 *
 * Paxi (`app-paxi-avatar`) is projected into the slot inside the ring; without projected content
 * a placeholder shows.
 */
@Component({
  selector: 'app-agent-dock',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-activity]': 'activity()',
    '[class.unknown]': 'percent() === null',
  },
  template: `
    <button
      #button
      type="button"
      class="avatar"
      aria-haspopup="dialog"
      [attr.aria-describedby]="statusId"
      (click)="sheet.open(button)"
    >
      <svg class="ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle class="halo" cx="24" cy="24" r="22.5" pathLength="100" />
        <circle class="track" cx="24" cy="24" r="18.5" pathLength="100" />
        <circle
          class="fill"
          cx="24"
          cy="24"
          r="18.5"
          pathLength="100"
          [style.stroke-dashoffset]="100 - (percent() ?? 0)"
        />
      </svg>
      <span class="face">
        <ng-content>
          <svg class="placeholder" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="9" r="4" />
            <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
          </svg>
        </ng-content>
      </span>
      <span class="visually-hidden">{{ 'dock.open' | transloco }}</span>
    </button>

    <!-- One line each on screen; the hidden full stop keeps them apart when read aloud. -->
    <span class="tip" [id]="statusId">
      <span>{{ progressLabel() | transloco: progressParams() }}</span>
      <span class="visually-hidden">. </span>
      <span class="activity">{{ activityLabel() | transloco }}</span>
    </span>

    <!-- The ring is silent; an agent error must also reach screen readers away from the dock. -->
    <span class="visually-hidden" aria-live="polite">
      @if (activity() === 'error') {
        {{ 'dock.activity.error' | transloco }}
      }
    </span>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }

    .avatar {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      padding: 0;
      border: 0;
      border-radius: var(--radius-full);
      color: inherit;
      background: none;
      font: inherit;
      cursor: pointer;
    }

    // Starts at 12 o'clock and fills clockwise.
    .ring {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      transform: rotate(-90deg);
    }

    circle {
      fill: none;
    }

    .track {
      stroke: var(--border-track);
      stroke-width: 3.5;
    }

    // Unknown progress: an empty, dashed track instead of a misleading 0 %.
    :host(.unknown) .track {
      stroke-dasharray: 3 3;
    }

    .fill {
      stroke: var(--icon-brand-contrast);
      stroke-width: 3.5;
      stroke-dasharray: 100;
      transition: stroke-dashoffset 600ms ease-out;
    }

    // The avatar itself shows listening, thinking and speaking; a full halo for those could be
    // misread as a full ring. Only an agent error, which the avatar cannot show, marks the halo.
    .halo {
      stroke: transparent;
      stroke-width: 2;
      transition: stroke 200ms ease-out;
    }

    :host([data-activity='error']) .halo {
      stroke: var(--icon-error);
      stroke-dasharray: 2 3;
    }

    // The avatar renderer fills this circle.
    .face {
      position: absolute;
      inset: 16.5%;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: var(--radius-full);
      color: var(--icon-muted);
      background: var(--bg-muted);
    }

    // Paxi brings his own body and moves (tilt, nod, lift): no disc, no clipping. His rounded
    // square stays inside the ring's inner edge at this inset.
    .face:has(app-paxi-avatar) {
      inset: 4%;
      overflow: visible;
      background: none;
    }

    .placeholder {
      width: 65%;
      height: 65%;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }

    // Same tooltip as the rail tabs: next to the rail on hover (mouse) or keyboard focus.
    .tip {
      position: absolute;
      top: 50%;
      right: calc(100% + 0.5rem);
      display: flex;
      flex-direction: column;
      width: max-content;
      max-width: 15rem;
      padding: 0.25rem 0.5rem;
      border: var(--stroke-border) solid var(--border-soft);
      border-radius: var(--radius-sm);
      color: var(--text-default);
      background: var(--bg-default);
      font-size: 0.8125rem;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-50%);
      transition: opacity 120ms ease-out;
    }

    .activity {
      color: var(--text-muted);
    }

    .avatar:focus-visible + .tip {
      opacity: 1;
    }

    @media (hover: hover) {
      .avatar:hover + .tip {
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .fill,
      .halo,
      .tip {
        transition: none;
      }
    }
  `,
})
export class AgentDock {
  private readonly format = inject(LocaleFormat);
  protected readonly sheet = inject(SummarySheet);

  readonly progress = input<ProgressSnapshot | null>(null);
  readonly activity = input<AgentActivity>('idle');

  protected readonly statusId = `agent-dock-status-${nextId++}`;

  /** 0..100, or `null` while unknown. A non-finite value counts as unknown. */
  protected readonly percent = computed(() => {
    const percent = this.progress()?.percent;
    return typeof percent === 'number' && Number.isFinite(percent)
      ? Math.min(100, Math.max(0, percent))
      : null;
  });

  /** Rounded down, so the text never says 100 % before the backend does. */
  protected readonly progressParams = computed(() => {
    const percent = this.percent();
    return {
      percent:
        percent === null
          ? ''
          : this.format.percent(Math.floor(percent) / 100, { maximumFractionDigits: 0 }),
    };
  });

  /** Translation key; `{{percent}}` is only used by `dock.progress`. */
  protected readonly progressLabel = computed(() => {
    const percent = this.percent();
    if (percent === null) return 'dock.unknown';
    return percent >= 100 ? 'dock.complete' : 'dock.progress';
  });

  protected readonly activityLabel = computed(() => ACTIVITY_LABELS[this.activity()]);
}
