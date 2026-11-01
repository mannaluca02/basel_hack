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
import { provideFakePaxAvatar } from './features/paxi/paxi-testing';
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
        provideFakePaxAvatar(),
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

  it('renders one link per workspace tab in the tab bar at the bottom, Graphics first', async () => {
    const { root } = await renderShell();
    const links = root.querySelectorAll('.tabbar nav a');

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

  it('places Paxi in the agent dock on his own layer, outside the Dynamic View', async () => {
    const { root } = await renderShell();

    expect(root.querySelector('app-paxi-stage > app-agent-dock.paxi app-paxi-avatar')).not.toBeNull();
    expect(root.querySelector('main app-agent-dock')).toBeNull();
    expect(root.querySelector('.tabbar app-agent-dock')).toBeNull();
  });

  it('names the product next to the logo', async () => {
    const { root } = await renderShell();

    expect(root.querySelector('header .brand .product')?.textContent).toBe('Digital Advisor');
  });

  it('offers the language switcher in the header only once Paxi is in the corner', async () => {
    const { fixture, root, navigate } = await renderShell();
    await navigate('/graphics');
    expect(root.querySelector('app-language-switcher')).toBeNull();

    source.emit(event('chart', chart()));
    await fixture.whenStable();

    expect(root.getAttribute('data-paxi')).toBe('corner');
    expect(root.querySelector('header app-language-switcher')).not.toBeNull();
    expect(root.querySelector('.tabbar app-language-switcher')).toBeNull();
  });

  describe('Paxi (FE-28)', () => {
    const spot = (root: HTMLElement) => root.getAttribute('data-paxi');

    it('talks in the centre until the shown tab has a chart, risk or info, then keeps the corner', async () => {
      const { fixture, root, navigate } = await renderShell();
      await navigate('/risks');
      expect(spot(root)).toBe('centre');

      // News in another tab does not move Paxi.
      source.emit(event('transcript', line()), event('chart', chart()));
      await fixture.whenStable();
      expect(spot(root)).toBe('centre');

      await navigate('/graphics');
      expect(spot(root)).toBe('corner');

      await navigate('/chat');
      expect(spot(root)).toBe('corner');
    });

    it('hides the shown tab while Paxi talks in the centre, and shows it once he is in the corner', async () => {
      const { fixture, root, navigate } = await renderShell();
      await navigate('/graphics');
      const content = () => root.querySelector('main .tab-content') as HTMLElement;
      expect(content().querySelector('app-graphics-tab .empty')).not.toBeNull();
      expect(getComputedStyle(content()).visibility).toBe('hidden');

      source.emit(event('chart', chart()));
      await fixture.whenStable();

      expect(spot(root)).toBe('corner');
      expect(getComputedStyle(content()).visibility).toBe('visible');
    });

    it('moves to the corner on the Chat tab once the conversation has lines', async () => {
      const { fixture, root, navigate } = await renderShell();
      await navigate('/chat');
      expect(spot(root)).toBe('centre');

      source.emit(event('transcript', line()));
      await fixture.whenStable();
      expect(spot(root)).toBe('corner');

      await navigate('/graphics');
      expect(spot(root)).toBe('centre');
    });

    it('moves to the corner for an info item in the Info tab too', async () => {
      const { fixture, root, navigate } = await renderShell();
      await navigate('/info');
      source.emit(event('info', info()));
      await fixture.whenStable();

      expect(spot(root)).toBe('corner');
    });

    it('is there right away after a reload with consent: no intro, no banner', async () => {
      const { root } = await renderShell();

      expect(root.querySelector('app-logo-intro')).toBeNull();
      expect(root.querySelector('app-consent-banner')).toBeNull();
      expect(root.querySelector('app-paxi-stage')?.classList).not.toContain('veiled');
      expect(root.querySelector('app-paxi-stage')?.hasAttribute('inert')).toBe(false);
      expect(source.connectionState.value).toBe('connected');
    });

    it("shows Paxi's latest line as a caption", async () => {
      const { fixture, root } = await renderShell();
      source.emit(
        event('transcript', line({ entryId: 'entry_1', speaker: 'agent', text: 'Grüezi' })),
        event('transcript', line({ entryId: 'entry_2', speaker: 'customer', text: 'Hallo' })),
      );
      await fixture.whenStable();

      expect(root.querySelector('app-paxi-stage .caption')?.textContent).toBe('Grüezi');
    });
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
      Array.from(root.querySelectorAll('.tabbar nav a:has(.dot)'), (a) => a.getAttribute('href'));

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
      // No count in the tab bar: the Risks tab lists open and addressed risks itself.
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
        provideFakePaxAvatar(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('stays on screen above the tabs against the real backend', async () => {
    const root = await renderWith('api');

    expect(root.querySelector('main app-review-panel + .tab-content > router-outlet')).not.toBeNull();
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
        provideFakePaxAvatar(),
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

  it('starts talking again after a reload in the live build, without the microphone button', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
    vi.stubGlobal('navigator', { ...navigator, userAgent: navigator.userAgent, mediaDevices: { getUserMedia } });
    try {
      await renderWith({ dataSource: 'api', demoStart: true, liveStart: true });
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('waits for the microphone button after a reload outside the live build', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
    vi.stubGlobal('navigator', { ...navigator, userAgent: navigator.userAgent, mediaDevices: { getUserMedia } });
    try {
      await renderWith({ dataSource: 'api', demoStart: true });
      expect(getUserMedia).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows the call bar for Paxi in its own window in the paxi configuration', async () => {
    const root = await renderWith({
      dataSource: 'api',
      demoStart: true,
      voiceAgentUrl: 'http://localhost:3100',
    });

    expect(root.querySelector('app-call-controls')).not.toBeNull();
  });

  it('links the contract journey against the backend, not in the scripted mock', async () => {
    const api = await renderWith({ dataSource: 'api', demoStart: true });
    expect(api.querySelector('.tabbar a[href="/journey"]')).not.toBeNull();
    TestBed.resetTestingModule();
    const mock = await renderWith({ dataSource: 'mock' });
    expect(mock.querySelector('.tabbar a[href="/journey"]')).toBeNull();
  });

  it('links the Voice Lab only in the debug configurations', async () => {
    const root = await renderWith({ dataSource: 'api', demoStart: true });

    expect(root.querySelector('.tabbar a[href="/voice-lab"]')).toBeNull();
    expect(root.querySelector('.tabbar a[href="/insights"]')).toBeNull();
  });

  it('adds the Voice Lab tab to the tab bar with debugVoice', async () => {
    const root = await renderWith({ dataSource: 'api', demoStart: true, debugVoice: true });

    expect(root.querySelector('.tabbar a[href="/voice-lab"]')).not.toBeNull();
    expect(root.querySelector('.tabbar a[href="/insights"]')).not.toBeNull();
  });
});

describe('App before consent', () => {
  let source: FakeDataSource;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    // jsdom has no modal dialogs; "Details" only needs the open state.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    source = new FakeDataSource();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: AdvisorDataSource, useValue: source },
        provideI18nTesting(),
        provideFakePaxAvatar(),
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/risks');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const banner = () => root.querySelector('app-consent-banner');
    const button = (action: 'agree' | 'decline') =>
      root.querySelector(`app-consent-banner [data-action="${action}"]`) as HTMLButtonElement;
    const agree = async () => {
      button('agree').click();
      await fixture.whenStable();
    };
    return { fixture, root, banner, button, agree };
  }

  it('shows only the logo intro and the consent banner: no workspace, no tabs, no call', async () => {
    const { root, banner, button } = await render();

    expect(root.querySelector('app-logo-intro')).not.toBeNull();
    expect(banner()?.querySelector('.text')?.textContent).toContain('erfundenen Angaben');
    expect(button('agree').textContent?.trim()).toBe('Ich stimme zu');
    expect(button('decline').textContent?.trim()).toBe('Ich lehne ab');
    expect(root.querySelector('.tabbar')).toBeNull();
    expect(root.querySelector('app-paxi-stage')).toBeNull();
    expect(root.querySelector('router-outlet')).toBeNull();
    // The language switcher waits until Paxi is in the corner.
    expect(root.querySelector('app-language-switcher')).toBeNull();
    expect(source.connectionState.value).toBe('disconnected');
  });

  it('opens the six sections of the privacy notice under "Details"', async () => {
    const { fixture, banner } = await render();
    const details = banner()?.querySelector('dialog') as HTMLDialogElement;
    expect(details.open).toBe(false);

    (banner()?.querySelector('.link') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(details.open).toBe(true);
    expect(details.querySelector('h2')?.textContent).toBe('Bevor wir starten');
    expect(Array.from(details.querySelectorAll('section h3'), (h) => h.textContent)).toEqual([
      'Was aufgezeichnet wird',
      'Eine KI ist beteiligt',
      'Erfundene Gesprächsausschnitte an OpenAI',
      'Erfundene Rechendaten an Logismata',
      'Dies ist eine Demo',
      'Ein Mensch ist jederzeit erreichbar',
    ]);
  });

  it('closes "Details" with ×, and with a click on the backdrop but not inside the notice', async () => {
    const { fixture, banner } = await render();
    const details = banner()?.querySelector('dialog') as HTMLDialogElement;
    const open = async () => {
      (banner()?.querySelector('.link') as HTMLButtonElement).click();
      await fixture.whenStable();
    };

    await open();
    (details.querySelector('.close') as HTMLButtonElement).click();
    expect(details.open).toBe(false);

    await open();
    (details.querySelector('.section') as HTMLElement).click();
    expect(details.open).toBe(true);
    // The backdrop is part of the dialog's own box: the click targets the dialog itself.
    details.click();
    expect(details.open).toBe(false);
  });

  it.each([
    ['de', /erfundene.*OpenAI.*Extraktion|Extraktion.*erfundene.*OpenAI/s, /keine Freigabe echter/],
    ['fr', /fictifs.*OpenAI.*extraire/s, /n’autorise aucune donnée réelle/],
    ['it', /inventati.*OpenAI.*estrarre/s, /non autorizza dati reali/],
    ['en', /invented.*OpenAI.*extract/s, /does not release real/],
  ] as const)(
    '%s: names OpenAI, invented content and extraction, apart from the calculator',
    async (lang, extraction, noRelease) => {
      const { fixture, banner } = await render();
      await TestBed.inject(AppLanguage).use(lang);
      await fixture.whenStable();

      const sections = Array.from(
        banner()?.querySelectorAll('dialog section') ?? [],
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

    const { banner } = await render();

    expect(CONSENT_NOTICE_VERSION).not.toBe('1');
    expect(banner()).not.toBeNull();
    expect(source.connectionState.value).toBe('disconnected');
  });

  it('keeps the banner after "I decline", says why, and processes nothing', async () => {
    const { fixture, banner, button } = await render();

    button('decline').click();
    await fixture.whenStable();

    expect(banner()?.querySelector('.declined')?.textContent?.trim()).toBe(
      'Ohne Ihre Einwilligung kann Paxi Sie nicht beraten.',
    );
    expect(banner()?.querySelector('.declined')?.getAttribute('role')).toBe('status');
    expect(sessionStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(source.connectionState.value).toBe('disconnected');

    // Still possible to agree afterwards.
    expect(button('agree').disabled).toBe(false);
  });

  it('after "I agree" stores the consent, connects, wakes Paxi and opens the requested tab', async () => {
    const { root, banner, agree } = await render();

    await agree();

    expect(sessionStorage.getItem(CONSENT_STORAGE_KEY)).toBe(CONSENT_NOTICE_VERSION);
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(source.connectionState.value).toBe('connected');
    expect(banner()).toBeNull();
    // Without the Web Animations API the intro hands over at once.
    expect(root.querySelector('app-logo-intro')).toBeNull();
    expect(root.querySelector('app-paxi-stage')?.classList).not.toContain('veiled');
    expect(root.querySelector('main app-risks-tab h1')?.textContent).toBe('Risiken');
    expect(document.activeElement).toBe(root.querySelector('main'));
  });

  it('treats the tab requested before consent as shown: its news gets no dot', async () => {
    const { fixture, root, agree } = await render();
    await agree();

    source.emit(event('risk', risk({ status: 'identified' })));
    await fixture.whenStable();

    expect(TestBed.inject(CaseStore).risks()).toHaveLength(1);
    expect(root.querySelector('a[href="/risks"] .dot')).toBeNull();
  });

  it('shows the Demo badge before and after consent', async () => {
    const { root, agree } = await render();
    const badge = () => root.querySelector('header .demo');
    expect(badge()?.querySelector('[aria-hidden="true"]')?.textContent).toBe('Demo');
    expect(badge()?.querySelector('.visually-hidden')?.textContent).toBe(
      'Demo mit synthetischen Daten',
    );

    await agree();

    expect(badge()).not.toBeNull();
  });

  it('translates the banner and the notice without reload', async () => {
    const { fixture, banner, button } = await render();

    await TestBed.inject(AppLanguage).use('it');
    await fixture.whenStable();

    expect(banner()?.querySelector('dialog h2')?.textContent).toBe('Prima di iniziare');
    expect(button('agree').textContent?.trim()).toBe('Accetto');
  });

  it('does not mention the microphone where "I agree" starts no live voice', async () => {
    const { banner } = await render();

    expect(banner()?.querySelector('.text')?.textContent).not.toContain('Mikrofon');
  });
});

describe('App before consent, with the live voice', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdvisorDataSource, useValue: new FakeDataSource() },
        {
          provide: APP_ENVIRONMENT,
          useValue: { production: false, apiBaseUrl: '/api', dataSource: 'api', demoStart: true },
        },
        provideI18nTesting(),
        provideFakePaxAvatar(),
      ],
    }).compileComponents();
  });

  it('says that "I agree" sends microphone and conversation to OpenAI', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).querySelector('app-consent-banner .text');

    expect(text?.textContent).toContain('Mikrofon und Gespräch gehen an OpenAI');
    expect(text?.textContent).not.toContain('keine echten Daten');
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
        provideFakePaxAvatar(),
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
      Array.from(root.querySelectorAll('.tabbar nav a:has(.dot)'), (a) => a.getAttribute('href'));
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
