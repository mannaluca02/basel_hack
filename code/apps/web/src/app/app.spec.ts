import { TestBed } from '@angular/core/testing';
import { RouteReuseStrategy, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';
import { AdvisorDataSource } from './core/advisor/advisor-data-source';
import { FakeDataSource, risk, snapshot } from './core/advisor/store/case-testing';
import { provideI18nTesting } from './core/i18n/i18n-testing';
import { AppLanguage } from './core/i18n/language';
import { KeepAliveRouteReuseStrategy } from './core/layout/keep-alive-route-reuse-strategy';

describe('App', () => {
  let source: FakeDataSource;

  beforeEach(async () => {
    localStorage.clear();
    source = new FakeDataSource();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: RouteReuseStrategy, useClass: KeepAliveRouteReuseStrategy },
        { provide: AdvisorDataSource, useValue: source },
        provideI18nTesting(),
      ],
    }).compileComponents();
  });

  async function renderShell() {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const navigate = async (url: string) => {
      await TestBed.inject(Router).navigateByUrl(url);
      await fixture.whenStable();
    };
    return { fixture, root, navigate };
  }

  it('renders one link per workspace tab in the rail, Graphics first', async () => {
    const { root } = await renderShell();
    const links = root.querySelectorAll('.rail nav a');

    expect(Array.from(links, (a) => a.getAttribute('href'))).toEqual([
      '/graphics',
      '/risks',
      '/chat',
      '/info',
    ]);
  });

  it('marks only the active tab with aria-current="page"', async () => {
    const { root, navigate } = await renderShell();
    const current = () =>
      Array.from(root.querySelectorAll('nav a[aria-current="page"]'), (a) =>
        a.getAttribute('href'),
      );

    await navigate('/');
    expect(current()).toEqual(['/graphics']);

    await navigate('/chat');
    expect(current()).toEqual(['/chat']);
  });

  it('reserves the agent dock in the rail, outside the Dynamic View', async () => {
    const { root } = await renderShell();

    expect(root.querySelector('.rail > .dock')).not.toBeNull();
    expect(root.querySelector('main .dock')).toBeNull();
  });

  it('shows the number of open risks on the Risks tab, also for screen readers', async () => {
    const { fixture, root } = await renderShell();
    const risksLink = () => root.querySelector('a[href="/risks"]') as HTMLElement;
    expect(risksLink().querySelector('.badge')).toBeNull();

    source.nextSnapshot = of(
      snapshot({
        risks: [
          risk({ riskId: 'risk_a', status: 'identified' }),
          risk({ riskId: 'risk_b', status: 'needs_data' }),
          risk({ riskId: 'risk_c', status: 'addressed' }),
        ],
      }),
    );
    source.connect();
    await fixture.whenStable();

    const badge = risksLink().querySelector('.badge');
    expect(badge?.textContent?.trim()).toBe('2');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    expect(risksLink().querySelector('.visually-hidden')?.textContent).toBe('2 offen');
  });

  it.each([
    ['/graphics', 'Grafiken'],
    ['/risks', 'Risiken'],
    ['/chat', 'Chat'],
    ['/info', 'Info'],
  ])('lazy-loads the tab for %s', async (url, heading) => {
    const harness = await RouterTestingHarness.create(url);

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe(heading);
  });

  it('redirects the root and unknown paths to graphics', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Grafiken');

    await harness.navigateByUrl('/does-not-exist');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Grafiken');
  });

  it('keeps each tab component alive across tab switches', async () => {
    const harness = await RouterTestingHarness.create('/graphics');
    const graphics = harness.routeDebugElement?.componentInstance;

    await harness.navigateByUrl('/risks');
    const risks = harness.routeDebugElement?.componentInstance;
    await harness.navigateByUrl('/graphics');

    expect(harness.routeDebugElement?.componentInstance).toBe(graphics);
    await harness.navigateByUrl('/risks');
    expect(harness.routeDebugElement?.componentInstance).toBe(risks);
  });

  it('restores the scroll position of each tab', async () => {
    const { root, navigate } = await renderShell();
    const view = root.querySelector('main') as HTMLElement;
    // jsdom does not lay out, so scrollTop is a plain property here.
    let top = 0;
    Object.defineProperty(view, 'scrollTop', { get: () => top, set: (v: number) => (top = v) });

    await navigate('/graphics');
    top = 240;
    await navigate('/risks');
    expect(top).toBe(0);

    top = 80;
    await navigate('/graphics');
    expect(top).toBe(240);

    await navigate('/risks');
    expect(top).toBe(80);
  });

  it('switches shell, open tab and document title to another language without reload', async () => {
    const harness = await RouterTestingHarness.create();
    const fixture = TestBed.createComponent(App);
    await harness.navigateByUrl('/risks');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const navLabels = () => Array.from(root.querySelectorAll('nav .label'), (a) => a.textContent);

    expect(navLabels()).toEqual(['Grafiken', 'Risiken', 'Chat', 'Info']);
    expect(document.title).toBe('Risiken | Pax Digital Advisor');

    await TestBed.inject(AppLanguage).use('fr');
    await fixture.whenStable();
    await harness.fixture.whenStable();

    expect(navLabels()).toEqual(['Graphiques', 'Risques', 'Chat', 'Infos']);
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Espace de travail');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Risques');
    expect(document.title).toBe('Risques | Pax Digital Advisor');
  });
});
