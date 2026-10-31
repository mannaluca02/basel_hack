import type { IntakeFieldId } from './intake-plan';

/** Label and question per conversation field. Full literal keys: check:i18n cannot see computed ones. */
export const INTAKE_TEXT: Readonly<Record<IntakeFieldId, { label: string; question: string }>> = {
  annual_gross_income_chf: { label: 'lab.intake.field.annual_gross_income_chf', question: 'lab.intake.question.annual_gross_income_chf' },
  employment_rate_percent: { label: 'lab.intake.field.employment_rate_percent', question: 'lab.intake.question.employment_rate_percent' },
  civil_status: { label: 'lab.intake.field.civil_status', question: 'lab.intake.question.civil_status' },
  has_pension_fund: { label: 'lab.intake.field.has_pension_fund', question: 'lab.intake.question.has_pension_fund' },
  pillar_3a_annual_contribution_chf: { label: 'lab.intake.field.pillar_3a_annual_contribution_chf', question: 'lab.intake.question.pillar_3a_annual_contribution_chf' },
  monthly_housing_cost_chf: { label: 'lab.intake.field.monthly_housing_cost_chf', question: 'lab.intake.question.monthly_housing_cost_chf' },
  desired_retirement_age: { label: 'lab.intake.field.desired_retirement_age', question: 'lab.intake.question.desired_retirement_age' },
  risk_appetite: { label: 'lab.intake.field.risk_appetite', question: 'lab.intake.question.risk_appetite' },
};
