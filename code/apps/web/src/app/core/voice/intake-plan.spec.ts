import type { InsuranceCaseDto } from '@pax/contracts';
import { reviewCase } from '../advisor/api/review-testing';
import { INTAKE_FIELDS, afterCustomerTurn, emptyIntakeMemory, intakeRows, nextIntakeField, steeringContext } from './intake-plan';

const PERSON = 'person_demo_1';
const batch = (status: string, changes: { path: string; personId?: string; value: unknown }[]) => ({ id: `batch_${status}`, status, changes });
const caseWith = (...batches: ReturnType<typeof batch>[]) => reviewCase({ proposalBatches: batches, confirmedVersions: [] } as unknown as Partial<InsuranceCaseDto>);
const row = (rows: ReturnType<typeof intakeRows>, fieldId: string) => rows.find(r => r.fieldId === fieldId)!;
const exact = (fieldId: string) => ({ clarifications: [], request: { observations: [{ fieldId }] } });
const income = 'insurance.persons.0.grossAnnualIncomeCents';

describe('intake plan', () => {
  it('lists every field in order and asks the first open one', () => {
    const rows = intakeRows(caseWith(), PERSON, emptyIntakeMemory);
    expect(rows.map(r => r.fieldId)).toEqual([...INTAKE_FIELDS]);
    expect(INTAKE_FIELDS).toHaveLength(8);
    expect(rows.map(r => r.status)).toEqual(['asking', 'open', 'open', 'open', 'open', 'open', 'open', 'open']);
    expect(nextIntakeField(rows)).toBe('annual_gross_income_chf');
  });

  it('reads proposed values from the open canonical batch, including the housing expense and global fields', () => {
    const dto = caseWith(batch('proposed', [
      { path: income, personId: PERSON, value: 10000000 },
      { path: 'insurance.relationship', value: 'married' },
      { path: 'financial.expenses.0.amount.value', value: 220000 },
      { path: 'financial.expenses.0.amount.period', value: 'month' },
    ]));
    const rows = intakeRows(dto, PERSON, emptyIntakeMemory);
    expect(row(rows, 'annual_gross_income_chf')).toMatchObject({ status: 'proposed', value: 10000000 });
    expect(row(rows, 'civil_status')).toMatchObject({ status: 'proposed', value: 'married' });
    expect(row(rows, 'monthly_housing_cost_chf')).toMatchObject({ status: 'proposed', value: 220000 });
    expect(nextIntakeField(rows)).toBe('employment_rate_percent');
  });

  it('never treats a superseded batch or another person as captured', () => {
    const dto = caseWith(batch('superseded', [{ path: income, personId: PERSON, value: 1 }]));
    expect(row(intakeRows(dto, PERSON, emptyIntakeMemory), 'annual_gross_income_chf').status).toBe('asking');
    const other = caseWith(batch('proposed', [{ path: 'insurance.persons.1.grossAnnualIncomeCents', personId: 'person_demo_2', value: 1 }]));
    expect(row(intakeRows(other, PERSON, emptyIntakeMemory), 'annual_gross_income_chf').status).toBe('asking');
  });

  it('marks accepted batches as accepted', () => {
    const rows = intakeRows(caseWith(batch('accepted', [{ path: 'insurance.riskAppetite', value: 'low' }])), PERSON, emptyIntakeMemory);
    expect(row(rows, 'risk_appetite')).toMatchObject({ status: 'accepted', value: 'low' });
  });

  it('shows a clarification at once and asks it first', () => {
    const memory = afterCustomerTurn(emptyIntakeMemory, 'annual_gross_income_chf', {
      clarifications: [{ fieldId: 'annual_gross_income_chf', quote: '100.000 Franken', value: '100000', code: 'AMBIGUOUS_VALUE' }], request: { observations: [] },
    });
    const rows = intakeRows(caseWith(), PERSON, memory);
    expect(row(rows, 'annual_gross_income_chf')).toMatchObject({ status: 'unclear', value: '100000', quote: '100.000 Franken' });
    expect(nextIntakeField(rows)).toBe('annual_gross_income_chf');
  });

  it('resolves a clarification with the exact answer and moves on', () => {
    let memory = afterCustomerTurn(emptyIntakeMemory, 'annual_gross_income_chf', {
      clarifications: [{ fieldId: 'annual_gross_income_chf', quote: '100.000 Franken', value: '100000', code: 'AMBIGUOUS_VALUE' }],
    });
    memory = afterCustomerTurn(memory, 'annual_gross_income_chf', exact('annual_gross_income_chf'));
    const rows = intakeRows(caseWith(batch('proposed', [{ path: income, personId: PERSON, value: 10000000 }])), PERSON, memory);
    expect(row(rows, 'annual_gross_income_chf').status).toBe('proposed');
    expect(nextIntakeField(rows)).toBe('employment_rate_percent');
  });

  it('surfaces an unclear correction instead of silently repeating the older captured value', () => {
    const dto = caseWith(batch('proposed', [{ path: income, personId: PERSON, value: 11900000 }]));
    const memory = afterCustomerTurn(emptyIntakeMemory, 'employment_rate_percent', {
      clarifications: [{ fieldId: 'annual_gross_income_chf', quote: 'Korrektur, eher 100.000 bis 110.000', value: null }],
    });
    const rows = intakeRows(dto, PERSON, memory);
    expect(row(rows, 'annual_gross_income_chf')).toMatchObject({ status: 'unclear', quote: 'Korrektur, eher 100.000 bis 110.000' });
    expect(nextIntakeField(rows)).toBe('annual_gross_income_chf');
    expect(steeringContext(rows, id => id).neverAskAgain).not.toContain('annual_gross_income_chf');
  });

  it('skips a field after two turns without an exact answer, so Paxi can never loop', () => {
    let memory = emptyIntakeMemory;
    for (let i = 0; i < 2; i++) {
      expect(nextIntakeField(intakeRows(caseWith(), PERSON, memory))).toBe('annual_gross_income_chf');
      memory = afterCustomerTurn(memory, 'annual_gross_income_chf', { clarifications: [], request: { observations: [] } });
    }
    const rows = intakeRows(caseWith(), PERSON, memory);
    expect(row(rows, 'annual_gross_income_chf').status).toBe('skipped');
    expect(nextIntakeField(rows)).toBe('employment_rate_percent');
  });

  it('counts a repeated unclear answer towards the skip limit', () => {
    const unclear = { clarifications: [{ fieldId: 'annual_gross_income_chf', quote: 'viel', value: null, code: 'AMBIGUOUS_VALUE' }] };
    const memory = afterCustomerTurn(afterCustomerTurn(emptyIntakeMemory, 'annual_gross_income_chf', unclear), 'annual_gross_income_chf', unclear);
    expect(row(intakeRows(caseWith(), PERSON, memory), 'annual_gross_income_chf').status).toBe('skipped');
  });

  it('an answer to a different field does not punish the asked field', () => {
    const memory = afterCustomerTurn(emptyIntakeMemory, 'annual_gross_income_chf', exact('risk_appetite'));
    expect(memory.attempts).toEqual({});
  });

  it('steers the agent with captured fields and exactly one next question, then ends', () => {
    const open = steeringContext(intakeRows(caseWith(batch('proposed', [{ path: income, personId: PERSON, value: 1 }])), PERSON, emptyIntakeMemory), id => `Frage ${id}`);
    expect(open).toMatchObject({ done: false, nextQuestion: 'Frage employment_rate_percent', neverAskAgain: ['annual_gross_income_chf'] });
    const allSkipped = { attempts: Object.fromEntries(INTAKE_FIELDS.map(id => [id, 2])), clarifications: {} };
    const done = steeringContext(intakeRows(caseWith(), PERSON, allSkipped), id => id);
    expect(done).toMatchObject({ done: true, nextQuestion: null });
    expect(nextIntakeField(intakeRows(caseWith(), PERSON, allSkipped))).toBeNull();
  });

  it('asks the short clarification instead of the field question while a field is unclear', () => {
    const memory = afterCustomerTurn(emptyIntakeMemory, 'annual_gross_income_chf', { clarifications: [{ fieldId: 'annual_gross_income_chf', quote: 'x', value: '1', code: 'AMBIGUOUS_VALUE' }] });
    const rows = intakeRows(caseWith(), PERSON, memory);
    expect(steeringContext(rows, id => `Frage ${id}`, 'Brutto und pro Jahr?')).toMatchObject({ nextQuestion: 'Brutto und pro Jahr?' });
    expect(steeringContext(intakeRows(caseWith(), PERSON, emptyIntakeMemory), id => `Frage ${id}`, 'Brutto und pro Jahr?')).toMatchObject({ nextQuestion: 'Frage annual_gross_income_chf' });
  });
});
