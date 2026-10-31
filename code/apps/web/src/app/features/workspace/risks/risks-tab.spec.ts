import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdvisorDataSource } from '../../../core/advisor/advisor-data-source';
import { CaseStore } from '../../../core/advisor/store/case-store';
import {
  FakeDataSource,
  event,
  impactChart,
  risk,
  snapshot,
} from '../../../core/advisor/store/case-testing';
import { ChartResult, RiskItem } from '../../../core/advisor/ui-models';
import { Consent } from '../../../core/consent/consent';
import { provideI18nTesting } from '../../../core/i18n/i18n-testing';
import { ChartJump } from '../../../core/layout/chart-jump';
import { RISK_UPDATED_MS, RisksTab } from './risks-tab';

/** Nests the tab below an OnPush parent like the shell does. */
@Component({
  imports: [RisksTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-risks-tab />`,
})
class Shell {}

const GAP = { currency: 'CHF', unit: 'cent', period: 'month', basis: 'gross' } as const;

describe('RisksTab', () => {
  let source: FakeDataSource;
  let jump: { show: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<Shell>;
  let root: HTMLElement;

  async function start(
    initial: { risks?: readonly RiskItem[]; charts?: readonly ChartResult[] } = {},
  ) {
    source = new FakeDataSource();
    source.nextSnapshot = of(
      snapshot({ risks: initial.risks ?? [], charts: initial.charts ?? [] }),
    );
    jump = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: AdvisorDataSource, useValue: source },
        { provide: ChartJump, useValue: jump },
      ],
    });
    sessionStorage.clear();
    TestBed.inject(Consent).grant();
    TestBed.inject(CaseStore).connect();
    fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  }

  async function emit(...risks: RiskItem[]) {
    source.emit(...risks.map((r) => event('risk', r)));
    await fixture.whenStable();
  }

  async function expand(riskId: string) {
    row(riskId)?.querySelector<HTMLButtonElement>('.toggle')?.click();
    await fixture.whenStable();
  }

  afterEach(() => vi.useRealTimers());

  const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
  const row = (riskId: string) =>
    root.querySelector<HTMLElement>(`app-risk-row[data-risk-id="${riskId}"]`);
  const ids = (section: string) =>
    [
      ...root.querySelectorAll<HTMLElement>(`section[aria-labelledby="${section}"] app-risk-row`),
    ].map((el) => el.dataset['riskId']);
  const live = () => squash(root.querySelector('[aria-live]')?.textContent);
  /** What a sighted user reads: the text without the screen-reader-only parts. */
  const visible = (el: Element | null | undefined) => {
    const copy = el?.cloneNode(true) as HTMLElement | undefined;
    copy?.querySelectorAll('.visually-hidden').forEach((hidden) => hidden.remove());
    return squash(copy?.textContent);
  };

  it('says that risks appear during the conversation while there is none', async () => {
    await start();
    expect(root.querySelector('.empty')?.textContent).toContain('Sobald im Gespräch ein Risiko');
    expect(root.querySelector('section')).toBeNull();
  });

  it('shows one quiet row: severity as a level meter, title and gap', async () => {
    await start({
      risks: [
        risk({
          severity: 'high',
          status: 'identified',
          title: 'Vorsorgelücke im Alter',
          amount: { ...GAP, amount: 272_000 },
          resultStatus: 'valid',
        }),
      ],
    });
    const toggle = row('risk_a')?.querySelector('.toggle');
    const severity = toggle?.querySelector('.severity');

    expect(visible(severity)).toBe('');
    expect(severity?.getAttribute('title')).toBe('Hohes Risiko');
    expect(squash(toggle?.querySelector('.title')?.textContent)).toBe('Vorsorgelücke im Alter');
    expect(visible(toggle?.querySelector('.summary'))).toBe("CHF 2'720 pro Monat");
    // Screen readers hear the severity before the title.
    expect(squash(toggle?.textContent)).toMatch(/^Hohes Risiko: Vorsorgelücke im Alter/);
  });

  it('fills one bar per severity level, so the level does not rely on colour', async () => {
    await start({
      risks: [
        risk({ riskId: 'risk_high', severity: 'high' }),
        risk({ riskId: 'risk_medium', severity: 'medium' }),
        risk({ riskId: 'risk_low', severity: 'low' }),
      ],
    });
    const filled = (riskId: string) => [
      row(riskId)?.querySelectorAll('.meter rect').length,
      row(riskId)?.querySelectorAll('.meter rect.filled').length,
    ];

    expect(filled('risk_high')).toEqual([3, 3]);
    expect(filled('risk_medium')).toEqual([3, 2]);
    expect(filled('risk_low')).toEqual([3, 1]);
  });

  it('keeps explanation, pillars and the chart link behind the row until it is opened', async () => {
    await start({
      charts: [impactChart()],
      risks: [
        risk({
          pillars: ['pillar1', 'pillar2'],
          explanation: 'Es bleibt eine Lücke.',
          relatedChartId: 'chart_impact',
        }),
      ],
    });
    const toggle = row('risk_a')?.querySelector('.toggle') as HTMLButtonElement;
    const panel = root.querySelector(`#${toggle.getAttribute('aria-controls')}`) as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);

    await expand('risk_a');

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(squash(panel.querySelector('.explanation')?.textContent)).toBe('Es bleibt eine Lücke.');
    expect(squash(panel.querySelector('.pillars')?.textContent)).toBe(
      'Betroffene Säulen: 1. Säule (AHV/IV) · 2. Säule (Pensionskasse)',
    );
    expect(squash(panel.querySelector('.jump')?.textContent)).toBe('In Grafiken zeigen');
  });

  it('marks an estimated gap with ≈ and explains the sign below the list', async () => {
    await start({
      risks: [risk({ amount: { ...GAP, amount: 21_000 }, resultStatus: 'estimated' })],
    });
    const summary = row('risk_a')?.querySelector('.summary');

    expect(visible(summary)).toBe('≈ CHF 210 pro Monat');
    expect(squash(summary?.textContent)).toContain('Geschätzt:');
    expect(squash(root.querySelector('.footnote')?.textContent)).toBe('≈ geschätzt');
  });

  it('says what is missing instead of a number while a gap is not quantified', async () => {
    await start({
      risks: [
        risk({ riskId: 'risk_data', status: 'needs_data', amount: null }),
        risk({
          riskId: 'risk_review',
          status: 'identified',
          amount: null,
          resultStatus: 'requires_review',
        }),
      ],
    });

    expect(visible(row('risk_data')?.querySelector('.summary'))).toBe('Daten fehlen');
    expect(visible(row('risk_review')?.querySelector('.summary'))).toBe('Wird geprüft');
    expect(root.querySelector('.amount')).toBeNull();
    expect(root.querySelector('.footnote')).toBeNull();
  });

  it('lists open risks by severity and addressed risks in their own section', async () => {
    await start({
      risks: [
        risk({ riskId: 'risk_low', severity: 'low', status: 'identified' }),
        risk({ riskId: 'risk_done', severity: 'high', status: 'addressed' }),
        risk({ riskId: 'risk_high', severity: 'high', status: 'needs_data' }),
        risk({ riskId: 'risk_medium_1', severity: 'medium', status: 'identified' }),
        risk({ riskId: 'risk_medium_2', severity: 'medium', status: 'needs_data' }),
      ],
    });

    expect(ids('risks-open')).toEqual(['risk_high', 'risk_medium_1', 'risk_medium_2', 'risk_low']);
    expect(ids('risks-addressed')).toEqual(['risk_done']);
    expect(squash(root.querySelector('#risks-addressed')?.textContent)).toBe('Abgedeckt');
  });

  it('shows an addressed risk with a check and its title only', async () => {
    await start({
      risks: [risk({ status: 'addressed', title: 'Todesfall', amount: { ...GAP, amount: 0 } })],
    });
    const toggle = row('risk_a')?.querySelector('.toggle');

    expect(toggle?.querySelector('.severity[data-severity="addressed"] svg')).not.toBeNull();
    expect(visible(toggle)).toBe('Todesfall');
    expect(toggle?.querySelector('.summary')).toBeNull();
  });

  it('adds a new risk live and announces it, but not the risks of the first snapshot', async () => {
    await start({ risks: [risk({ riskId: 'risk_known', title: 'Bekannt' })] });
    expect(live()).toBe('');

    await emit(risk({ riskId: 'risk_new', title: 'Todesfall' }));

    expect(row('risk_new')).not.toBeNull();
    expect(live()).toBe('Neues Risiko: Todesfall');
    expect(root.querySelector('.empty')).toBeNull();
  });

  it('tints a changed risk for a moment and moves it when it is addressed', async () => {
    await start({ risks: [risk({ status: 'identified', title: 'Todesfall' })] });
    vi.useFakeTimers();

    source.emit(
      event('risk', risk({ status: 'addressed', title: 'Todesfall', profileVersion: 2 })),
    );
    fixture.detectChanges();

    expect(ids('risks-open')).toEqual([]);
    expect(ids('risks-addressed')).toEqual(['risk_a']);
    expect(row('risk_a')?.classList).toContain('updated');
    expect(live()).toBe('Risiko aktualisiert: Todesfall');

    vi.advanceTimersByTime(RISK_UPDATED_MS);
    fixture.detectChanges();
    expect(row('risk_a')?.classList).not.toContain('updated');
  });

  it('does not mark a risk as updated when only its texts change, e.g. a new language', async () => {
    await start({ risks: [risk({ title: 'Todesfall' })] });

    await emit(risk({ title: 'Death', explanation: 'Translated', profileVersion: 2 }));

    expect(row('risk_a')?.classList).not.toContain('updated');
    expect(live()).toBe('');
  });

  it('offers "Show in Graphics" only once the related chart is in the feed', async () => {
    await start({ risks: [risk({ relatedChartId: 'chart_impact' })] });
    await expand('risk_a');
    const button = () => row('risk_a')?.querySelector<HTMLButtonElement>('.jump');
    expect(button()).toBeNull();

    source.emit(event('chart', impactChart()));
    await fixture.whenStable();

    expect(button()).not.toBeNull();
    // Several rows have the same button; the risk title tells them apart.
    const describedBy = button()?.getAttribute('aria-describedby');
    expect(root.querySelector(`#${describedBy}`)?.textContent).toBe('Risk');
  });

  it('opens the related chart with the scenario that matches the risk', async () => {
    await start({
      charts: [impactChart()],
      risks: [
        risk({ riskId: 'risk_death', category: 'death', relatedChartId: 'chart_impact' }),
        risk({ riskId: 'risk_home', category: 'home_purchase', relatedChartId: 'chart_impact' }),
      ],
    });
    await expand('risk_death');
    await expand('risk_home');

    row('risk_death')?.querySelector<HTMLButtonElement>('.jump')?.click();
    row('risk_home')?.querySelector<HTMLButtonElement>('.jump')?.click();

    expect(jump.show).toHaveBeenNthCalledWith(1, { chartId: 'chart_impact', event: 'death' });
    expect(jump.show).toHaveBeenNthCalledWith(2, { chartId: 'chart_impact', event: undefined });
  });
});
