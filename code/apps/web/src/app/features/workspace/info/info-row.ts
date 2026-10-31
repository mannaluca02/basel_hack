import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { InfoCategory } from '../../../core/advisor/ui-models';

/** How long a card stays highlighted after another tab pointed to it, as on a chart card. */
export const INFO_TARGET_MS = 2400;

// Translation keys, written out in full for the i18n check.

/** Each category has its own icon and name; the icon only adds to the name. */
const CATEGORY_LOOK: Readonly<
  Record<InfoCategory, { readonly key: string; readonly icon: string }>
> = {
  basics: {
    key: 'info.category.basics',
    icon: 'M4 5h5a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4ZM20 5h-5a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h6Z',
  },
  term: { key: 'info.category.term', icon: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 11v5M12 8h.01' },
  assumption: {
    key: 'info.category.assumption',
    icon: 'M4 10c2.7-3 5.3-3 8 0s5.3 3 8 0M4 15c2.7-3 5.3-3 8 0s5.3 3 8 0',
  },
};

let nextId = 0;

/**
 * One info card (FE-18) as a quiet row like a risk: category icon and title; the row opens to the
 * explanation and, if there is one, "Show in Graphics". Texts arrive translated (backend) or are
 * translated by the tab (glossary).
 */
@Component({
  selector: 'app-info-row',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-info-id]': 'infoId()',
    '[class.targeted]': 'targeted()',
  },
  template: `
    <h3 class="heading">
      <button
        #toggle
        type="button"
        class="toggle"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="panelId"
        (click)="open.set(!open())"
      >
        <span class="category" [attr.data-category]="category()">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path [attr.d]="look().icon" />
          </svg>
        </span>
        <span class="main">
          <!-- Spaces are explicit: Angular drops the whitespace between elements. -->
          <span class="title" [id]="titleId">{{ title() }}</span
          >&ngsp;
          @if (labelled() || fresh()) {
            <span class="summary">
              @if (fresh()) {
                <span class="new">{{ 'info.new' | transloco }}</span>
                @if (labelled()) {
                  &ngsp;·&ngsp;
                }
              }
              @if (labelled()) {
                <span>{{ look().key | transloco }}</span>
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
      <p class="body">{{ body() }}</p>
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
    </div>
  `,
  styleUrl: './info-row.scss',
})
export class InfoRow {
  readonly infoId = input.required<string>();
  readonly category = input.required<InfoCategory>();
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  /** Shows the category name under the title; off where the section heading already says it. */
  readonly labelled = input(true);
  /** The newest card pushed during the call. */
  readonly fresh = input(false);
  /** The related chart is in the Graphics feed, so "Show in Graphics" has somewhere to go. */
  readonly chartAvailable = input(false);
  readonly showChart = output<void>();

  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');
  private targetTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly open = signal(false);
  protected readonly targeted = signal(false);
  protected readonly titleId = `info-row-title-${nextId}`;
  protected readonly panelId = `info-row-panel-${nextId++}`;
  protected readonly look = computed(() => CATEGORY_LOOK[this.category()]);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.targetTimer));
  }

  /** Another tab pointed here: opens the card, moves focus to it and tints it for a moment. */
  highlight(): void {
    this.open.set(true);
    this.toggle().nativeElement.focus({ preventScroll: true });
    this.targeted.set(true);
    clearTimeout(this.targetTimer);
    this.targetTimer = setTimeout(() => this.targeted.set(false), INFO_TARGET_MS);
  }
}
