import {
  ChangeDetectionStrategy,
  Component,
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
import { AgentDock } from './features/agent-dock/agent-dock';
import { ConsentScreen } from './features/consent/consent-screen';
import { ConnectionBanner } from './features/connection/connection-banner';
import { HumanAdvisorStatus } from './features/human-advisor/human-advisor-status';
import { CallControls } from './features/call-controls/call-controls';
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

@Component({
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    LanguageSwitcher,
    ConsentScreen,
    AgentDock,
    ConnectionBanner,
    HumanAdvisorStatus,
    CallControls,
    SummaryDialog,
    LiveVoiceControl,
    ReviewPanel,
  ],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.gated]': '!consented()' },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly store = inject(CaseStore);
  private readonly consent = inject(Consent);
  private readonly injector = inject(Injector);
  private readonly scroller = inject(ViewScroller);
  private readonly view = viewChild<ElementRef<HTMLElement>>('view');
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

  /** Until the user consents, only the privacy notice is shown: no workspace, no call. */
  protected readonly consented = this.consent.granted;

  /**
   * The review stand needs the real case service; the scripted mock has no packages to decide,
   * and the demo start comes with an already confirmed case.
   */
  protected readonly reviewEnabled =
    inject(APP_ENVIRONMENT).dataSource === 'api' && !inject(APP_ENVIRONMENT).demoStart;

  /** The tab the router shows; `null` while the URL names no tab (before the first redirect). */
  private readonly activeTab = signal<WorkspaceTab | null>(null);
  /** Items added or changed per tab since it was last shown: the live update dots (FE-21). */
  protected readonly unread = this.store.unread;

  /** Data capture for the ring around the avatar. */
  protected readonly progress = this.store.progress;
  private readonly paxi = inject(VoiceAgentLink);
  private readonly live = inject(VoiceActivity).live;
  /** Paxi's activity while it talks here or in its own window, else the advisor's. */
  protected readonly activity = computed(
    () =>
      this.live() ??
      (this.paxi.state() === 'opened' ? this.paxi.activity() : this.store.agent().activity),
  );

  /** The live voice needs the case service; the scripted mock has no voice sessions. */
  protected readonly liveVoice = inject(APP_ENVIRONMENT).dataSource === 'api';
  /**
   * The call bar drives the scripted call (mock) or Paxi's window (`paxi` configuration); with the
   * backend otherwise, the live voice's microphone button is the call control.
   */
  protected readonly callControls =
    inject(APP_ENVIRONMENT).dataSource === 'mock' || !!inject(APP_ENVIRONMENT).voiceAgentUrl;
  /** Link to the Voice Lab, only in the debug configurations. */
  protected readonly debugVoice = inject(APP_ENVIRONMENT).debugVoice === true;

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

    // Consent lasts the browser session, so after a reload the call resumes right away.
    if (this.consented()) this.store.connect();
  }

  protected start(): void {
    this.consent.grant();
    this.store.connect();
    // The consent screen and its button are gone: continue in the workspace, not on <body>.
    afterNextRender(
      { write: () => this.view()?.nativeElement.focus() },
      { injector: this.injector },
    );
  }

  private tabAt(url: string): WorkspaceTab | null {
    const path = pathOf(url);
    return this.tabs.find((tab) => tab.path === path)?.id ?? null;
  }
}

function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0];
}
