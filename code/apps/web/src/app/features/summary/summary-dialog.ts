import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Money, PILLARS, Pillar, ResultStatus } from '../../core/advisor/contracts';
import { CaseStore } from '../../core/advisor/store/case-store';
import { ChfPipe } from '../../core/i18n/locale-format';
import { SummarySheet } from '../../core/layout/summary-sheet';
import { HumanAdvisorStatus } from '../human-advisor/human-advisor-status';

/** Translation keys, written out in full for the i18n check. */
const PILLAR_KEYS: Readonly<Record<Pillar, string>> = {
  pillar1: 'summary.pillar.pillar1',
  pillar2: 'summary.pillar.pillar2',
  pillar3: 'summary.pillar.pillar3',
};
const PERIOD_KEYS: Readonly<Record<Money['period'], string>> = {
  month: 'summary.period.month',
  year: 'summary.period.year',
  once: 'summary.period.once',
};
const STATUS_KEYS: Readonly<Record<ResultStatus, string>> = {
  valid: 'graphics.status.valid',
  estimated: 'graphics.status.estimated',
  requires_review: 'graphics.status.requires_review',
  needs_input: 'graphics.status.needs_input',
  provider_error: 'graphics.status.provider_error',
  stale: 'graphics.status.stale',
};

/** How far a swipe on the handle must pull down to close the sheet. */
const SWIPE_CLOSE_PX = 80;

/**
 * The summary sheet (FE-19), opened by tapping the avatar. A native modal dialog: it keeps focus
 * inside, closes with Esc, the close button or a swipe down on the handle, and `SummarySheet`
 * returns focus to the avatar. It shows the I08 SummaryBundle live while open.
 *
 * Products stay locked until needs, finances and all three pillars are captured (rule 1), and a
 * unit-linked product says that the suitability check is still required (rule 6).
 */
@Component({
  selector: 'app-summary-dialog',
  imports: [TranslocoPipe, ChfPipe, HumanAdvisorStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet" aria-labelledby="summary-title" (close)="sheet.close()">
      <div
        class="handle"
        aria-hidden="true"
        (pointerdown)="swipeStart($event)"
        (pointerup)="swipeEnd($event)"
      ></div>
      <header>
        <h2 id="summary-title">{{ 'summary.title' | transloco }}</h2>
        @if (summary()?.status === 'draft') {
          <span class="badge">{{ 'summary.draft' | transloco }}</span>
        }
        <button type="button" class="close" (click)="sheet.close()">
          <span aria-hidden="true">×</span>
          <span class="visually-hidden">{{ 'summary.close' | transloco }}</span>
        </button>
      </header>

      @if (summary(); as s) {
        @if (s.reviewOpen) {
          <p class="note">{{ 'summary.reviewOpen' | transloco }}</p>
        }

        @if (s.keyFacts.length) {
          <section aria-labelledby="summary-facts">
            <h3 id="summary-facts">{{ 'summary.keyFacts' | transloco }}</h3>
            <dl class="facts">
              @for (fact of s.keyFacts; track fact.factId) {
                <div>
                  <dt>{{ fact.label }}</dt>
                  <dd>
                    @if (fact.value; as value) {
                      {{ value.amount / 100 | chf: { maximumFractionDigits: 0 } }}
                      <span class="period">{{ periodKey(value) | transloco }}</span>
                    } @else {
                      {{ fact.text ?? ('summary.unknown' | transloco) }}
                    }
                  </dd>
                </div>
              }
            </dl>
          </section>
        }

        @if (s.goals.length) {
          <section aria-labelledby="summary-goals">
            <h3 id="summary-goals">{{ 'summary.goals' | transloco }}</h3>
            <ul>
              @for (goal of s.goals; track goal.id) {
                <li>{{ goal.text }}</li>
              }
            </ul>
          </section>
        }

        <section aria-labelledby="summary-pillars">
          <h3 id="summary-pillars">{{ 'summary.pillars' | transloco }}</h3>
          <ul class="pillars">
            @for (pillar of pillars; track pillar) {
              @let item = s.pillars[pillar];
              <li>
                <strong>{{ pillarKey(pillar) | transloco }}</strong>
                <span>{{ item.text }}</span>
                <span class="amount">
                  @if (item.retirementIncome; as income) {
                    {{ income.amount / 100 | chf: { maximumFractionDigits: 0 } }}
                    {{ periodKey(income) | transloco }}
                  } @else {
                    {{ 'summary.unknown' | transloco }}
                  }
                  <span class="status">· {{ statusKey(item.status) | transloco }}</span>
                </span>
              </li>
            }
          </ul>
        </section>

        @if (s.gaps.length) {
          <section aria-labelledby="summary-gaps">
            <h3 id="summary-gaps">{{ 'summary.gaps' | transloco }}</h3>
            <ul>
              @for (gap of s.gaps; track gap.gapId) {
                <li>
                  {{ gap.label }}:
                  @if (gap.amount; as amount) {
                    {{ amount.amount / 100 | chf: { maximumFractionDigits: 0 } }}
                    {{ periodKey(amount) | transloco }}
                  } @else {
                    {{ 'summary.unknown' | transloco }}
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (s.openQuestions.length) {
          <section aria-labelledby="summary-questions">
            <h3 id="summary-questions">{{ 'summary.openQuestions' | transloco }}</h3>
            <ul>
              @for (question of s.openQuestions; track question.id) {
                <li>{{ question.text }}</li>
              }
            </ul>
          </section>
        }

        @if (s.nextSteps.length) {
          <section aria-labelledby="summary-steps">
            <h3 id="summary-steps">{{ 'summary.nextSteps' | transloco }}</h3>
            <ol>
              @for (step of s.nextSteps; track step.id) {
                <li>{{ step.text }}</li>
              }
            </ol>
          </section>
        }

        <section aria-labelledby="summary-products" class="products">
          <h3 id="summary-products">{{ 'summary.products' | transloco }}</h3>
          @if (!gateOpen()) {
            <p class="locked">{{ 'summary.productsLocked' | transloco }}</p>
          } @else if (!s.products?.length) {
            <p>{{ 'summary.noProducts' | transloco }}</p>
          } @else {
            @if (s.status === 'draft') {
              <p class="note">{{ 'summary.productsDraft' | transloco }}</p>
            }
            <ul>
              @for (product of s.products; track product.candidateId) {
                <li>
                  <strong>{{ product.name }}</strong>
                  @if (product.need; as need) {
                    <span>
                      {{ 'summary.need' | transloco }}
                      {{ need.amount / 100 | chf: { maximumFractionDigits: 0 } }}
                      {{ periodKey(need) | transloco }}
                    </span>
                  }
                  @if (product.unitLinked && !s.productGate.suitabilityCheckDone) {
                    <span class="badge badge--warning">{{ 'summary.suitabilityRequired' | transloco }}</span>
                  }
                </li>
              }
            </ul>
          }
        </section>
      } @else {
        <p class="empty">{{ 'summary.empty' | transloco }}</p>
      }

      <section aria-labelledby="summary-human" class="human">
        <h3 id="summary-human">{{ 'summary.human' | transloco }}</h3>
        <app-human-advisor-status placement="sheet" />
      </section>
    </dialog>
  `,
  styles: `
    .sheet {
      box-sizing: border-box;
      width: min(40rem, 100%);
      max-width: 100%;
      max-height: 90dvh;
      margin: auto auto 0;
      padding: 0 1.25rem 1.25rem;
      padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
      border: 0;
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      color: var(--text-default);
      background: var(--bg-default);
      overflow-y: auto;
    }

    .sheet::backdrop {
      background: var(--text-default);
      opacity: 0.4;
    }

    .handle {
      width: 2.5rem;
      height: 0.25rem;
      margin: 0.75rem auto 0.5rem;
      border-radius: var(--radius-full);
      background: var(--border-subtle);
      touch-action: none;
      cursor: grab;
    }

    header {
      position: sticky;
      top: 0;
      display: flex;
      gap: 0.75rem;
      align-items: center;
      padding: 0.25rem 0 0.75rem;
      background: var(--bg-default);
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    h3 {
      margin: 1.25rem 0 0.5rem;
      font-size: 1rem;
    }

    .close {
      margin-left: auto;
      width: 2.75rem;
      height: 2.75rem;
      border: 0;
      border-radius: var(--radius-full);
      color: inherit;
      background: var(--bg-muted);
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
    }

    .badge {
      padding: 0.125rem 0.5rem;
      border-radius: var(--radius-full);
      color: var(--text-info);
      background: var(--bg-info);
      font-size: 0.8125rem;
    }

    .badge--warning {
      color: var(--text-warning);
      background: var(--bg-warning);
    }

    .note,
    .locked {
      padding: 0.5rem 0.75rem;
      border-left: var(--stroke-m) solid var(--border-info);
      background: var(--bg-muted);
    }

    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      gap: 0.5rem 1rem;
      margin: 0;
    }

    .facts dt {
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .facts dd {
      margin: 0;
      font-weight: 700;
    }

    .period,
    .status {
      color: var(--text-muted);
      font-weight: 400;
    }

    ul,
    ol {
      margin: 0;
      padding-left: 1.25rem;
    }

    li {
      margin-bottom: 0.375rem;
    }

    .pillars,
    .products ul {
      padding: 0;
      list-style: none;
    }

    .pillars li,
    .products li {
      display: grid;
      gap: 0.125rem;
      padding: 0.5rem 0;
      border-bottom: var(--stroke-s) solid var(--border-soft);
    }

    .products .badge {
      justify-self: start;
    }

    .empty {
      color: var(--text-muted);
    }
  `,
})
export class SummaryDialog {
  protected readonly sheet = inject(SummarySheet);
  private readonly store = inject(CaseStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private swipeY: number | null = null;

  protected readonly pillars = PILLARS;
  protected readonly summary = this.store.summary;

  /** Rule 1: products only once needs, finances and all three pillars are captured. */
  protected readonly gateOpen = computed(() => {
    const gate = this.summary()?.productGate;
    return !!gate && gate.needsCaptured && gate.financesCaptured && gate.allPillarsCaptured;
  });

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.sheet.isOpen() && !dialog.open) dialog.showModal();
      else if (!this.sheet.isOpen() && dialog.open) dialog.close();
    });
  }

  protected periodKey(value: Money): string {
    return PERIOD_KEYS[value.period];
  }

  protected pillarKey(pillar: Pillar): string {
    return PILLAR_KEYS[pillar];
  }

  protected statusKey(status: ResultStatus): string {
    return STATUS_KEYS[status];
  }

  protected swipeStart(event: PointerEvent): void {
    this.swipeY = event.clientY;
  }

  protected swipeEnd(event: PointerEvent): void {
    if (this.swipeY !== null && event.clientY - this.swipeY > SWIPE_CLOSE_PX) this.sheet.close();
    this.swipeY = null;
  }
}
