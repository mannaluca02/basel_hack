import { TestBed } from '@angular/core/testing';
import { RouteReuseStrategy, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { AdvisorDataSource } from './core/advisor/advisor-data-source';
import { FakeDataSource, event, progress, risk } from './core/advisor/store/case-testing';
import { CONSENT_NOTICE_VERSION, CONSENT_STORAGE_KEY } from './core/consent/consent';
import { provideI18nTesting } from './core/i18n/i18n-testing';
import { AppLanguage } from './core/i18n/language';
import { KeepAliveRouteReuseStrategy } from './core/layout/keep-alive-route-reuse-strategy';

describe('App', () => {
  let source: FakeDataSource;

  beforeEach(async () => {
    localStorage.clear();
    // Consent from earlier in this browser session; the consent flow has its own suite below.
    sessionStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_NOTICE_VERSION);
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

  it('places the agent dock in the rail, outside the Dynamic View', async () => {
    const { root } = await renderShell();

    expect(root.querySelector('.rail > app-agent-dock.dock')).not.toBeNull();
    expect(root.querySelector('main .dock')).toBeNull();
  });

  it('puts the language switcher at the top of the rail, not in the header', async () => {
    const { root } = await renderShell();

    expect(root.querySelector('.rail > app-language-switcher.in-rail:first-child')).not.toBeNull();
    expect(root.querySelector('header app-language-switcher')).toBeNull();
  });

  it('feeds live progress and agent activity into the dock', async () => {
    const { fixture, root } = await renderShell();
    const dock = root.querySelector('app-agent-dock') as HTMLElement;
    const fill = () => (dock.querySelector('.fill') as SVGCircleElement).style.strokeDashoffset;
    expect(dock.classList).toContain('unknown');
    expect(dock.getAttribute('data-activity')).toBe('idle');

    source.emit(
      event('progress', progress({ percent: 43.5 })),
      event('agent', { activity: 'thinking', at: '2026-10-31T10:00:01.000Z' }),
    );
    await fixture.whenStable();

    expect(fill()).toBe('56.5');
    expect(dock.classList).not.toContain('unknown');
    expect(dock.getAttribute('data-activity')).toBe('thinking');
  });

  it('shows the number of open risks on the Risks tab, also for screen readers', async () => {
    const { fixture, root } = await renderShell();
    const risksLink = () => root.querySelector('a[href="/risks"]') as HTMLElement;
    expect(risksLink().querySelector('.badge')).toBeNull();

    source.emit(
      event('risk', risk({ riskId: 'risk_a', status: 'identified' })),
      event('risk', risk({ riskId: 'risk_b', status: 'needs_data' })),
      event('risk', risk({ riskId: 'risk_c', status: 'addressed' })),
    );
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

describe('App before consent', () => {
  let source: FakeDataSource;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    source = new FakeDataSource();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: AdvisorDataSource, useValue: source },
        provideI18nTesting(),
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/risks');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const checkbox = () => root.querySelector('app-consent-screen input') as HTMLInputElement;
    const startButton = () => root.querySelector('app-consent-screen button') as HTMLButtonElement;
    return { fixture, root, checkbox, startButton };
  }

  it('shows only the privacy notice: no workspace, no tabs, no call', async () => {
    const { root } = await render();

    expect(root.querySelector('h1')?.textContent).toBe('Bevor wir starten');
    expect(
      Array.from(root.querySelectorAll('app-consent-screen h2'), (h) => h.textContent),
    ).toEqual([
      'Was aufgezeichnet wird',
      'Eine KI ist beteiligt',
      'Dies ist eine Demo',
      'Ein Mensch ist jederzeit erreichbar',
    ]);
    expect(root.querySelector('.rail')).toBeNull();
    expect(root.querySelector('router-outlet')).toBeNull();
    // No rail yet, so the language can be chosen in the header before consenting.
    expect(root.querySelector('header app-language-switcher:not(.in-rail)')).not.toBeNull();
    expect(source.connectionState.value).toBe('disconnected');
  });

  it('enables "Start advice" only while the box is ticked', async () => {
    const { fixture, checkbox, startButton } = await render();
    expect(startButton().textContent?.trim()).toBe('Beratung starten');
    expect(startButton().disabled).toBe(true);

    checkbox().click();
    await fixture.whenStable();
    expect(startButton().disabled).toBe(false);

    checkbox().click();
    await fixture.whenStable();
    expect(startButton().disabled).toBe(true);
    expect(sessionStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  it('after consent stores it for the session, starts the call and opens the requested tab', async () => {
    const { fixture, root, checkbox, startButton } = await render();

    checkbox().click();
    await fixture.whenStable();
    startButton().click();
    await fixture.whenStable();

    expect(sessionStorage.getItem(CONSENT_STORAGE_KEY)).toBe(CONSENT_NOTICE_VERSION);
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(source.connectionState.value).toBe('connected');
    expect(root.querySelector('app-consent-screen')).toBeNull();
    expect(root.querySelector('main app-risks-tab h1')?.textContent).toBe('Risiken');
    expect(document.activeElement).toBe(root.querySelector('main'));
  });

  it('shows the Demo badge before and after consent', async () => {
    const { fixture, root, checkbox, startButton } = await render();
    const badge = () => root.querySelector('header .demo');
    expect(badge()?.querySelector('[aria-hidden="true"]')?.textContent).toBe('Demo');
    expect(badge()?.querySelector('.visually-hidden')?.textContent).toBe(
      'Demo mit synthetischen Daten',
    );

    checkbox().click();
    await fixture.whenStable();
    startButton().click();
    await fixture.whenStable();

    expect(badge()).not.toBeNull();
  });

  it('translates the notice without reload', async () => {
    const { fixture, root, startButton } = await render();

    await TestBed.inject(AppLanguage).use('it');
    await fixture.whenStable();

    expect(root.querySelector('h1')?.textContent).toBe('Prima di iniziare');
    expect(startButton().textContent?.trim()).toBe('Avvia la consulenza');
  });
});
