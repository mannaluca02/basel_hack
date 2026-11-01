import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import type { SuitabilityAnswers, SuitabilityCheck } from '@pax/contracts';
import { JourneyApi } from '../../core/advisor/api/journey-api';

type Answers = Omit<SuitabilityAnswers, 'annualPremiumCents' | 'singleInvestmentCents'>;
type Choice<K extends keyof Answers> = readonly {
  readonly value: Answers[K];
  readonly label: string;
}[];

/** Options and translation keys in full, for the i18n check. */
const NET_INCOME: Choice<'netIncome'> = [
  { value: 'under_75k', label: 'journey.suitability.option.netIncome.under_75k' },
  { value: '75k_150k', label: 'journey.suitability.option.netIncome.75k_150k' },
  { value: '150k_250k', label: 'journey.suitability.option.netIncome.150k_250k' },
  { value: 'over_250k', label: 'journey.suitability.option.netIncome.over_250k' },
];
const ASSETS: Choice<'netWorth'> = [
  { value: 'under_10k', label: 'journey.suitability.option.asset.under_10k' },
  { value: '10k_50k', label: 'journey.suitability.option.asset.10k_50k' },
  { value: '50k_150k', label: 'journey.suitability.option.asset.50k_150k' },
  { value: '150k_300k', label: 'journey.suitability.option.asset.150k_300k' },
  { value: 'over_300k', label: 'journey.suitability.option.asset.over_300k' },
];
const SAVING: Choice<'annualSavingCapacity'> = [
  { value: 'under_1k', label: 'journey.suitability.option.saving.under_1k' },
  { value: '1k_3k', label: 'journey.suitability.option.saving.1k_3k' },
  { value: '3k_7k', label: 'journey.suitability.option.saving.3k_7k' },
  { value: 'over_7k', label: 'journey.suitability.option.saving.over_7k' },
];
const GOAL: Choice<'investmentGoal'> = [
  { value: 'low_risk', label: 'journey.suitability.option.goal.low_risk' },
  { value: 'moderate_risk', label: 'journey.suitability.option.goal.moderate_risk' },
  { value: 'high_risk', label: 'journey.suitability.option.goal.high_risk' },
];
const HORIZON: Choice<'horizon'> = [
  { value: 'under_10_years', label: 'journey.suitability.option.horizon.under_10_years' },
  { value: '10_to_15_years', label: 'journey.suitability.option.horizon.10_to_15_years' },
  { value: 'over_15_years', label: 'journey.suitability.option.horizon.over_15_years' },
];
const EXPERIENCE: Choice<'securitiesExperience'> = [
  { value: 'none', label: 'journey.suitability.option.experience.none' },
  { value: 'knowledge_only', label: 'journey.suitability.option.experience.knowledge_only' },
  { value: 'experience', label: 'journey.suitability.option.experience.experience' },
  { value: 'extensive', label: 'journey.suitability.option.experience.extensive' },
];
const LOSS: Choice<'lossReaction'> = [
  { value: 'sell_all', label: 'journey.suitability.option.loss.sell_all' },
  { value: 'sell_part', label: 'journey.suitability.option.loss.sell_part' },
  { value: 'hold', label: 'journey.suitability.option.loss.hold' },
  { value: 'buy_more', label: 'journey.suitability.option.loss.buy_more' },
];
const STRATEGY: Choice<'selectedStrategy'> = [
  { value: 'conservative', label: 'journey.suitability.option.strategy.conservative' },
  { value: 'balanced', label: 'journey.suitability.option.strategy.balanced' },
  { value: 'dynamic', label: 'journey.suitability.option.strategy.dynamic' },
];
const REASONS: Readonly<Record<SuitabilityCheck['reasons'][number], string>> = {
  NOT_AFFORDABLE: 'journey.suitability.reason.NOT_AFFORDABLE',
  STRATEGY_DOES_NOT_MATCH_PROFILE: 'journey.suitability.reason.STRATEGY_DOES_NOT_MATCH_PROFILE',
  HORIZON_TOO_SHORT: 'journey.suitability.reason.HORIZON_TOO_SHORT',
};

let nextId = 0;

/**
 * The suitability pre-check of the Pax form (0054) for one fund-linked product and person: the
 * customer's own answers, scored by the backend. Not binding; a Pax specialist confirms and signs.
 * Emits the check, so the journey can offer the quote once it is suitable.
 */
@Component({
  selector: 'app-suitability-form',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form card" [attr.aria-labelledby]="id + '-title'" (submit)="submit($event)">
      <h3 [id]="id + '-title'">
        {{ 'journey.suitability.title' | transloco: { product: productName() } }}
      </h3>
      <p class="note">{{ 'journey.suitability.intro' | transloco }}</p>

      <div class="amounts">
        <label>
          <span>{{ 'journey.suitability.annualPremium' | transloco }}</span>
          <input
            type="number"
            min="0"
            step="100"
            inputmode="numeric"
            name="premium"
            class="field"
            [value]="francs(premium())"
            (input)="premium.set(chf($any($event.target).value))"
          />
        </label>
        <label>
          <span>{{ 'journey.suitability.singleInvestment' | transloco }}</span>
          <input
            type="number"
            min="0"
            step="1000"
            inputmode="numeric"
            name="single"
            class="field"
            [value]="francs(single())"
            (input)="single.set(chf($any($event.target).value))"
          />
        </label>
      </div>
      <p class="note">{{ 'journey.suitability.amountHint' | transloco }}</p>

      @for (field of fields; track field.key) {
        <label>
          <span>{{ field.label | transloco }}</span>
          <select class="field" [name]="field.key" (change)="set(field.key, $any($event.target).value)">
            @for (option of field.options; track option.value) {
              <option [value]="option.value" [selected]="answers()[field.key] === option.value">
                {{ option.label | transloco }}
              </option>
            }
          </select>
        </label>
      }

      <label>
        <span>{{ 'journey.suitability.guarantee' | transloco }}</span>
        <input
          type="number"
          min="0"
          max="100"
          step="10"
          name="guarantee"
          class="field"
          [value]="answers().guaranteedPercent"
          (input)="setGuarantee($any($event.target).value)"
        />
      </label>

      <label class="confirm choice">
        <input
          type="checkbox"
          name="confirm"
          [checked]="confirmed()"
          (change)="confirmed.set($any($event.target).checked)"
        />
        <span>{{ 'journey.suitability.confirm' | transloco }}</span>
      </label>

      <button type="submit" class="action action--primary" [disabled]="!ready() || busy()">
        {{ (busy() ? 'journey.working' : 'journey.suitability.submit') | transloco }}
      </button>

      @if (result(); as check) {
        <div class="result" role="status" [class.result--warning]="check.result !== 'suitable'">
          @if (check.result === 'suitable') {
            <p>{{ 'journey.suitability.suitable' | transloco }}</p>
          } @else {
            <p>{{ 'journey.suitability.advisedAgainst' | transloco }}</p>
            <ul>
              @for (reason of check.reasons; track reason) {
                <li>{{ reasonKey(reason) | transloco }}</li>
              }
            </ul>
          }
        </div>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </form>
  `,
  styles: `
    // Card, fields, checkbox and button come from src/styles.scss.
    h3 {
      margin: 0;
    }

    .note {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .amounts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      gap: 0.75rem;
    }

    // Pax UI: the label above the field in small paragraph text.
    label:not(.choice) {
      display: grid;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .field {
      font-size: 1rem;
    }

    .result {
      padding: 0.75rem 1rem;
      border-radius: var(--radius-m);
      background: var(--bg-success);
      color: var(--text-success);

      p,
      ul {
        margin: 0;
      }
    }

    .result--warning {
      background: var(--bg-warning);
      color: var(--text-warning);
    }

    .error {
      margin: 0;
      color: var(--text-error);
    }
  `,
})
export class SuitabilityForm {
  readonly caseId = input.required<string>();
  readonly productId = input.required<SuitabilityCheck['productId']>();
  readonly productName = input.required<string>();
  readonly personId = input.required<string>();
  readonly checked = output<SuitabilityCheck>();

  private readonly journey = inject(JourneyApi);
  protected readonly id = `suitability-${nextId++}`;
  protected readonly premium = signal<number | null>(null);
  protected readonly single = signal<number | null>(null);
  protected readonly answers = signal<Answers>({
    netIncome: '75k_150k',
    netWorth: '10k_50k',
    annualSavingCapacity: '3k_7k',
    singleInvestmentCapacity: '10k_50k',
    investmentGoal: 'moderate_risk',
    horizon: 'over_15_years',
    securitiesExperience: 'knowledge_only',
    lossReaction: 'hold',
    guaranteedPercent: 0,
    selectedStrategy: 'balanced',
  });
  protected readonly confirmed = signal(false);
  protected readonly busy = signal(false);
  protected readonly result = signal<SuitabilityCheck | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly ready = computed(
    () => this.confirmed() && (this.premium() !== null || this.single() !== null),
  );

  protected readonly fields: readonly {
    key: keyof Answers;
    label: string;
    options: Choice<keyof Answers>;
  }[] = [
    { key: 'netIncome', label: 'journey.suitability.netIncome', options: NET_INCOME },
    { key: 'netWorth', label: 'journey.suitability.netWorth', options: ASSETS },
    { key: 'annualSavingCapacity', label: 'journey.suitability.savingCapacity', options: SAVING },
    {
      key: 'singleInvestmentCapacity',
      label: 'journey.suitability.investmentCapacity',
      options: ASSETS,
    },
    { key: 'investmentGoal', label: 'journey.suitability.goal', options: GOAL },
    { key: 'horizon', label: 'journey.suitability.horizon', options: HORIZON },
    { key: 'securitiesExperience', label: 'journey.suitability.experience', options: EXPERIENCE },
    { key: 'lossReaction', label: 'journey.suitability.lossReaction', options: LOSS },
    { key: 'selectedStrategy', label: 'journey.suitability.strategy', options: STRATEGY },
  ];

  /** Cents back to the francs the customer typed. */
  protected francs(cents: number | null): number | string {
    return cents === null ? '' : cents / 100;
  }

  protected chf(value: string): number | null {
    const amount = Number(value);
    return value === '' || !Number.isFinite(amount) || amount < 0 ? null : Math.round(amount * 100);
  }

  protected set(key: keyof Answers, value: string): void {
    this.answers.update((answers) => ({ ...answers, [key]: value }));
  }

  protected setGuarantee(value: string): void {
    const percent = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    this.answers.update((answers) => ({ ...answers, guaranteedPercent: percent }));
  }

  protected reasonKey(reason: SuitabilityCheck['reasons'][number]): string {
    return REASONS[reason];
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.ready() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const check = await this.journey.checkSuitability(
        this.caseId(),
        this.productId(),
        this.personId(),
        {
          ...this.answers(),
          annualPremiumCents: this.premium(),
          singleInvestmentCents: this.single(),
        },
      );
      this.result.set(check);
      this.checked.emit(check);
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse
          ? (error.error?.message ?? error.error?.code ?? error.message)
          : String(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
