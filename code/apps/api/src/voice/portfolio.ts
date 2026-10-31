import { PortfolioFieldIdSchema, type PortfolioFieldId, type VoiceObservation, type VoiceMappingIssue, type ProposalChangeInput, type InsuranceDraft } from '@pax/contracts';
import { DateOnly, Cents } from '@pax/contracts';
import { at } from '../insurance/draft-proposals.js';
import { questionText } from '../insurance/i18n.js';
import type { Locale } from '../insurance/i18n.js';
import { WorkflowError } from '../insurance/types.js';
const direct = new Set<PortfolioFieldId>(['birth_date', 'sex', 'civil_status', 'relationship_since_year', 'partner_birth_year', 'partner_annual_gross_income_chf', 'employment_rate_percent', 'annual_gross_income_chf', 'has_pension_fund', 'pillar_3a_annual_contribution_chf', 'monthly_housing_cost_chf', 'desired_retirement_age', 'risk_appetite']);
const excluded = new Set<PortfolioFieldId>(['full_name', 'smoker']);
const human = new Set<PortfolioFieldId>(['net_income_band', 'net_worth_band', 'annual_saving_capacity_band', 'one_time_investment_band', 'investment_goal', 'investment_horizon', 'securities_experience', 'reaction_to_30_percent_loss']);
export const portfolioCatalog = () => PortfolioFieldIdSchema.options.map(fieldId => ({ fieldId, handling: direct.has(fieldId) ? 'proposal' : excluded.has(fieldId) ? 'not_collected' : human.has(fieldId) ? 'human_review' : fieldId === 'postal_code' ? 'location_lookup' : 'structured_input',
    ...(fieldId === 'pillar_3a_annual_contribution_chf' ? { target: 'insurance.existingAnnualPillar3aContributionCents', additionalSavingMutated: false } : {}),
    ...(fieldId === 'annual_gross_income_chf' || fieldId === 'partner_annual_gross_income_chf' ? { target: 'insurance.persons[personId].grossAnnualIncomeCents', unit: 'CHF_CENTS', period: 'year', basis: 'gross', budgetNetMutated: false } : {}),
}));
/** Decimal conversion at the server boundary, without floating-point multiplication. */
export function chfToCents(value: VoiceObservation['value']) {
    if (typeof value !== 'string' && typeof value !== 'number')
        throw new WorkflowError('VOICE_INVALID_MONEY', 422);
    const text = String(value).replace(/^CHF\s*/i, '').replace(/['’\s]/g, '');
    const m = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!m)
        throw new WorkflowError('VOICE_INVALID_MONEY', 422);
    const cents = BigInt(m[1]!) * 100n + BigInt((m[2] ?? '').padEnd(2, '0'));
    if (cents > 1000000000000n)
        throw new WorkflowError('VOICE_INVALID_MONEY', 422);
    return Cents.parse(Number(cents));
}
function target(d: InsuranceDraft, o: VoiceObservation) {
    const id = o.personId, pi = d.financial?.persons.findIndex(p => p.id === id) ?? -1, ii = d.insurance?.persons.findIndex(p => p.personId === id) ?? -1;
    const person = (base: 'financial' | 'insurance', field: string) => { const index = base === 'financial' ? pi : ii; if (!id || index < 0)
        throw new WorkflowError('PERSON_REFERENCE_MISMATCH', 422); return { path: `${base}.persons.${index}.${field}`, personId: id }; };
    switch (o.fieldId) {
        case 'annual_gross_income_chf':
        case 'partner_annual_gross_income_chf': return person('insurance', 'grossAnnualIncomeCents');
        case 'birth_date':
        case 'partner_birth_year': return person('financial', 'birthYear');
        case 'sex': return person('insurance', 'providerSex');
        case 'employment_rate_percent': return person('financial', 'employmentRateBps');
        case 'has_pension_fund': return person('insurance', 'withPillar2');
        case 'desired_retirement_age': return person('insurance', 'desiredWorkStopAge');
        case 'civil_status': return { path: 'insurance.relationship' };
        case 'relationship_since_year': return { path: 'insurance.relationshipSinceYear' };
        case 'pillar_3a_annual_contribution_chf': return { path: 'insurance.existingAnnualPillar3aContributionCents' };
        case 'risk_appetite': return { path: 'insurance.riskAppetite' };
        case 'monthly_housing_cost_chf': {
            const homes = d.financial?.expenses.flatMap((e, i) => e.category === 'housing' ? [i] : []) ?? [];
            if (homes.length !== 1)
                return null;
            return { path: `financial.expenses.${homes[0]}.amount.value` };
        }
        default: return null;
    }
}
export function mapVoiceObservations(draft: InsuranceDraft, observations: VoiceObservation[], locale: Locale) {
    const changes: ProposalChangeInput[] = [], issues: VoiceMappingIssue[] = [], questions: {
        path: string;
        personId?: string;
        question: string;
        sourceMessageId: string;
    }[] = [];
    for (const o of observations) {
        const issue = (code: VoiceMappingIssue['code']) => issues.push({ fieldId: o.fieldId, code, requiresFollowUp: true });
        if (excluded.has(o.fieldId)) {
            issue('NOT_COLLECTED_FOR_DEMO');
            continue;
        }
        if (human.has(o.fieldId)) {
            issue('HUMAN_REVIEW_REQUIRED');
            continue;
        }
        if (o.fieldId === 'postal_code') {
            issue('LOOKUP_REQUIRED');
            continue;
        }
        if (!direct.has(o.fieldId)) {
            issue('STRUCTURED_INPUT_REQUIRED');
            continue;
        }
        const t = target(draft, o);
        if (!t || at(draft, t.path) === undefined) {
            issue('TARGET_MISSING');
            continue;
        }
        const unclear = () => { issue('AMBIGUOUS_VALUE'); questions.push({ ...t, question: questionText(locale, t.path), sourceMessageId: o.sourceMessageId }); };
        if (o.precision !== 'exact' || o.value === null) {
            unclear();
            continue;
        }
        let value: ProposalChangeInput['value'];
        if (['annual_gross_income_chf', 'partner_annual_gross_income_chf', 'pillar_3a_annual_contribution_chf', 'monthly_housing_cost_chf'].includes(o.fieldId)) {
            const period = o.fieldId === 'monthly_housing_cost_chf' ? 'month' : 'year', basis = o.fieldId.includes('gross') ? 'gross' : 'not_applicable';
            if (o.unit !== 'CHF' || o.period !== period || o.basis !== basis) {
                unclear();
                continue;
            }
            value = chfToCents(o.value);
        }
        else
            switch (o.fieldId) {
                case 'birth_date':
                    if (o.unit !== 'text')
                        throw new WorkflowError('VOICE_UNIT_MISMATCH', 422);
                    value = Number(DateOnly.parse(o.value).slice(0, 4));
                    break;
                case 'partner_birth_year':
                case 'relationship_since_year':
                case 'desired_retirement_age':
                    if (o.unit !== 'year' || typeof o.value !== 'number' || !Number.isInteger(o.value))
                        throw new WorkflowError('VOICE_UNIT_MISMATCH', 422);
                    value = o.value;
                    break;
                case 'employment_rate_percent':
                    if (o.unit !== 'percent' || typeof o.value !== 'number' || o.value < 0 || o.value > 100)
                        throw new WorkflowError('VOICE_UNIT_MISMATCH', 422);
                    value = chfToCents(o.value);
                    break;
                case 'has_pension_fund':
                    if (o.unit !== 'boolean' || typeof o.value !== 'boolean')
                        throw new WorkflowError('VOICE_UNIT_MISMATCH', 422);
                    value = o.value;
                    break;
                case 'sex':
                    if (o.unit !== 'enum' || !['male', 'female'].includes(String(o.value)))
                        throw new WorkflowError('VOICE_ENUM_INVALID', 422);
                    value = o.value === 'male' ? 1 : 2;
                    break;
                case 'civil_status':
                    if (o.unit !== 'enum')
                        throw new WorkflowError('VOICE_UNIT_MISMATCH', 422);
                    if (['divorced', 'widowed'].includes(String(o.value))) {
                        unclear();
                        continue;
                    }
                    if (!['single', 'married', 'cohabiting', 'registered_partnership'].includes(String(o.value)))
                        throw new WorkflowError('VOICE_ENUM_INVALID', 422);
                    value = o.value;
                    break;
                case 'risk_appetite':
                    if (o.unit !== 'enum' || !['low', 'medium', 'high'].includes(String(o.value)))
                        throw new WorkflowError('VOICE_ENUM_INVALID', 422);
                    value = o.value;
                    break;
                default:
                    issue('STRUCTURED_INPUT_REQUIRED');
                    continue;
            }
        changes.push({ ...t, value });
        if (o.fieldId === 'monthly_housing_cost_chf')
            changes.push({ path: t.path.replace(/\.value$/, '.period'), value: 'month' });
    }
    return { changes, issues, questions };
}
