import { z } from 'zod';

export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
export const MetricId = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
export const Cents = z.number().int().min(0).max(1_000_000_000_000);
export const StatusSchema = z.enum(['valid', 'estimated', 'requires_review', 'needs_input', 'provider_error', 'unsupported', 'stale']);
export type Status = z.infer<typeof StatusSchema>;
export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
}, 'Invalid calendar date');

export const AmountFieldSchema = z.object({
  value: Cents.nullable(), currency: z.literal('CHF'), unit: z.literal('cent'),
  period: z.enum(['month','year','once']),
  origin: z.enum(['user','document','api','estimate','synthetic']),
  confirmation: z.enum(['proposed','confirmed']),
  review: z.enum(['unreviewed','reviewed','rejected']),
  sourceRef: z.string().min(1).max(240)
}).strict();
export type AmountField = z.infer<typeof AmountFieldSchema>;
const FlowField = AmountFieldSchema.refine(a => a.period !== 'once', 'A cashflow needs a month/year period');
const CapitalField = AmountFieldSchema.refine(a => a.period === 'once', 'Capital must use period once');
const PersonSchema = z.object({
  id: Id, birthYear: z.number().int().min(1900).max(2100),
  employmentRateBps: z.number().int().min(0).max(10_000),
  income: FlowField,
  incomeBasis: z.enum(['gross','net_before_income_tax','net_after_income_tax'])
}).strict();
export const ExpenseSchema = z.object({
  id: Id,
  category: z.enum(['housing','living','tax','provision','debt','reserve','other']),
  amount: FlowField,
  includedInExpenseId: Id.optional()
}).strict();
export const AssetSchema = z.object({
  id: Id, amount: CapitalField,
  liquidity: z.enum(['free','restricted']), availableFrom: DateOnly,
  pillar: z.enum(['none','2','3']),
  allocations: z.array(z.object({goalId: Id, amountCents: Cents}).strict()).max(30)
}).strict();
const ProvisionSchema = z.object({
  id: Id, personId: Id, pillar: z.enum(['1','2','3']),
  event: z.enum(['retirement','disability_illness','disability_accident','death_illness','death_accident']),
  amount: FlowField
}).strict();
export const CaseSnapshotSchema = z.object({
  schemaVersion: z.literal('1.0'), caseId: Id,
  caseRevision: z.number().int().positive(), profileVersion: z.number().int().positive(),
  dataClassification: z.enum(['synthetic','customer']), valuationDate: DateOnly,
  priceBasis: z.literal('nominal'),
  persons: z.array(PersonSchema).min(1).max(2),
  expenses: z.array(ExpenseSchema).max(80),
  safetyBuffer: FlowField,
  assets: z.array(AssetSchema).max(40), assetsConfirmed: z.boolean(),
  provisions: z.array(ProvisionSchema).max(100)
}).strict().superRefine((c,ctx) => {
  for (const key of ['persons','expenses','assets','provisions'] as const) {
    const ids = c[key].map(x=>x.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({code:'custom',path:[key],message:'Duplicate IDs'});
  }
  for (const [i,p] of c.persons.entries()) if (p.birthYear > Number(c.valuationDate.slice(0,4)))
    ctx.addIssue({code:'custom',path:['persons',i,'birthYear'],message:'Birth year is after valuation date'});
  const persons = new Set(c.persons.map(p=>p.id));
  for (const [i,p] of c.provisions.entries()) if (!persons.has(p.personId))
    ctx.addIssue({code:'custom',path:['provisions',i,'personId'],message:'Unknown person'});
  const expenses = new Map(c.expenses.map(e=>[e.id,e]));
  for (const [i,e] of c.expenses.entries()) {
    const visited = new Set([e.id]); let parent=e.includedInExpenseId;
    while (parent) {
      if (visited.has(parent) || !expenses.has(parent)) {
        ctx.addIssue({code:'custom',path:['expenses',i,'includedInExpenseId'],message:'Missing or cyclic expense parent'});break;
      }
      visited.add(parent);parent=expenses.get(parent)?.includedInExpenseId;
    }
  }
});
export type CaseSnapshot = z.infer<typeof CaseSnapshotSchema>;

export const GraphContextSchema = z.object({
  caseId: Id, profileVersion: z.number().int().positive(), scenarioVersionId: Id,
  runId: Id, graphId: Id, metricId: MetricId, personId: Id.optional(),
  periodStart: Month, periodEnd: Month
}).strict().refine(c=>c.periodStart<=c.periodEnd, 'End precedes start');
export type GraphContext = z.infer<typeof GraphContextSchema>;
export const ScenarioSchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('baseline')}).strict(),
  z.object({kind:z.literal('family'),personId:Id,newEmploymentRateBps:z.number().int().min(0).max(10000),
    additionalMonthlyCostCents:Cents,linearIncomeAssumptionConfirmed:z.literal(true)}).strict(),
  z.object({kind:z.literal('home'),purchasePriceCents:Cents,equityRateBps:z.number().int().min(0).max(10000),
    purchaseCostsCents:Cents,reserveCents:Cents,annualInterestBps:z.number().int().min(0).max(2000),
    annualMaintenanceBps:z.number().int().min(0).max(2000),annualAmortizationCents:Cents,
    assumptionsConfirmed:z.literal(true)}).strict()
]);
export type Scenario = z.infer<typeof ScenarioSchema>;
export const AnalysisRequestSchema = z.object({
  schemaVersion:z.literal('1.0'),messageId:Id,caseId:Id,correlationId:Id,
  profileVersion:z.number().int().positive(),scenarioVersionId:Id,
  calculationInputHash:z.string().regex(/^[a-f0-9]{64}$/),
  requestedAreas:z.array(z.enum(['budget','capital','pillars'])).min(1).max(3),
  executionMode:z.literal('local'),snapshot:CaseSnapshotSchema,scenario:ScenarioSchema
}).strict().refine(r=>r.caseId===r.snapshot.caseId && r.profileVersion===r.snapshot.profileVersion,'Snapshot reference mismatch');
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type Issue = {code:string;path:string;message:string};
export type MoneyMetric = {value:number|null;currency:'CHF';unit:'cent';period:'month'|'year'|'once'};
export type ProgressSnapshot = {
  domain:'data_capture';percent:number;reviewOpen:boolean;
  groups:{id:string;complete:boolean;missing:string[]}[];
};
export function money(value:number|null,period:MoneyMetric['period']):MoneyMetric {
  if (value!==null && !Number.isSafeInteger(value)) throw new RangeError('Money must be safe integer cents');
  return {value,currency:'CHF',unit:'cent',period};
}

export const IssueSchema = z.object({code:z.string(),path:z.string(),message:z.string()}).strict();
export const MetricSchema = z.object({
  id:MetricId, value:z.number().int().safe().nullable(),currency:z.literal('CHF'),unit:z.literal('cent'),
  period:z.enum(['month','year','once']),status:StatusSchema,personId:Id.optional(),
  sourceRefs:z.array(z.string()).max(120)
}).strict();
export const ProgressSchema = z.object({
  domain:z.literal('data_capture'),percent:z.number().int().min(0).max(100),reviewOpen:z.boolean(),
  groups:z.array(z.object({id:Id,complete:z.boolean(),missing:z.array(z.string())}).strict())
}).strict();
export const AnalysisResultSchema = z.object({
  schemaVersion:z.literal('1.0'),messageId:Id,caseId:Id,correlationId:Id,
  profileVersion:z.number().int().positive(),scenarioVersionId:Id,runId:Id,
  calculationInputHash:z.string().regex(/^[a-f0-9]{64}$/),modelVersion:z.string(),
  createdAt:z.iso.datetime(),dataClassification:z.enum(['synthetic','customer']),
  valuationDate:DateOnly,priceBasis:z.literal('nominal'),
  periodStart:Month,periodEnd:Month,
  statusByArea:z.object({budget:StatusSchema.optional(),capital:StatusSchema.optional(),pillars:StatusSchema.optional()}).strict(),
  metrics:z.array(MetricSchema),issues:z.array(IssueSchema),assumptions:z.array(z.string()),
  capitalBreakdown:z.array(z.object({assetId:Id,totalCents:Cents.nullable(),allocatedCents:z.number().int().safe().nonnegative(),
    freeCents:Cents.nullable(),excludedReason:z.enum(['restricted','not_available_yet']).nullable(),
    allocations:z.array(z.object({goalId:Id,amountCents:Cents}).strict())}).strict()),
  progress:ProgressSchema
}).strict();
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
