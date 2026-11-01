import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CaseStore } from './core/advisor/store/case-store';
import { WorkspaceTab } from './core/advisor/store/case-state';
import { APP_ENVIRONMENT } from './core/config/app-environment';
import { Consent } from './core/consent/consent';
import { LanguageSwitcher } from './core/i18n/language-switcher';
import { ViewScroller } from './core/layout/view-scroller';
import { PaxiPlacement, PaxiSpot } from './core/paxi/paxi-placement';
import { ConsentBanner } from './features/consent/consent-banner';
import { ConnectionBanner } from './features/connection/connection-banner';
import { HumanAdvisorStatus } from './features/human-advisor/human-advisor-status';
import { CallControls } from './features/call-controls/call-controls';
import { LogoIntro } from './features/intro/logo-intro';
import type { LogoIntro as Intro } from './features/intro/logo-intro';
import { PaxiStage } from './features/paxi/paxi-stage';
import { SummaryDialog } from './features/summary/summary-dialog';
import { VoiceAgentLink } from './core/advisor/api/voice-agent-link';
import { VoiceActivity } from './core/voice/voice-activity';
import { LiveVoiceControl } from './features/live-voice/live-voice-control';
import { ReviewPanel } from './features/review/review-panel';

interface TabLink {
  readonly id: WorkspaceTab;
  readonly path: string;
  /** Translation key. */
  readonly label: string;
  /** SVG path on a 24×24 grid, drawn as a 2px stroke. */
  readonly icon: string;
}

/**
 * `intro`: the sleeping logo with the consent banner; `waking`: after "I agree", the "." flies
 * onto Paxi; `ready`: the workspace with Paxi.
 */
type Phase = 'intro' | 'waking' | 'ready';

@Component({
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    LanguageSwitcher,
    ConsentBanner,
    LogoIntro,
    PaxiStage,
    ConnectionBanner,
    HumanAdvisorStatus,
    CallControls,
    SummaryDialog,
    LiveVoiceControl,
    ReviewPanel,
  ],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.gated]': '!consented()', '[attr.data-paxi]': 'spot()' },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly store = inject(CaseStore);
  private readonly consent = inject(Consent);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly scroller = inject(ViewScroller);
  private readonly placement = inject(PaxiPlacement);
  private readonly env = inject(APP_ENVIRONMENT);
  private readonly view = viewChild<ElementRef<HTMLElement>>('view');
  // By name: a class locator would pull the deferred intro into the first bundle.
  private readonly intro = viewChild<Intro>('intro');
  private readonly stage = viewChild(PaxiStage);
  /** Scroll offset of the Dynamic View per tab path. */
  private readonly scrollTops = new Map<string, number>();

  protected readonly tabs: readonly TabLink[] = [
    { id: 'graphics', path: '/graphics', label: 'nav.graphics', icon: 'M4 20h16M5 15l4-4 4 3 6-7' },
    { id: 'risks', path: '/risks', label: 'nav.risks', icon: 'M12 4 3 20h18ZM12 10v4M12 17h.01' },
    { id: 'chat', path: '/chat', label: 'nav.chat', icon: 'M5 5h14v10H10l-5 4Z' },
    {
      id: 'info',
      path: '/info',
      label: 'nav.info',
      icon: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 11v5M12 8h.01',
    },
  ];

  /** Until the user consents, only the logo intro and the consent banner show: no workspace, no call. */
  protected readonly consented = this.consent.granted;
  /** Consent from earlier in this browser tab skips the intro: Paxi is there right away. */
  private readonly phase = signal<Phase>(this.consented() ? 'ready' : 'intro');
  protected readonly introShown = computed(() => this.phase() !== 'ready');
  /** Paxi shows once the waking "." lands on him. */
  protected readonly revealed = signal(this.consented());

  /** The review stand; the demo start comes with an already confirmed case. */
  protected readonly reviewEnabled = !this.env.demoStart;

  /** The tab the router shows; `null` while the URL names no tab (before the first redirect). */
  private readonly activeTab = this.placement.tab;
  /** Items added or changed per tab since it was last shown: the live update dots (FE-21). */
  protected readonly unread = this.store.unread;

  /** Data capture for the ring around Paxi. */
  protected readonly progress = this.store.progress;
  private readonly paxi = inject(VoiceAgentLink);
  private readonly voice = inject(VoiceActivity);
  /** Paxi's activity while it talks here or in its own window, else the advisor's. */
  protected readonly activity = computed(
    () =>
      this.voice.live() ??
      (this.paxi.state() === 'opened' ? this.paxi.activity() : this.store.agent().activity),
  );
  protected readonly audio = this.voice.audio;
  /** Paxi's latest line: from the running call, else from the conversation so far. */
  protected readonly caption = computed(() => {
    const live = this.voice.caption();
    if (live) return live;
    const said = [...this.store.transcript()].reverse().find((line) => line.speaker === 'agent');
    return said?.text ?? null;
  });
  /** Paxi stays in the centre until the intro has landed, then makes room for the content. */
  protected readonly spot = computed<PaxiSpot>(() =>
    this.phase() === 'ready' ? this.placement.spot() : 'centre',
  );

  /** The call bar drives Paxi's window; otherwise the live voice's microphone button is the call control. */
  protected readonly callControls = !!this.env.voiceAgentUrl;
  /** "I agree" starts the live voice in the app; not in the `paxi` configuration (own window). */
  protected readonly autoCall = !this.env.voiceAgentUrl;
  /** "I agree" is about to start the call: no hint meanwhile. */
  private readonly callPending = signal(false);
  /** No call runs and none is about to start (after a reload, or a call ended): say how to start one. */
  protected readonly hint = computed(
    () => this.autoCall && !this.callPending() && this.voice.live() === null,
  );

  constructor() {
    // Tabs stay alive (KeepAliveRouteReuseStrategy), but a detached view loses its scroll
    // offset, and all tabs share one scroll container. Save it on leave, restore it on return.
    const router = inject(Router);
    this.activeTab.set(this.tabAt(router.url));
    router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      // Before consent there is no Dynamic View, but the requested tab is already known.
      if (event instanceof NavigationEnd) this.activeTab.set(this.tabAt(event.urlAfterRedirects));
      const view = this.view()?.nativeElement;
      if (!view) return;
      if (event instanceof NavigationStart) {
        this.scrollTops.set(pathOf(router.url), view.scrollTop);
        this.scroller.unsettle();
      } else if (event instanceof NavigationEnd) {
        const top = this.scrollTops.get(pathOf(event.urlAfterRedirects)) ?? 0;
        afterNextRender(
          {
            write: () => {
              view.scrollTop = top;
              this.scroller.settle();
            },
          },
          { injector: this.injector },
        );
      } else if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.scroller.settle();
      }
    });

    // The Dynamic View exists only after consent; feed tabs read and scroll it via ViewScroller.
    effect((onCleanup) => {
      const view = this.view()?.nativeElement;
      if (!view) return;
      this.scroller.attach(view);
      onCleanup(() => this.scroller.detach());
    });

    // Showing a tab marks it read, and keeps it read while news for it arrives. New data never
    // switches the tab; the dots on the other tabs point to it instead.
    effect(() => {
      const tab = this.activeTab();
      if (tab && this.unread()[tab] > 0) this.store.markRead(tab);
    });

    // Consent lasts the browser session, so after a reload the call resumes right away; the live
    // build also starts talking again without the microphone button.
    if (this.consented()) {
      this.store.connect();
      if (this.autoCall && this.env.liveStart) this.callPaxi();
    }
  }

  /** "I agree": store the consent, connect, start the call in this click, wake Paxi. */
  protected start(): void {
    // A second click before the banner is gone must not start a second call or wake-up.
    if (this.phase() !== 'intro') return;
    this.consent.grant();
    this.store.connect();
    if (this.autoCall) this.callPaxi();
    this.phase.set('waking');
    // The workspace with Paxi renders under the intro; then the "." knows where to land. The
    // wake-up measures both and then animates, hence one mixed read/write callback.
    afterNextRender(
      () => {
        const intro = this.intro();
        const stage = this.stage();
        if (!intro || !stage) return this.landed();
        // Whatever happens to the animation, the app must not stay locked under the intro.
        intro
          .wake(stage.bodyRect(), () => this.revealed.set(true))
          .catch(() => undefined)
          .finally(() => this.landed());
      },
      { injector: this.injector },
    );
  }

  private landed(): void {
    this.revealed.set(true);
    this.phase.set('ready');
    // The banner and its button are gone: continue in the workspace, not on <body>.
    afterNextRender(
      { write: () => this.view()?.nativeElement.focus() },
      { injector: this.injector },
    );
  }

  /**
   * The microphone prompt belongs to the click; the voice code loads in its own chunk and starts
   * once the case is ready.
   */
  private callPaxi(): void {
    this.callPending.set(true);
    // Released at once, the call opens its own stream; a refusal shows when the call starts.
    this.document.defaultView?.navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((track) => track.stop()))
      .catch(() => undefined);
    const done = () => this.callPending.set(false);
    // Offline or replaced chunks: no call, but the hint points to the microphone button.
    Promise.all([import('./core/voice/live-voice'), import('./core/paxi/paxi-call')])
      .then(([{ LiveVoice }, { startPaxiWhenReady }]) =>
        startPaxiWhenReady(this.injector.get(LiveVoice), this.injector, done),
      )
      .catch(done);
  }

  private tabAt(url: string): WorkspaceTab | null {
    const path = pathOf(url);
    return this.tabs.find((tab) => tab.path === path)?.id ?? null;
  }
}

function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0];
}
