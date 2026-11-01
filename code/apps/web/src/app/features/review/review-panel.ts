import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ProposalBatch } from '@pax/contracts';
import { CustomerReview } from '../../core/advisor/api/customer-review';
import { VoiceAgentLink } from '../../core/advisor/api/voice-agent-link';
import { ChfPipe } from '../../core/i18n/locale-format';
import { ChangeView, describeChange, describePersons, francs, profileRows } from './review-model';

const BATCH_STATUS: Readonly<Record<ProposalBatch['status'], string>> = {
  proposed: 'review.status.proposed',
  accepted: 'review.status.accepted',
  rejected: 'review.status.rejected',
  superseded: 'review.status.superseded',
};

/**
 * The review stand: what the case service currently proposes and the customer's decisions on it.
 * It sits above the tabs, so it stays on screen whichever tab is open when a question comes up.
 */
@Component({
  selector: 'app-review-panel',
  imports: [NgTemplateOutlet, ReactiveFormsModule, TranslocoPipe, ChfPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #changeRow let-change>
      @switch (change.kind) {
        @case ('gross') {
          <dt>{{ 'review.person' | transloco: { number: change.person } }}</dt>
          <dd>
            {{ 'review.gross' | transloco }}: {{ francs(change.cents) | chf }}
            {{ 'review.period.year' | transloco }}
          </dd>
        }
        @case ('net') {
          <dt>{{ 'review.person' | transloco: { number: change.person } }}</dt>
          <dd>
            {{ 'review.net' | transloco }}: {{ francs(change.cents) | chf }}
            {{ periodKey(change.period) | transloco }}
          </dd>
        }
        @default {
          <dt>
            @if (change.person) {
              {{ 'review.person' | transloco: { number: change.person } }}
            } @else {
              {{ 'review.other' | transloco }}
            }
          </dt>
          @for (row of change.rows; track row.path) {
            <dd>{{ row.path }}: {{ row.text ?? (francs(row.cents) | chf) }}</dd>
          }
        }
      }
    </ng-template>

    <ng-template #personRows let-item>
      <dt>{{ 'review.person' | transloco: { number: item.person } }}</dt>
      <dd>
        {{ 'review.gross' | transloco }}: {{ francs(item.grossCents) | chf }}
        {{ 'review.period.year' | transloco }}
      </dd>
      <dd>
        {{ 'review.net' | transloco }}: {{ francs(item.netCents) | chf }}
        {{ periodKey(item.netPeriod) | transloco }}
      </dd>
    </ng-template>

    <section class="review" aria-labelledby="review-title">
      <h2 #title id="review-title" tabindex="-1">{{ 'review.title' | transloco }}</h2>

      @if (review.invalidated()) {
        <p class="message" role="status">{{ 'review.stale' | transloco }}</p>
      }

      @if (review.error(); as error) {
        <p class="message message--error" role="alert">
          {{ error.message ?? ('review.error.transport' | transloco) }}
        </p>
      }

      @if (review.current() && !review.live()) {
        <p class="message" role="status">{{ 'review.offline' | transloco }}</p>
      }

      @if (!review.signedIn()) {
        <form class="sign-in" (submit)="signIn($event)">
          <label for="review-code">{{ 'review.signIn.label' | transloco }}</label>
          <input
            id="review-code"
            type="password"
            autocomplete="off"
            required
            [formControl]="accessCode"
          />
          <button type="submit" class="action" [disabled]="review.busy()">
            {{ 'review.signIn.submit' | transloco }}
          </button>
        </form>
      } @else if (review.current()) {
        <div class="demo">
          @if (review.empty()) {
            <p>{{ 'review.demo.emptyHint' | transloco }}</p>
            <button type="button" class="action" [disabled]="review.busy()" (click)="review.loadPersona()">
              {{ 'review.demo.loadPersona' | transloco }}
            </button>
          }
          @if (review.profileState() === 'confirmed' && !review.calculated()) {
            <button type="button" class="action action--primary" [disabled]="review.busy()" (click)="review.calculate()">
              {{ 'review.demo.calculate' | transloco }}
            </button>
            @if (review.busy()) {
              <p class="status" role="status">{{ 'review.demo.calculating' | transloco }}</p>
            }
          }
          @if (voice.available) {
            @switch (voice.state()) {
              @case ('notice') {
                @if (voice.notice(); as notice) {
                  <div class="voice-notice">
                    <p>{{ notice.text }}</p>
                    @if (!notice.enabled) {
                      <p class="status">{{ 'review.demo.voiceDisabled' | transloco }}</p>
                    }
                    <button type="button" class="action action--primary" (click)="voice.open()">
                      {{ 'review.demo.voiceAgree' | transloco }}
                    </button>
                    <button type="button" class="action" (click)="voice.dismiss()">
                      {{ 'review.question.cancel' | transloco }}
                    </button>
                  </div>
                }
              }
              @case ('linking') {
                <p class="status" role="status">{{ 'review.demo.voiceLinking' | transloco }}</p>
              }
              @default {
                <button type="button" class="action" [disabled]="review.empty()" (click)="voice.showNotice()">
                  {{ 'review.demo.voiceStart' | transloco }}
                </button>
                @if (voice.state() === 'opened') {
                  <p class="status" role="status">{{ 'review.demo.voiceOpened' | transloco }}</p>
                }
                @if (voice.state() === 'failed') {
                  <p class="message message--error" role="alert">{{ 'review.demo.voiceFailed' | transloco }}</p>
                }
              }
            }
          }
        </div>

        @for (item of batches(); track item.id) {
          <article class="batch">
            <dl [id]="'batch-' + item.id">
              @for (change of item.changes; track $index) {
                <ng-container
                  [ngTemplateOutlet]="changeRow"
                  [ngTemplateOutletContext]="{ $implicit: change }"
                />
              }
            </dl>
            <p class="status">{{ item.statusKey | transloco }}</p>
            @if (item.open) {
              <button
                type="button"
                class="action"
                [attr.aria-describedby]="'batch-' + item.id"
                [disabled]="locked()"
                (click)="review.open({ kind: 'accept_batch', batchId: item.id })"
              >
                {{ 'review.open' | transloco }}
              </button>
            }
          </article>
        } @empty {
          <p>{{ 'review.noBatches' | transloco }}</p>
        }

        @for (item of review.openAmbiguities(); track item.id) {
          <p class="ambiguity">
            <span>{{ item.question }}</span>
            <span class="status">
              @if (item.dialogueStatus === 'awaiting_customer_acceptance') {
                {{ 'review.ambiguity.answered' | transloco }}
              } @else {
                {{ 'review.ambiguity.open' | transloco }}
              }
            </span>
          </p>
        }

        <h3>{{ 'review.draft' | transloco }}</h3>
        <dl class="draft">
          @for (item of persons(); track item.person) {
            <ng-container
              [ngTemplateOutlet]="personRows"
              [ngTemplateOutletContext]="{ $implicit: item }"
            />
          }
        </dl>

        <h3>{{ 'review.profile.title' | transloco }}</h3>
        <p class="status" role="status">
          @switch (review.profileState()) {
            @case ('pending_acceptance') {
              {{ 'review.profile.pendingAcceptance' | transloco }}
            }
            @case ('open_ambiguity') {
              {{ 'review.profile.openAmbiguity' | transloco }}
            }
            @case ('incomplete') {
              {{ 'review.profile.incomplete' | transloco }}
            }
            @case ('confirmed') {
              {{ 'review.profile.confirmed' | transloco: { version: profileVersion() } }}
            }
            @default {
              {{ 'review.profile.ready' | transloco }}
            }
          }
        </p>
        @if (review.profileState() !== 'confirmed') {
          <button
            type="button"
            class="action"
            [disabled]="locked() || review.profileState() !== 'ready'"
            (click)="review.open({ kind: 'confirm_profile' })"
          >
            {{ 'review.profile.review' | transloco }}
          </button>
        }

        @if (review.confirmation(); as question) {
          <div class="question" #shownQuestion>
            <h3 #questionHeading tabindex="-1">{{ 'review.question.title' | transloco }}</h3>
            <p>{{ question.questionText }}</p>

            @if (questionChanges().length) {
              <dl>
                @for (change of questionChanges(); track $index) {
                  <ng-container
                    [ngTemplateOutlet]="changeRow"
                    [ngTemplateOutletContext]="{ $implicit: change }"
                  />
                }
              </dl>
            }

            @if (question.target.kind === 'confirm_profile') {
              @if (review.profileNotice(); as notice) {
                <div #shownProfile>
                  <h4>{{ 'review.question.profile' | transloco }}</h4>
                  <dl>
                    @for (item of questionPersons(); track item.person) {
                      <ng-container
                        [ngTemplateOutlet]="personRows"
                        [ngTemplateOutletContext]="{ $implicit: item }"
                      />
                    }
                  </dl>
                  <details open>
                    <summary>{{ 'review.question.allFields' | transloco }}</summary>
                    <dl class="fields">
                      @for (row of questionRows(); track row.path) {
                        <dt>{{ row.path }}</dt>
                        <dd>{{ row.text ?? (francs(row.cents) | chf) }}</dd>
                      }
                    </dl>
                  </details>
                  <h4>{{ 'review.question.assumptions' | transloco }}</h4>
                  <ul>
                    @for (assumption of notice.assumptions; track assumption) {
                      <li>{{ assumption }}</li>
                    }
                  </ul>
                </div>
                <div #shownNotice>
                  <h4>{{ 'review.question.notice' | transloco }}</h4>
                  <p>{{ notice.privacy.purpose }}</p>
                  <p>{{ notice.privacy.recipients }}</p>
                  <p>{{ notice.privacy.storage }}</p>
                  <p>{{ notice.privacy.release }}</p>
                </div>
              }
            }

            <div class="actions">
              @if (question.channel === 'voice') {
                <p class="status" role="status">{{ 'review.question.voice' | transloco }}</p>
              } @else if (question.target.kind === 'confirm_profile') {
                <button
                  type="button"
                  class="action action--primary"
                  [disabled]="!answerable()"
                  (click)="review.decide('accept')"
                >
                  {{ 'review.question.confirm' | transloco }}
                </button>
              } @else {
                <button
                  type="button"
                  class="action action--primary"
                  [disabled]="!answerable()"
                  (click)="review.decide('accept')"
                >
                  {{ 'review.question.accept' | transloco }}
                </button>
                <button
                  type="button"
                  class="action"
                  [disabled]="!answerable()"
                  (click)="review.decide('reject')"
                >
                  {{ 'review.question.reject' | transloco }}
                </button>
              }
              <button
                type="button"
                class="action"
                [disabled]="review.busy()"
                (click)="review.cancel('cancelled_by_customer')"
              >
                {{ 'review.question.cancel' | transloco }}
              </button>
            </div>
          </div>
        }
      } @else {
        <p role="status">{{ 'review.loading' | transloco }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 1.5rem;
    }

    .review {
      padding: 1rem;
      border: var(--stroke-s) solid var(--border-default);
      border-radius: var(--radius-sm);
    }

    h3 {
      margin: 1rem 0 0.25rem;
    }

    dl {
      margin: 0;
    }

    dt {
      font-weight: 700;
    }

    dd {
      margin: 0 0 0.25rem;
    }

    .demo {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .demo p {
      margin: 0;
    }

    .voice-notice {
      flex-basis: 100%;
      padding: 0.75rem;
      border-radius: var(--radius-sm);
      background: var(--bg-muted);
    }

    .batch {
      margin-bottom: 0.75rem;
      padding: 0.75rem;
      border-radius: var(--radius-sm);
      background: var(--bg-muted);
    }

    h4 {
      margin: 0.75rem 0 0.25rem;
      font-size: 1rem;
    }

    .question {
      margin-top: 1rem;
      padding: 0.75rem;
      border-left: var(--stroke-m) solid var(--border-focusring);
      background: var(--bg-muted);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }

    .fields {
      overflow-wrap: anywhere;
      font-size: 0.875rem;
    }

    .status {
      margin: 0.25rem 0 0;
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .ambiguity {
      display: flex;
      flex-direction: column;
      margin: 0 0 0.75rem;
    }

    .message--error {
      border-left-color: var(--border-error);
      color: var(--text-error);
      background: var(--bg-error);
    }

    .status + .action {
      margin-top: 0.5rem;
    }

    .message {
      margin: 0 0 0.75rem;
      padding: 0.5rem 0.75rem;
      border-left: var(--stroke-m) solid var(--border-focusring);
      background: var(--bg-muted);
    }

    .sign-in {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: 24rem;

      input {
        min-height: 2.75rem;
        padding: 0 0.75rem;
        border: var(--stroke-s) solid var(--border-default);
        border-radius: var(--radius-sm);
        font: inherit;
      }
    }
  `,
})
export class ReviewPanel {
  protected readonly review = inject(CustomerReview);
  protected readonly voice = inject(VoiceAgentLink);

  protected readonly batches = computed(() => {
    const draft = this.review.current()?.draft;
    if (!draft) return [];
    return this.review.batches().map((batch) => ({
      id: batch.id,
      open: this.review.pendingBatches().includes(batch),
      statusKey:
        batch.status === 'proposed' && this.review.outdated().has(batch.id)
          ? 'review.status.outdated'
          : BATCH_STATUS[batch.status],
      changes: batch.changes.map((change): ChangeView => describeChange(change, draft)),
    }));
  });

  protected readonly persons = computed(() => {
    const draft = this.review.current()?.draft;
    return draft ? describePersons(draft) : [];
  });

  /** One question at a time: a second one would invalidate the one on screen. */
  protected readonly locked = computed(
    () => this.review.busy() || this.review.confirmation() !== null,
  );

  /** False while the question is being reported as shown, or its profile is not on screen. */
  protected readonly answerable = computed(() => {
    const question = this.review.confirmation();
    if (this.review.busy() || question?.status !== 'awaiting_answer') return false;
    return question.target.kind !== 'confirm_profile' || this.review.profileNotice() !== null;
  });

  protected readonly questionChanges = computed(() => {
    const review = this.review.confirmation()?.review;
    return (review?.changes ?? []).map((change) => describeChange(change, review!.draft));
  });

  protected readonly questionPersons = computed(() => {
    const draft = this.review.confirmation()?.review.draft;
    return draft ? describePersons(draft) : [];
  });

  protected readonly questionRows = computed(() =>
    profileRows(this.review.confirmation()?.review.draft ?? {}),
  );

  protected readonly profileVersion = computed(
    () => this.review.current()?.confirmedVersions.at(-1)?.version,
  );

  protected readonly francs = francs;
  protected readonly accessCode = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  private readonly shownQuestion = viewChild<ElementRef<HTMLElement>>('shownQuestion');
  private readonly shownProfile = viewChild<ElementRef<HTMLElement>>('shownProfile');
  private readonly shownNotice = viewChild<ElementRef<HTMLElement>>('shownNotice');
  private readonly questionHeading = viewChild<ElementRef<HTMLElement>>('questionHeading');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  private questionOnScreen = false;

  constructor() {
    // Runs after the render, on the real elements: the backend only has this client's word that
    // the customer saw the question, so it is not given before they did.
    afterRenderEffect(() => {
      const question = this.review.confirmation();
      if (!this.shownQuestion() || question?.status !== 'awaiting_presentation') return;
      const shown = { profile: !!this.shownProfile(), notice: !!this.shownNotice() };
      if (question.target.kind === 'confirm_profile' && !(shown.profile && shown.notice)) return;
      void this.review.reviewDisplayed(shown);
    });
    // The focused button disappears with the question: keep keyboard users in the review stand.
    afterRenderEffect(() => {
      const heading = this.questionHeading()?.nativeElement;
      if (heading) heading.focus();
      else if (this.questionOnScreen) this.title()?.nativeElement.focus();
      this.questionOnScreen = !!heading;
    });
  }

  protected periodKey(period: 'month' | 'year'): string {
    return period === 'month' ? 'review.period.month' : 'review.period.year';
  }

  protected signIn(event: Event): void {
    event.preventDefault();
    if (this.accessCode.invalid) return;
    void this.review.signIn(this.accessCode.value);
    this.accessCode.reset();
  }
}
