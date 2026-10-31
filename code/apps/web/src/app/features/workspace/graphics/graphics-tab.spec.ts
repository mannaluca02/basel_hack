import { ApplicationRef, ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdvisorDataSource } from '../../../core/advisor/advisor-data-source';
import { CaseStore } from '../../../core/advisor/store/case-store';
import {
  FakeDataSource,
  chart,
  event,
  impactChart,
  incomeChart,
  info,
  pillar3aChart,
  snapshot,
} from '../../../core/advisor/store/case-testing';
import { ChartResult } from '../../../core/advisor/ui-models';
import { Consent } from '../../../core/consent/consent';
import { provideI18nTesting } from '../../../core/i18n/i18n-testing';
import { ChartJump, ChartTarget } from '../../../core/layout/chart-jump';
import { InfoJump } from '../../../core/layout/info-jump';
import { ViewScroller } from '../../../core/layout/view-scroller';
import { stubChartCanvas } from './graphics-testing';
import { GraphicsTab } from './graphics-tab';

/** The Dynamic View, driven by hand: where the user is reading, and whether a tab switch runs. */
class FakeScroller {
  readonly atBottom = signal(true);
  readonly settled = signal(true);
  /** What `measure()` reports for the position before a new card renders. */
  nearBottom = true;
  readonly measure = vi.fn(() => this.nearBottom);
  readonly scrollToEnd = vi.fn();
  readonly reveal = vi.fn();
}

/** "Show in Graphics" from another tab, without the router. */
class FakeJump {
  readonly target = signal<ChartTarget | null>(null);
  readonly pending = this.target.asReadonly();
  take(): ChartTarget | null {
    const target = this.target();
    this.target.set(null);
    return target;
  }
}

/**
 * Nests the tab below an OnPush parent like the shell does. As the fixture's root component the
 * tab would be refreshed more eagerly than in the app, which once hid a late auto-follow.
 */
@Component({
  imports: [GraphicsTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-graphics-tab />`,
})
class Shell {}

describe('GraphicsTab', () => {
  let source: FakeDataSource;
  let scroller: FakeScroller;
  let jump: FakeJump;
  let infoJump: { show: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<Shell>;
  let root: HTMLElement;

  async function start(initialCharts: readonly ChartResult[] = []) {
    source = new FakeDataSource();
    source.nextSnapshot = of(snapshot({ charts: initialCharts }));
    scroller = new FakeScroller();
    jump = new FakeJump();
    infoJump = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: AdvisorDataSource, useValue: source },
        { provide: ViewScroller, useValue: scroller },
        { provide: ChartJump, useValue: jump },
        { provide: InfoJump, useValue: infoJump },
      ],
    });
    stubChartCanvas();
    sessionStorage.clear();
    TestBed.inject(Consent).grant();
    TestBed.inject(CaseStore).connect();
    fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  }

  async function emit(...charts: ChartResult[]) {
    source.emit(...charts.map((c) => event('chart', c)));
    await fixture.whenStable();
  }

  const cards = () => [...root.querySelectorAll<HTMLElement>('app-chart-card')];
  const ids = () => cards().map((card) => card.dataset['chartId']);
  const pill = () => root.querySelector<HTMLButtonElement>('.pill');
  const live = () => root.querySelector('[aria-live]')?.textContent?.trim();

  it('scrolls to the card another tab points to once the tab is settled, and focuses it', async () => {
    await start([incomeChart(), pillar3aChart()]);
    scroller.settled.set(false);
    jump.target.set({ chartId: 'chart_3a' });
    await fixture.whenStable();
    expect(scroller.reveal).not.toHaveBeenCalled();

    scroller.settled.set(true);
    await fixture.whenStable();

    const target = cards()[1];
    const article = target.querySelector('article');
    expect(scroller.reveal).toHaveBeenCalledWith(target, expect.any(Boolean));
    expect(document.activeElement).toBe(article);
    expect(article?.classList).toContain('targeted');
    expect(jump.pending()).toBeNull();
  });

  it('opens the life-event scenario the other tab points to', async () => {
    const [disability] = impactChart().scenarios;
    await start([impactChart({ scenarios: [disability, { ...disability, event: 'death' }] })]);

    jump.target.set({ chartId: 'chart_impact', event: 'death' });
    await fixture.whenStable();

    const pressed = root.querySelector('.scenario[aria-pressed="true"]');
    expect(pressed?.textContent?.trim()).toBe('Todesfall');
  });

  it('drops a target whose chart is not in the feed', async () => {
    await start([incomeChart()]);
    jump.target.set({ chartId: 'chart_missing' });
    await fixture.whenStable();

    expect(scroller.reveal).not.toHaveBeenCalled();
    expect(jump.pending()).toBeNull();
  });

  it('says that charts are on their way while there is none', async () => {
    await start();
    expect(root.querySelector('.empty')?.textContent).toContain('Die Grafiken erscheinen hier');
  });

  it('lists charts in order of first appearance, the newest at the bottom', async () => {
    await start();
    await emit(chart({ chartId: 'chart_life' }));
    await emit(pillar3aChart());
    await emit(incomeChart());
    await emit(impactChart());
    expect(ids()).toEqual(['chart_life', 'chart_3a', 'chart_income', 'chart_impact']);
    expect(root.querySelector('.empty')).toBeNull();

    await emit(chart({ chartId: 'chart_life', revision: 2 }));
    expect(ids()).toEqual(['chart_life', 'chart_3a', 'chart_income', 'chart_impact']);
  });

  it('updates an existing card in place instead of adding or rebuilding one', async () => {
    await start();
    await emit(incomeChart(), pillar3aChart());
    const [income] = cards();

    await emit(incomeChart({ revision: 2, status: 'estimated' }));

    expect(cards()).toHaveLength(2);
    expect(cards()[0]).toBe(income);
    expect(income.querySelector('.status')?.textContent).toContain('Geschätzt');
    expect(income.querySelector('.updated')?.textContent).toContain('Aktualisiert');
  });

  it('follows a new chart down when the user is at the bottom', async () => {
    await start();
    scroller.nearBottom = true;
    await emit(incomeChart());

    expect(scroller.scrollToEnd).toHaveBeenCalledTimes(1);
    expect(pill()).toBeNull();
  });

  it('follows in the same render that shows the new card, not on a later one', async () => {
    await start();
    source.emit(event('chart', incomeChart()));
    TestBed.inject(ApplicationRef).tick();

    expect(cards()).toHaveLength(1);
    expect(scroller.scrollToEnd).toHaveBeenCalledTimes(1);
  });

  it('leaves the position alone while the user reads further up and offers a pill', async () => {
    await start();
    await emit(incomeChart());
    scroller.scrollToEnd.mockClear();
    scroller.nearBottom = false;
    scroller.atBottom.set(false);

    await emit(pillar3aChart(), impactChart());

    expect(scroller.scrollToEnd).not.toHaveBeenCalled();
    expect(pill()?.textContent?.trim()).toBe('Neue Grafik');

    pill()?.click();
    await fixture.whenStable();

    const first = cards().find((card) => card.dataset['chartId'] === 'chart_3a');
    expect(scroller.reveal).toHaveBeenCalledWith(first, true);
    expect(document.activeElement).toBe(first?.querySelector('article'));
    expect(pill()).toBeNull();
  });

  it('drops the pill once the user scrolls down by themselves', async () => {
    await start();
    scroller.nearBottom = false;
    scroller.atBottom.set(false);
    await emit(incomeChart());
    expect(pill()).not.toBeNull();

    scroller.atBottom.set(true);
    await fixture.whenStable();
    expect(pill()).toBeNull();
  });

  it('never follows during a tab switch, when the offset belongs to another tab', async () => {
    await start();
    scroller.settled.set(false);
    scroller.nearBottom = true;
    await emit(incomeChart());

    expect(scroller.scrollToEnd).not.toHaveBeenCalled();
    expect(pill()).not.toBeNull();
  });

  it('takes the first snapshot as the starting point: no pill, no announcement', async () => {
    await start([incomeChart(), pillar3aChart()]);
    expect(ids()).toEqual(['chart_income', 'chart_3a']);
    expect(pill()).toBeNull();
    expect(scroller.scrollToEnd).not.toHaveBeenCalled();
    expect(live()).toBe('');
  });

  it('announces new and updated charts politely', async () => {
    await start();
    await emit(chart());
    expect(live()).toBe('Neue Grafik: Lebensereignisse');

    await emit(chart({ revision: 2 }));
    expect(live()).toBe('Grafik aktualisiert: Lebensereignisse');
  });

  it('announces the same chart updated twice in a row twice', async () => {
    const region = () => root.querySelector('[aria-live]')?.textContent;
    await start([chart()]);

    await emit(chart({ revision: 2 }));
    const first = region();
    await emit(chart({ revision: 3 }));
    const second = region();
    await emit(chart({ revision: 4 }));

    // The text has to change for a screen reader to speak; what it reads stays the same.
    expect(second).not.toBe(first);
    expect(region()).not.toBe(second);
    expect(live()).toBe('Grafik aktualisiert: Lebensereignisse');
  });

  it('links a chart to the newest info card about it, or to the basics behind its type', async () => {
    await start([incomeChart(), pillar3aChart(), chart()]);
    const link = (chartId: string) =>
      root.querySelector<HTMLButtonElement>(`app-chart-card[data-chart-id="${chartId}"] .jump`);
    expect(link('chart_a')).toBeNull();
    expect(link('chart_3a')?.textContent?.trim()).toBe('In Info zeigen');

    link('chart_3a')?.click();
    expect(infoJump.show).toHaveBeenLastCalledWith('glossary_pillar3a');

    source.emit(
      event('info', info({ infoId: 'info_3a', relatedChartId: 'chart_3a' })),
      event(
        'info',
        info({ infoId: 'info_3a_tax', relatedChartId: 'chart_3a', at: '2026-10-31T10:05:00.000Z' }),
      ),
    );
    await fixture.whenStable();
    link('chart_3a')?.click();
    expect(infoJump.show).toHaveBeenLastCalledWith('info_3a_tax');
  });
});
