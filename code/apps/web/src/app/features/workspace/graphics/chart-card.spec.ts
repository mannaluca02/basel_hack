import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResultStatus } from '../../../core/advisor/contracts';
import { chart, impactChart, incomeChart } from '../../../core/advisor/store/case-testing';
import { ChartResult } from '../../../core/advisor/ui-models';
import { provideI18nTesting } from '../../../core/i18n/i18n-testing';
import { ChartCard, TARGET_MARKER_MS, UPDATED_MARKER_MS } from './chart-card';
import { stubChartCanvas } from './graphics-testing';

@Component({
  imports: [ChartCard],
  template: `<app-chart-card [chart]="chart()" />`,
})
class Host {
  readonly chart = signal<ChartResult>(incomeChart());
}

describe('ChartCard', () => {
  let fixture: ComponentFixture<Host>;
  let root: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    stubChartCanvas();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.useRealTimers());

  const text = (selector: string) =>
    root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const toggle = () => root.querySelector('.toggle') as HTMLButtonElement;

  async function set(chart: ChartResult) {
    fixture.componentInstance.chart.set(chart);
    await fixture.whenStable();
  }

  it('is an article named by its title, with the status as text', () => {
    const article = root.querySelector('article') as HTMLElement;
    expect(root.querySelector(`#${article.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Einkommen bis und nach der Pensionierung',
    );
    expect(text('.status')).toBe('Angaben fehlen');
    expect(text('.unit')).toBe('CHF pro Jahr · brutto');
  });

  it('words every status differently, so none relies on colour alone', async () => {
    const statuses: ResultStatus[] = [
      'valid',
      'estimated',
      'requires_review',
      'needs_input',
      'provider_error',
      'stale',
    ];
    const labels: string[] = [];
    for (const status of statuses) {
      await set(incomeChart({ status }));
      labels.push(text('.status') ?? '');
    }
    expect(new Set(labels).size).toBe(statuses.length);
    expect(labels).not.toContain('');
  });

  it('lists every pillar in a text legend, with the status of incomplete series', () => {
    const legend = text('.legend');
    expect(legend).toContain('1. Säule (AHV/IV) (Geschätzt)');
    expect(legend).toContain('2. Säule (Pensionskasse) (Angaben fehlen)');
    expect(legend).toContain('3. Säule');
    const swatch = root.querySelector('.legend .swatch') as HTMLElement;
    expect(swatch.style.getPropertyValue('--swatch')).toBe('var(--chart-8)');
  });

  it('opens the same data as a table on request', async () => {
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('table')).toBeNull();

    toggle().click();
    await fixture.whenStable();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().textContent?.trim()).toBe('Tabelle ausblenden');
    const region = root.querySelector(`#${toggle().getAttribute('aria-controls')}`) as HTMLElement;
    expect(region.hidden).toBe(false);
    const headers = [...region.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers[0]).toBe('Jahr');
    expect(headers).toContain('2. Säule (Pensionskasse)');
    const lastRow = [...region.querySelectorAll('tbody tr')].at(-1) as HTMLElement;
    expect(lastRow.querySelector('th[scope="row"]')?.textContent).toBe('2060');
    expect(lastRow.textContent).toContain('unbekannt');
  });

  it('marks a new revision as updated for a moment, but not the first one', async () => {
    expect(root.querySelector('.updated')).toBeNull();

    vi.useFakeTimers();
    fixture.componentInstance.chart.set(incomeChart({ revision: 2 }));
    fixture.detectChanges();
    expect(text('.updated')).toBe('Aktualisiert');

    vi.advanceTimersByTime(UPDATED_MARKER_MS);
    fixture.detectChanges();
    expect(root.querySelector('.updated')).toBeNull();
  });

  it('does not mark a repeated delivery of the same revision as updated', async () => {
    await set(incomeChart({ updatedAt: '2026-10-31T11:00:00.000Z' }));
    expect(root.querySelector('.updated')).toBeNull();
  });

  it('switches between the scenarios of a life-event impact and keeps the choice on update', async () => {
    const [disability] = impactChart().scenarios;
    const death = { ...disability, event: 'death' as const };
    await set(impactChart({ scenarios: [disability, death] }));
    const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('.scenario')];
    const pressed = () => buttons().map((b) => b.getAttribute('aria-pressed'));

    expect(root.querySelector('.scenarios')?.getAttribute('aria-label')).toBe('Szenario');
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Invalidität', 'Todesfall']);
    expect(pressed()).toEqual(['true', 'false']);

    buttons()[1].click();
    await fixture.whenStable();
    expect(pressed()).toEqual(['false', 'true']);

    await set(impactChart({ revision: 2, scenarios: [disability, death] }));
    expect(pressed()).toEqual(['false', 'true']);
  });

  it('keeps the chosen scenario when an update brings the scenarios in a new order', async () => {
    const [disability] = impactChart().scenarios;
    const death = { ...disability, event: 'death' as const };
    await set(impactChart({ scenarios: [disability, death] }));
    const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('.scenario')];
    const shown = () => buttons().find((b) => b.getAttribute('aria-pressed') === 'true');

    buttons()[1].click();
    await fixture.whenStable();
    expect(shown()?.textContent?.trim()).toBe('Todesfall');

    await set(impactChart({ revision: 2, scenarios: [death, disability] }));
    expect(shown()?.textContent?.trim()).toBe('Todesfall');

    // A scenario the update dropped falls back to the first one.
    await set(impactChart({ revision: 3, scenarios: [disability] }));
    expect(text('.scenario-name')).toBe('Invalidität');
  });

  it('selects the scenario another tab points to and highlights the card for a moment', async () => {
    const [disability] = impactChart().scenarios;
    const death = { ...disability, event: 'death' as const };
    await set(impactChart({ scenarios: [disability, death] }));
    const card = fixture.debugElement.query((el) => el.name === 'app-chart-card')
      .componentInstance as ChartCard;
    const shown = () =>
      [...root.querySelectorAll<HTMLButtonElement>('.scenario')]
        .find((b) => b.getAttribute('aria-pressed') === 'true')
        ?.textContent?.trim();
    const article = () => root.querySelector('article') as HTMLElement;
    vi.useFakeTimers();

    card.highlight('death');
    fixture.detectChanges();
    expect(shown()).toBe('Todesfall');
    expect(article().classList).toContain('targeted');

    vi.advanceTimersByTime(TARGET_MARKER_MS);
    fixture.detectChanges();
    expect(article().classList).not.toContain('targeted');
  });

  it('keeps the scenario when the event it is pointed to is not in the chart', async () => {
    const [disability] = impactChart().scenarios;
    const death = { ...disability, event: 'death' as const };
    await set(impactChart({ scenarios: [disability, death] }));
    const card = fixture.debugElement.query((el) => el.name === 'app-chart-card')
      .componentInstance as ChartCard;

    card.highlight('retirement');
    await fixture.whenStable();

    const pressed = root.querySelector('.scenario[aria-pressed="true"]');
    expect(pressed?.textContent?.trim()).toBe('Invalidität');
    expect(root.querySelector('article')?.classList).toContain('targeted');
  });

  it('names a single scenario instead of offering a switch with one option', async () => {
    await set(impactChart());
    expect(root.querySelector('.scenarios')).toBeNull();
    expect(text('.scenario-name')).toBe('Invalidität');
  });

  it('shows life events as a timeline, and the same events as a table on request', async () => {
    await set(
      chart({
        events: [
          { eventId: 'e1', kind: 'marriage', year: 2019, label: 'Heirat', certainty: 'past' },
          { eventId: 'e2', kind: 'retirement', year: 2056, label: 'Pension', certainty: 'planned' },
        ],
      }),
    );
    const entries = [...root.querySelectorAll('app-life-timeline li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(entries).toEqual(['2019: Heirat, Vergangen', '2056: Pension, Geplant']);
    expect(root.querySelector('app-chart-canvas')).toBeNull();

    expect(toggle().textContent?.trim()).toBe('Daten als Tabelle anzeigen');
    toggle().click();
    await fixture.whenStable();
    const headers = [...root.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Jahr', 'Lebensereignis', 'Stand']);
    const rows = [...root.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.children].map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ['2019', 'Heirat', 'Vergangen'],
      ['2056', 'Pension', 'Geplant'],
    ]);
  });
});
