import type { InsuranceCaseDto, ProposalChangeInput } from '@pax/contracts';

type Draft = InsuranceCaseDto['draft'];
type Period = 'month' | 'year';

/** One proposed change the way the customer reads it. `other` covers every field not named yet. */
export type ChangeView =
  | { readonly kind: 'gross'; readonly person: number; readonly cents: number }
  | {
      readonly kind: 'net';
      readonly person: number;
      readonly cents: number;
      readonly period: Period;
    }
  | {
      readonly kind: 'other';
      readonly person: number | null;
      readonly rows: readonly ProfileRow[];
    };

/** One value of the complete profile. `cents` is set for money, `text` for everything else. */
export interface ProfileRow {
  readonly path: string;
  readonly cents: number | null;
  readonly text: string | null;
}

export interface PersonView {
  readonly person: number;
  readonly grossCents: number | null;
  readonly netCents: number | null;
  readonly netPeriod: Period;
}

/** For display only: the `chf` pipe takes francs, the contracts carry whole Rappen. */
export function francs(cents: number | null): number | null {
  return cents === null ? null : cents / 100;
}

export function describeChange(change: ProposalChangeInput, draft: Draft): ChangeView {
  const persons = draft.financial?.persons ?? [];
  const person = persons.findIndex(({ id }) => id === change.personId);
  const income = /^financial\.persons\.(\d+)\.income\.value$/.exec(change.path);
  if (person >= 0 && typeof change.value === 'number') {
    if (/^insurance\.persons\.\d+\.grossAnnualIncomeCents$/.test(change.path)) {
      return { kind: 'gross', person: person + 1, cents: change.value };
    }
    const { income: field, incomeBasis } = persons[person];
    if (income && incomeBasis === 'net_after_income_tax' && field.period !== 'once') {
      return { kind: 'net', person: person + 1, cents: change.value, period: field.period };
    }
  }
  return {
    kind: 'other',
    person: person >= 0 ? person + 1 : null,
    rows: profileRows(change.value, change.path),
  };
}

/** Gross and budget net side by side, because neither is ever derived from the other. */
export function describePersons(draft: Draft): readonly PersonView[] {
  return (draft.financial?.persons ?? []).map(({ id, income }, index) => ({
    person: index + 1,
    grossCents:
      draft.insurance?.persons.find(({ personId }) => personId === id)?.grossAnnualIncomeCents ??
      null,
    netCents: income.value,
    netPeriod: income.period === 'month' ? 'month' : 'year',
  }));
}

/**
 * Every value of the draft, so "the complete profile was shown" is true.
 *
 * ponytail: labels are the contract paths. Name them field by field once the profile gets its
 * own screen; `describeChange` and `describePersons` cover what the customer decides on today.
 */
export function profileRows(value: unknown, path = ''): readonly ProfileRow[] {
  if (isAmount(value)) return [{ path, cents: value.value, text: null }];
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      profileRows(item, path ? `${path}.${key}` : key),
    );
  }
  if (typeof value === 'number' && path.endsWith('Cents')) {
    return [{ path, cents: value, text: null }];
  }
  return [{ path, cents: null, text: value === null ? '–' : String(value) }];
}

function isAmount(value: unknown): value is { value: number | null } {
  return typeof value === 'object' && value !== null && 'currency' in value && 'value' in value;
}
