import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouteReuseStrategy, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { AdvisorDataSource } from './core/advisor/advisor-data-source';
import { MOCK_CALL_SCRIPT } from './core/advisor/mock/mock-call-script';
import { provideAdvisorDataSource } from './core/advisor/provide-advisor-data-source';
import { CaseStore } from './core/advisor/store/case-store';
import {
  FakeDataSource,
  chart,
  event,
  info,
  line,
  progress,
  risk,
} from './core/advisor/store/case-testing';
import { APP_ENVIRONMENT } from './core/config/app-environment';
import { CONSENT_NOTICE_VERSION, CONSENT_STORAGE_KEY } from './core/consent/consent';
import { provideI18nTesting } from './core/i18n/i18n-testing';
import { AppLanguage } from './core/i18n/language';
import { KeepAliveRouteReuseStrategy } from './core/layout/keep-alive-route-reuse-strategy';
import { stubChartCanvas } from './features/workspace/graphics/graphics-testing';

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

  it('shows the Pax logo in the header, the dark variant in the dark theme', async () => {
    const { root } = await renderShell();

    expect(root.querySelector('.bar img.logo')?.getAttribute('src')).toBe('brand/pax-logo-positive.svg');
    expect(root.querySelector('.bar img.logo')?.getAttribute('alt')).toBe('Pax');
    expect(root.querySelector('.bar source')?.getAttribute('media')).toBe('(prefers-color-scheme: dark)');
  });

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

  describe('live update dots (FE-21)', () => {
    const link = (root: HTMLElement, path: string) =>
      root.querySelector(`a[href="${path}"]`) as HTMLElement;
    const dotted = (root: HTMLElement) =>
      Array.from(root.querySelectorAll('.rail nav a:has(.dot)'), (a) => a.getAttribute('href'));

    it('marks news in another tab with a dot until that tab is shown', async () => {
      const { fixture, root, navigate } = await renderShell();
      await navigate('/graphics');

      source.emit(event('chart', chart()), event('transcript', line()), event('info', info()));
      await fixture.whenStable();

      expect(dotted(root)).toEqual(['/chat', '/info']);
      expect(link(root, '/chat').querySelector('.dot')?.getAttribute('aria-hidden')).toBe('true');
      expect(link(root, '/chat').querySelector('.visually-hidden')?.textContent).toBe(
        'Neues seit dem letzten Besuch',
      );

      await navigate('/chat');
      expect(dotted(root)).toEqual(['/info']);
      expect(link(root, '/chat').querySelector('.visually-hidden')).toBeNull();
    });

    it('keeps the shown tab free of a dot while news for it arrives', async () => {
      const { fixture, root, navigate } = await renderShell();
      await navigate('/chat');

      source.emit(event('transcript', line({ entryId: 'entry_1' })));
      await fixture.whenStable();
      source.emit(event('transcript', line({ entryId: 'entry_2' })));
      await fixture.whenStable();

      expect(dotted(root)).toEqual([]);
      expect(TestBed.inject(CaseStore).unread().chat).toBe(0);
    });

    it('gives Risks a dot like every tab, also when a seen risk changes', async () => {
      const { fixture, root, navigate } = await renderShell();
      await navigate('/graphics');

      source.emit(event('risk', risk({ status: 'identified' })));
      await fixture.whenStable();
      expect(dotted(root)).toEqual(['/risks']);
      // No count in the rail: the Risks tab lists open and addressed risks itself.
      expect(link(root, '/risks').querySelector('.badge')).toBeNull();

      await navigate('/risks');
      expect(dotted(root)).toEqual([]);

      await navigate('/graphics');
      source.emit(event('risk', risk({ status: 'identified', title: 'Updated' })));
      await fixture.whenStable();
      expect(dotted(root)).toEqual(['/risks']);
    });
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

  it('jumps from a risk to its chart in the Graphics tab and highlights it', async () => {
    const { fixture, root, navigate } = await renderShell();
    const view = root.querySelector('main') as HTMLElement;
    // jsdom does not lay out or scroll; record where the view is sent instead.
    view.scrollTo = vi.fn() as typeof view.scrollTo;
    await navigate('/graphics');
    await navigate('/risks');
    source.emit(
      event('chart', chart({ chartId: 'chart_life' })),
      event('risk', risk({ relatedChartId: 'chart_life' })),
    );
    await fixture.whenStable();

    root.querySelector<HTMLButtonElement>('app-risk-row .toggle')?.click();
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('app-risk-row .jump')?.click();
    await fixture.whenStable();

    const target = root.querySelector('app-chart-card[data-chart-id="chart_life"] article');
    expect(TestBed.inject(Router).url).toBe('/graphics');
    expect(target?.classList).toContain('targeted');
    expect(document.activeElement).toBe(target);
    expect(view.scrollTo).toHaveBeenCalled();
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
    // One router outlet only: a second one from RouterTestingHarness misses the tab on its first lazy load (FE-26).
    const { fixture, root, navigate } = await renderShell();
    await navigate('/risks');
    const navLabels = () => Array.from(root.querySelectorAll('nav .label'), (a) => a.textContent);
    const heading = () => root.querySelector('main app-risks-tab h1')?.textContent;

    expect(navLabels()).toEqual(['Grafiken', 'Risiken', 'Chat', 'Info']);
    expect(heading()).toBe('Risiken');
    expect(document.title).toBe('Risiken | Pax Digital Advisor');

    await TestBed.inject(AppLanguage).use('fr');
    await fixture.whenStable();

    expect(navLabels()).toEqual(['Graphiques', 'Risques', 'Chat', 'Infos']);
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Espace de travail');
    expect(heading()).toBe('Risques');
    expect(document.title).toBe('Risques | Pax Digital Advisor');
  });
});

describe('App review stand', () => {
  async function renderWith(dataSource: 'mock' | 'api') {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_NOTICE_VERSION);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdvisorDataSource, useValue: new FakeDataSource() },
        {
          provide: APP_ENVIRONMENT,
          useValue: { production: false, apiBaseUrl: '/api', dataSource },
        },
        provideI18nTesting(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('stays on screen above the tabs against the real backend', async () => {
    const root = await renderWith('api');

    expect(root.querySelector('main app-review-panel + router-outlet')).not.toBeNull();
  });

  it('is not shown for the scripted demo, which has no case service behind it', async () => {
    const root = await renderWith('mock');

    expect(root.querySelector('app-review-panel')).toBeNull();
  });
});

describe('App voice per configuration', () => {
  async function renderWith(environment: Record<string, unknown>) {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_NOTICE_VERSION);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdvisorDataSource, useValue: new FakeDataSource() },
        {
          provide: APP_ENVIRONMENT,
          useValue: { production: false, apiBaseUrl: '/api', ...environment },
        },
        provideI18nTesting(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('drives the scripted call from the call bar in the mock', async () => {
    const root = await renderWith({ dataSource: 'mock' });

    expect(root.querySelector('app-call-controls')).not.toBeNull();
  });

  it('leaves the call to the live voice against the backend, without a call bar', async () => {
    const root = await renderWith({ dataSource: 'api', demoStart: true });

    expect(root.querySelector('app-call-controls')).toBeNull();
  });

  it('shows the call bar for Paxi in its own window in the paxi configuration', async () => {
    const root = await renderWith({
      dataSource: 'api',
      demoStart: true,
      voiceAgentUrl: 'http://localhost:3100',
    });

    expect(root.querySelector('app-call-controls')).not.toBeNull();
  });

  it('links the Voice Lab only in the debug configurations', async () => {
    const root = await renderWith({ dataSource: 'api', demoStart: true });

    expect(root.querySelector('.rail a[href="/voice-lab"]')).toBeNull();
  });

  it('adds the Voice Lab tab to the rail with debugVoice', async () => {
    const root = await renderWith({ dataSource: 'api', demoStart: true, debugVoice: true });

    expect(root.querySelector('.rail a[href="/voice-lab"]')).not.toBeNull();
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
      'Erfundene Gesprächsausschnitte an OpenAI',
      'Erfundene Rechendaten an Logismata',
      'Dies ist eine Demo',
      'Ein Mensch ist jederzeit erreichbar',
    ]);
    expect(root.querySelector('.rail')).toBeNull();
    expect(root.querySelector('router-outlet')).toBeNull();
    // No rail yet, so the language can be chosen in the header before consenting.
    expect(root.querySelector('header app-language-switcher:not(.in-rail)')).not.toBeNull();
    expect(source.connectionState.value).toBe('disconnected');
  });

  it.each([
    ['de', /erfundene.*OpenAI.*Extraktion|Extraktion.*erfundene.*OpenAI/s, /keine Freigabe echter/],
    ['fr', /fictifs.*OpenAI.*extraire/s, /n’autorise aucune donnée réelle/],
    ['it', /inventati.*OpenAI.*estrarre/s, /non autorizza dati reali/],
    ['en', /invented.*OpenAI.*extract/s, /does not release real/],
  ] as const)(
    '%s: names OpenAI, invented content and extraction, apart from the calculator',
    async (lang, extraction, noRelease) => {
      const { fixture, root } = await render();
      await TestBed.inject(AppLanguage).use(lang);
      await fixture.whenStable();

      const sections = Array.from(
        root.querySelectorAll('app-consent-screen section'),
        (section) => section.textContent ?? '',
      );
      const model = sections.find((text) => text.includes('OpenAI'));
      const calculator = sections.find((text) => text.includes('Logismata'));

      expect(model).toMatch(extraction);
      expect(model).toMatch(noRelease);
      expect(calculator).toBeDefined();
      expect(calculator).not.toBe(model);
    },
  );

  it('asks again when the stored consent refers to an earlier notice', async () => {
    sessionStorage.setItem(CONSENT_STORAGE_KEY, '1');

    const { root } = await render();

    expect(CONSENT_NOTICE_VERSION).not.toBe('1');
    expect(root.querySelector('app-consent-screen')).not.toBeNull();
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

  it('treats the tab requested before consent as shown: its news gets no dot', async () => {
    const { fixture, root, checkbox, startButton } = await render();
    checkbox().click();
    await fixture.whenStable();
    startButton().click();
    await fixture.whenStable();

    source.emit(event('risk', risk({ status: 'identified' })));
    await fixture.whenStable();

    expect(TestBed.inject(CaseStore).risks()).toHaveLength(1);
    expect(root.querySelector('a[href="/risks"] .dot')).toBeNull();
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

describe('App during the scripted mock call', () => {
  beforeAll(async () => {
    // Lazy tab chunks load on the real clock; the fake one below would run out before they arrive (FE-27).
    await Promise.all(routes.map((route) => route.loadComponent?.()));
  });

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_NOTICE_VERSION);
    // jsdom does not scroll; the Graphics tab scrolls to each new chart.
    Element.prototype.scrollTo = vi.fn() as Element['scrollTo'];
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: RouteReuseStrategy, useClass: KeepAliveRouteReuseStrategy },
        provideAdvisorDataSource(),
        {
          provide: APP_ENVIRONMENT,
          useValue: { production: false, apiBaseUrl: '/api', dataSource: 'mock' },
        },
        provideI18nTesting(),
      ],
    });
    // The scripted call fills the Graphics tab; ECharts cannot draw in jsdom.
    stubChartCanvas();
    await TestBed.compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (Element.prototype as Partial<Element>).scrollTo;
  });

  it('never switches the tab and clears each dot when its tab is shown', async () => {
    const fixture = TestBed.createComponent(App);
    const root = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    // Angular renders on a timer too, so let the fake clock run in frames until it is stable.
    const settle = async () => {
      for (let frame = 0; frame < 50; frame++) {
        await vi.advanceTimersByTimeAsync(16);
        if (fixture.isStable()) return;
      }
      throw new Error('The app did not settle');
    };
    const navigate = async (url: string) => {
      const done = router.navigateByUrl(url);
      await settle();
      await done;
      await settle();
    };
    const marked = () =>
      Array.from(root.querySelectorAll('.rail nav a:has(.dot)'), (a) => a.getAttribute('href'));
    await navigate('/graphics');

    // The call clock started with the App, which connects right away after consent.
    const urls = new Set<string>();
    let played = 0;
    for (const step of MOCK_CALL_SCRIPT) {
      await vi.advanceTimersByTimeAsync(step.atMs - played);
      played = step.atMs;
      await settle();
      urls.add(router.url);
      expect(marked()).not.toContain('/graphics');
    }
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();

    expect([...urls]).toEqual(['/graphics']);
    expect(marked()).toEqual(['/risks', '/chat', '/info']);

    await navigate('/risks');
    await navigate('/chat');
    await navigate('/info');
    expect(marked()).toEqual([]);
    expect(TestBed.inject(CaseStore).unread()).toEqual({ graphics: 0, risks: 0, chat: 0, info: 0 });
  });
});
