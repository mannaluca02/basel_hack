import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdvisorDataSource } from '../../../core/advisor/advisor-data-source';
import { CaseStore } from '../../../core/advisor/store/case-store';
import {
  FakeDataSource,
  event,
  incomeChart,
  info,
  snapshot,
} from '../../../core/advisor/store/case-testing';
import { ChartResult, InfoCategory, InfoItem } from '../../../core/advisor/ui-models';
import { Consent } from '../../../core/consent/consent';
import { AppLanguage } from '../../../core/i18n/language';
import { provideI18nTesting } from '../../../core/i18n/i18n-testing';
import { ChartJump } from '../../../core/layout/chart-jump';
import { InfoJump } from '../../../core/layout/info-jump';
import { ViewScroller } from '../../../core/layout/view-scroller';
import { GLOSSARY } from './info-links';
import { INFO_TARGET_MS } from './info-row';
import { InfoTab } from './info-tab';

/** The Dynamic View: only whether a tab switch runs, and where it was asked to scroll. */
class FakeScroller {
  readonly settled = signal(true);
  readonly reveal = vi.fn();
}

/** "Show in Info" from another tab, without the router. */
class FakeInfoJump {
  readonly target = signal<{ readonly infoId: string } | null>(null);
  readonly pending = this.target.asReadonly();
  take(): string | null {
    const target = this.target();
    this.target.set(null);
    return target?.infoId ?? null;
  }
}

/** Nests the tab below an OnPush parent like the shell does. */
@Component({
  imports: [InfoTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-info-tab />`,
})
class Shell {}

describe('InfoTab', () => {
  let source: FakeDataSource;
  let scroller: FakeScroller;
  let infoJump: FakeInfoJump;
  let chartJump: { show: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<Shell>;
  let root: HTMLElement;

  async function start(
    initial: { info?: readonly InfoItem[]; charts?: readonly ChartResult[] } = {},
  ) {
    source = new FakeDataSource();
    source.nextSnapshot = of(snapshot({ info: initial.info ?? [], charts: initial.charts ?? [] }));
    scroller = new FakeScroller();
    infoJump = new FakeInfoJump();
    chartJump = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: AdvisorDataSource, useValue: source },
        { provide: ViewScroller, useValue: scroller },
        { provide: InfoJump, useValue: infoJump },
        { provide: ChartJump, useValue: chartJump },
      ],
    });
    sessionStorage.clear();
    TestBed.inject(Consent).grant();
    TestBed.inject(CaseStore).connect();
    fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  }

  async function emit(...items: InfoItem[]) {
    source.emit(...items.map((item) => event('info', item)));
    await fixture.whenStable();
  }

  afterEach(() => vi.useRealTimers());

  const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
  const row = (infoId: string) =>
    root.querySelector<HTMLElement>(`app-info-row[data-info-id="${infoId}"]`);
  const ids = (section: string) =>
    [
      ...root.querySelectorAll<HTMLElement>(`section[aria-labelledby="${section}"] app-info-row`),
    ].map((el) => el.dataset['infoId']);
  const live = () => squash(root.querySelector('[aria-live]')?.textContent);

  it('always has the basics of the three pillars, translated, even before the call', async () => {
    await start();
    expect(ids('info-basics')).toEqual(GLOSSARY.map((entry) => entry.infoId));
    expect(squash(row('glossary_pillar3a')?.querySelector('.title')?.textContent)).toBe(
      'Säule 3a: gebundene Vorsorge',
    );
    expect(
      root.querySelector('section[aria-labelledby="info-call"] .empty')?.textContent,
    ).toContain('Erklärungen zu Ihrer Situation');

    await TestBed.inject(AppLanguage).use('fr');
    await fixture.whenStable();
    expect(squash(row('glossary_pillar3a')?.querySelector('.title')?.textContent)).toBe(
      'Pilier 3a : prévoyance liée',
    );
  });

  it('lists the cards from the call newest first and marks only the newest', async () => {
    await start({
      info: [
        info({ infoId: 'info_old', title: 'Drei Säulen', at: '2026-10-31T10:00:00.000Z' }),
        info({
          infoId: 'info_new',
          category: 'assumption',
          title: 'Annahme: BVG-Minimum',
          at: '2026-10-31T10:05:00.000Z',
        }),
      ],
    });

    expect(ids('info-call')).toEqual(['info_new', 'info_old']);
    expect(squash(row('info_new')?.querySelector('.summary')?.textContent)).toBe('Neu · Annahme');
    expect(squash(row('info_old')?.querySelector('.summary')?.textContent)).toBe('Grundlagen');
  });

  it('keeps anything but neutral information out of the tab', async () => {
    const product = { ...info({ infoId: 'info_product' }), category: 'product' as InfoCategory };
    await start({ info: [info(), product] });
    expect(ids('info-call')).toEqual(['info_a']);
    expect(squash(root.querySelector('.footnote')?.textContent)).toBe(
      'Allgemeine, neutrale Informationen ohne Produktwerbung.',
    );
  });

  it('keeps the explanation behind the row until it is opened', async () => {
    await start({ info: [info({ body: 'Die 2. Säule ist geschätzt.' })] });
    const toggle = row('info_a')?.querySelector<HTMLButtonElement>('.toggle');
    const panel = row('info_a')?.querySelector<HTMLElement>('.panel');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.hidden).toBe(true);

    toggle?.click();
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.hidden).toBe(false);
    expect(squash(panel?.querySelector('.body')?.textContent)).toBe('Die 2. Säule ist geschätzt.');
  });

  it('adds a new card live and announces it, but not the cards of the first snapshot', async () => {
    await start({ info: [info({ title: 'Drei Säulen' })] });
    expect(live()).toBe('');

    await emit(info({ infoId: 'info_3a', title: 'Säule 3a', at: '2026-10-31T10:01:00.000Z' }));
    expect(ids('info-call')).toEqual(['info_3a', 'info_a']);
    expect(live()).toBe('Neue Information: Säule 3a');
  });

  it('offers "Show in Graphics" only when the related chart is in the feed', async () => {
    await start({
      info: [info({ relatedChartId: 'chart_income' })],
    });
    const jump = () => row('info_a')?.querySelector<HTMLButtonElement>('.jump');
    expect(jump()).toBeNull();

    source.emit(event('chart', incomeChart()));
    await fixture.whenStable();
    jump()?.click();
    expect(chartJump.show).toHaveBeenCalledWith({ chartId: 'chart_income' });
  });

  it('opens, reveals and focuses the card another tab points to once the tab is settled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await start({ info: [info({ infoId: 'info_bvg' })] });
    scroller.settled.set(false);
    infoJump.target.set({ infoId: 'info_bvg' });
    await fixture.whenStable();
    expect(scroller.reveal).not.toHaveBeenCalled();

    scroller.settled.set(true);
    await fixture.whenStable();

    const target = row('info_bvg');
    const toggle = target?.querySelector<HTMLButtonElement>('.toggle');
    expect(scroller.reveal).toHaveBeenCalledWith(target, expect.any(Boolean));
    expect(document.activeElement).toBe(toggle);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(target?.classList).toContain('targeted');
    expect(infoJump.pending()).toBeNull();

    vi.advanceTimersByTime(INFO_TARGET_MS);
    await fixture.whenStable();
    expect(target?.classList).not.toContain('targeted');
  });

  it('can point to a basic explanation as well', async () => {
    await start();
    infoJump.target.set({ infoId: 'glossary_pillar3a' });
    await fixture.whenStable();
    expect(scroller.reveal).toHaveBeenCalledWith(row('glossary_pillar3a'), expect.any(Boolean));
  });
});
