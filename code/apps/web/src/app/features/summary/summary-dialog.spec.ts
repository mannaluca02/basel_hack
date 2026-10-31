import { TestBed } from '@angular/core/testing';
import { AdvisorDataSource } from '../../core/advisor/advisor-data-source';
import { SummaryBundle } from '../../core/advisor/contracts';
import { CaseStore } from '../../core/advisor/store/case-store';
import { FakeDataSource, event } from '../../core/advisor/store/case-testing';
import { Consent } from '../../core/consent/consent';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { SummarySheet } from '../../core/layout/summary-sheet';
import { SummaryDialog } from './summary-dialog';

const money = (amount: number) =>
  ({ currency: 'CHF', unit: 'cent', period: 'year', basis: 'net_after_income_tax', amount }) as const;

function bundle(overrides: Partial<SummaryBundle> = {}): SummaryBundle {
  return {
    schemaVersion: '1.0',
    messageId: 'summary_1',
    caseId: 'case_test',
    correlationId: 'corr_1',
    snapshotId: 'snapshot_1',
    profileVersion: 1,
    scenarioVersionId: 'baseline',
    runRefs: ['run_1'],
    audiences: ['customer', 'advisor'],
    status: 'draft',
    reviewOpen: true,
    keyFacts: [{ factId: 'incomeAnnual', label: 'Jährliches Einkommen', value: money(8_000_000) }],
    goals: [{ id: 'goal_home', text: 'Eigenheim bis 2031' }],
    pillars: {
      pillar1: { status: 'estimated', text: 'AHV', retirementIncome: money(2_820_000) },
      pillar2: { status: 'estimated', text: 'PK', retirementIncome: null },
      pillar3: { status: 'needs_input', text: 'privat', retirementIncome: null },
    },
    gaps: [{ gapId: 'gap_1', label: 'Erwerbsunfähigkeit', amount: money(2_200_000), status: 'estimated' }],
    openQuestions: [],
    nextSteps: [{ id: 'expert_review', text: 'Prüfung durch Pax' }],
    productGate: { needsCaptured: true, financesCaptured: true, allPillarsCaptured: true, suitabilityCheckDone: false },
    products: [
      { candidateId: 'c1', productId: 'pax_disability', name: 'Pax Erwerbsunfähigkeitsschutz', need: money(2_200_000), unitLinked: false },
      { candidateId: 'c2', productId: 'pax_fondsstar', name: 'Pax FondsStar', need: money(300_000), unitLinked: true },
    ],
    ...overrides,
  };
}

describe('SummaryDialog', () => {
  let source: FakeDataSource;

  beforeAll(() => {
    // jsdom has no modal dialogs; the browser behaviour (focus trap, Esc) is native.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  });

  function render(summary: SummaryBundle | null) {
    source = new FakeDataSource();
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: AdvisorDataSource, useValue: source }],
    });
    sessionStorage.clear();
    TestBed.inject(Consent).grant();
    TestBed.inject(CaseStore).connect();
    if (summary) source.emit(event('summary', summary));
    const fixture = TestBed.createComponent(SummaryDialog);
    fixture.detectChanges();
    TestBed.inject(SummarySheet).open();
    fixture.detectChanges();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    return { fixture, dialog };
  }

  it('opens as a modal from the summary state and closes with its button', () => {
    const { fixture, dialog } = render(bundle());
    expect(dialog.open).toBe(true);
    dialog.querySelector<HTMLButtonElement>('.close')!.click();
    fixture.detectChanges();
    expect(TestBed.inject(SummarySheet).isOpen()).toBe(false);
    expect(dialog.open).toBe(false);
  });

  it('shows all three pillars, the gaps and the products once the gate is open', () => {
    const { dialog } = render(bundle());
    expect(dialog.querySelectorAll('.pillars li')).toHaveLength(3);
    expect(dialog.textContent).toContain('Erwerbsunfähigkeit');
    expect(dialog.querySelectorAll('.products li')).toHaveLength(2);
  });

  it('marks a unit-linked product until the suitability check is done', () => {
    const open = render(bundle()).dialog.querySelectorAll('.products li');
    expect(open[0]!.querySelector('.badge')).toBeNull();
    expect(open[1]!.querySelector('.badge')).not.toBeNull();
  });

  it('keeps the products locked while needs, finances or a pillar are missing', () => {
    const gate = { needsCaptured: true, financesCaptured: true, allPillarsCaptured: false, suitabilityCheckDone: false };
    const { dialog } = render(bundle({ productGate: gate }));
    expect(dialog.querySelector('.products .locked')).not.toBeNull();
    expect(dialog.querySelectorAll('.products li')).toHaveLength(0);
  });

  it('says that the summary is still empty before the advisor sends one', () => {
    const { dialog } = render(null);
    expect(dialog.querySelector('.empty')).not.toBeNull();
    expect(dialog.querySelector('app-human-advisor-status')).not.toBeNull();
  });
});
