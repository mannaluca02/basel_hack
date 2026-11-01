import type { InsuranceCaseDto } from '@pax/contracts';

/** Same fields, same order as the backend (`lab-intake.ts`). */
export const INTAKE_FIELDS = ['annual_gross_income_chf', 'employment_rate_percent', 'civil_status', 'has_pension_fund',
  'pillar_3a_annual_contribution_chf', 'monthly_housing_cost_chf', 'desired_retirement_age', 'risk_appetite'] as const;
export type IntakeFieldId = typeof INTAKE_FIELDS[number];
export type IntakeStatus = 'open' | 'asking' | 'unclear' | 'proposed' | 'accepted' | 'skipped';
export interface IntakeRow { fieldId: IntakeFieldId; status: IntakeStatus; value?: unknown; quote?: string; }
export interface IntakeMemory { attempts: Record<string, number>; clarifications: Record<string, { quote: string; value: string | null }>; }
export const emptyIntakeMemory: IntakeMemory = { attempts: {}, clarifications: {} };
/** Customer turns without an exact answer after which Paxi moves on, so it can never loop on one question. */
const MAX_ATTEMPTS = 2;

export interface TurnExtraction { clarifications?: { fieldId: string; quote: string; value: string | null; code?: string }[]; request?: { observations?: { fieldId: string }[] } | null; }

/** Where a field lands in a canonical change; person-bound fields must name the speaker. */
const targets: Record<IntakeFieldId, (change: { path: string; personId?: string }, personId: string) => boolean> = {
  annual_gross_income_chf: (c, p) => c.personId === p && c.path.endsWith('.grossAnnualIncomeCents'),
  employment_rate_percent: (c, p) => c.personId === p && c.path.endsWith('.employmentRateBps'),
  civil_status: c => c.path === 'insurance.relationship',
  has_pension_fund: (c, p) => c.personId === p && c.path.endsWith('.withPillar2'),
  pillar_3a_annual_contribution_chf: c => c.path === 'insurance.existingAnnualPillar3aContributionCents',
  monthly_housing_cost_chf: c => /^financial\.expenses\.\d+\.amount\.value$/.test(c.path),
  desired_retirement_age: (c, p) => c.personId === p && c.path.endsWith('.desiredWorkStopAge'),
  risk_appetite: c => c.path === 'insurance.riskAppetite',
};

/** Status per field, from the canonical case (the only source for captured values) plus the conversation memory. */
export function intakeRows(dto: InsuranceCaseDto, personId: string, memory: IntakeMemory): IntakeRow[] {
  const batches = (dto.proposalBatches ?? []).filter(b => b.status === 'proposed' || b.status === 'accepted');
  const rows: IntakeRow[] = INTAKE_FIELDS.map(fieldId => {
    // A new uncertain correction must be visible even while the older canonical proposal
    // remains unchanged. Only a later exact observation resolves this conversation memory.
    const unclear = memory.clarifications[fieldId];
    if (unclear) return { fieldId, status: (memory.attempts[fieldId] ?? 0) >= MAX_ATTEMPTS ? 'skipped' : 'unclear', value: unclear.value, quote: unclear.quote };
    // An open proposal beats an older accepted value.
    for (const status of ['proposed', 'accepted'] as const)
      for (const batch of batches.filter(b => b.status === status).reverse()) {
        const change = batch.changes.find(c => targets[fieldId](c, personId));
        if (change) return { fieldId, status, value: change.value };
        // The live start's case frame already carries the employment rate the person said.
        const frame = fieldId === 'employment_rate_percent' ? frameRate(batch.changes, personId) : undefined;
        if (frame !== undefined) return { fieldId, status, value: frame };
      }
    if ((memory.attempts[fieldId] ?? 0) >= MAX_ATTEMPTS) return { fieldId, status: 'skipped' };
    return { fieldId, status: 'open' };
  });
  const asking = rows.find(r => r.status === 'open');
  if (asking) asking.status = 'asking';
  return rows;
}

/** The employment rate of `personId` in a case-frame change (`financial` set at once), if any. */
function frameRate(changes: readonly { path: string; value?: unknown }[], personId: string): number | undefined {
  const frame = changes.find(c => c.path === 'financial')?.value as { persons?: { id: string; employmentRateBps: number }[] } | undefined;
  return frame?.persons?.find(p => p.id === personId)?.employmentRateBps;
}

/** The field Paxi asks next: the first unclear one, else the first open one; null when nothing is left. */
export function nextIntakeField(rows: IntakeRow[]): IntakeFieldId | null {
  return rows.find(r => r.status === 'unclear' || r.status === 'asking')?.fieldId ?? null;
}

/** Updates the memory after one customer turn. `extraction` is undefined when the extraction call failed. */
export function afterCustomerTurn(memory: IntakeMemory, asked: IntakeFieldId | null, extraction?: TurnExtraction): IntakeMemory {
  const attempts = { ...memory.attempts }, clarifications = { ...memory.clarifications };
  const exact = (extraction?.request?.observations ?? []).map(o => o.fieldId);
  for (const c of extraction?.clarifications ?? []) clarifications[c.fieldId] = { quote: c.quote, value: c.value };
  for (const id of exact) { delete clarifications[id]; delete attempts[id]; }
  // An answer to another field does not punish the asked one.
  if (asked && !exact.length) attempts[asked] = (attempts[asked] ?? 0) + 1;
  return { attempts, clarifications };
}

/** The minimal projection the agent follows: what is captured (never ask again) and exactly one next question
 * (the short `clarify` text while the field is unclear, so Paxi does not repeat the long question). */
export function steeringContext(rows: IntakeRow[], question: (fieldId: IntakeFieldId) => string, clarify?: string) {
  const next = nextIntakeField(rows), unclear = rows.find(r => r.fieldId === next)?.status === 'unclear';
  return { done: next === null, nextQuestion: next ? unclear && clarify ? clarify : question(next) : null,
    neverAskAgain: rows.filter(r => ['proposed', 'accepted', 'skipped'].includes(r.status)).map(r => r.fieldId),
    captured: Object.fromEntries(rows.filter(r => r.status === 'proposed' || r.status === 'accepted').map(r => [r.fieldId, r.value])) };
}
