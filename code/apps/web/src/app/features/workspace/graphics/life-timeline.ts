import { ChangeDetectionStrategy, Component, afterNextRender, input, signal } from '@angular/core';
import { TimelineEntry } from './chart-options';

/**
 * Life events as a vertical timeline (FE-11, refined in FE-15): one row per event, oldest first,
 * so any number of events stays readable on a phone. Like every chart card, the card also offers
 * the events as a data table. The marker shape repeats the certainty: filled for past and
 * confirmed, hollow for planned, with a halo for today; a dashed line leads to planned events.
 */
@Component({
  selector: 'app-life-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="timeline">
      @for (entry of entries(); track entry.id) {
        <li
          class="entry"
          [attr.data-certainty]="entry.certainty"
          [class.today]="entry.today"
          [style.--marker]="'var(' + entry.token + ')'"
          [animate.enter]="enterClass()"
        >
          <!-- Angular drops the whitespace between the spans; the hidden ": " keeps
               year and event apart when read aloud. -->
          <span class="year">{{ entry.year }}<span class="visually-hidden">: </span></span>
          <span class="marker" aria-hidden="true"></span>
          <span class="label"
            >{{ entry.label
            }}<span class="visually-hidden">, {{ entry.certaintyLabel }}</span></span
          >
        </li>
      }
    </ol>
  `,
  styles: `
    .timeline {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .entry {
      position: relative;
      display: grid;
      grid-template-columns: 2.75rem 1rem 1fr;
      align-items: center;
      column-gap: 0.625rem;
      padding: 0.4375rem 0;
    }

    // The line through the markers; it is dashed towards planned events.
    .entry::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: calc(2.75rem + 0.625rem + 0.5rem - var(--stroke-m) / 2);
      border-left: var(--stroke-m) solid var(--border-soft);
    }

    .entry[data-certainty='planned']::before {
      border-left-style: dashed;
    }

    .entry:first-child::before {
      top: 50%;
    }

    .entry:last-child::before {
      bottom: 50%;
    }

    .entry:only-child::before {
      display: none;
    }

    .year {
      color: var(--text-muted);
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .marker {
      position: relative;
      justify-self: center;
      width: 0.75rem;
      height: 0.75rem;
      border: var(--stroke-m) solid var(--marker);
      border-radius: var(--radius-full);
      background: var(--marker);
    }

    .entry[data-certainty='planned'] .marker {
      background: var(--bg-default);
    }

    .today .marker {
      box-shadow:
        0 0 0 0.1875rem var(--bg-default),
        0 0 0 0.3125rem var(--marker);
    }

    .today .label {
      font-weight: 700;
    }

    .entry-enter {
      animation: entry-enter 300ms ease-out both;
    }

    @keyframes entry-enter {
      from {
        opacity: 0;
        transform: translateY(0.5rem);
      }
    }

    @keyframes entry-fade {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .entry-enter {
        animation-name: entry-fade;
      }
    }
  `,
})
export class LifeTimeline {
  readonly entries = input.required<readonly TimelineEntry[]>();

  /** Empty for the first render: the card itself enters; later events enter on their own. */
  protected readonly enterClass = signal('');

  constructor() {
    afterNextRender({ write: () => this.enterClass.set('entry-enter') });
  }
}
