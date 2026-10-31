import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FeedbackStage, JourneyApi } from '../../core/advisor/api/journey-api';

let nextId = 0;

/**
 * Net Promoter Score for the stage the customer reached: one score from 0 to 10, no free text.
 * The backend keeps one per stage and case and gives product management only the aggregate.
 */
@Component({
  selector: 'app-nps-card',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nps" [attr.aria-labelledby]="id">
      @if (done()) {
        <p class="thanks" role="status">{{ 'journey.nps.thanks' | transloco }}</p>
      } @else {
        <p class="question" [id]="id">{{ 'journey.nps.question' | transloco }}</p>
        <div class="scale" role="group" [attr.aria-labelledby]="id">
          @for (score of scores; track score) {
            <button type="button" class="score" [disabled]="busy()" (click)="send(score)">
              <span aria-hidden="true">{{ score }}</span>
              <span class="visually-hidden">{{ 'journey.nps.score' | transloco: { score } }}</span>
            </button>
          }
        </div>
        <p class="ends" aria-hidden="true">
          <span>{{ 'journey.nps.low' | transloco }}</span>
          <span>{{ 'journey.nps.high' | transloco }}</span>
        </p>
        @if (failed()) {
          <p class="error" role="alert">{{ 'journey.error' | transloco }}</p>
        }
      }
    </section>
  `,
  styles: `
    .nps {
      display: grid;
      gap: 0.5rem;
      padding: 1rem;
      border-radius: var(--radius-m);
      background: var(--bg-muted);
    }

    p {
      margin: 0;
    }

    .question {
      font-weight: var(--font-weight-bold);
    }

    .scale {
      display: grid;
      grid-template-columns: repeat(11, minmax(0, 1fr));
      gap: 0.25rem;
    }

    .score {
      min-height: 2.75rem;
      padding: 0;
      border: var(--stroke-s) solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-default);
      background: var(--bg-default);
      font: inherit;
      font-weight: var(--font-weight-medium);
      cursor: pointer;

      @media (hover: hover) {
        &:hover:not(:disabled) {
          border-color: var(--border-focusring);
        }
      }
    }

    .ends {
      display: flex;
      justify-content: space-between;
      color: var(--text-muted);
      font-size: 0.8125rem;
    }

    .thanks {
      color: var(--text-success);
    }

    .error {
      color: var(--text-error);
    }
  `,
})
export class NpsCard {
  readonly caseId = input.required<string>();
  readonly stage = input.required<FeedbackStage>();

  private readonly journey = inject(JourneyApi);
  protected readonly id = `nps-${nextId++}`;
  protected readonly scores = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly failed = signal(false);

  protected async send(score: number): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    try {
      await this.journey.feedback(this.caseId(), this.stage(), score);
      this.done.set(true);
    } catch (error) {
      // Already answered for this stage counts as answered.
      if (error instanceof HttpErrorResponse && error.error?.code === 'FEEDBACK_ALREADY_RECORDED')
        this.done.set(true);
      else this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
