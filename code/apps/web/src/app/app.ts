import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CaseStore } from './core/advisor/store/case-store';
import { WorkspaceTab } from './core/advisor/store/case-state';
import { Consent } from './core/consent/consent';
import { LanguageSwitcher } from './core/i18n/language-switcher';
import { AgentDock } from './features/agent-dock/agent-dock';
import { ConsentScreen } from './features/consent/consent-screen';

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

  /** Risks not yet addressed: the count badge on the Risks tab. */
  protected readonly openRisks = computed(
    () => this.store.risks().filter((risk) => risk.status !== 'addressed').length,
  );

  /** Data capture for the ring around the avatar. */
  protected readonly progress = this.store.progress;
  protected readonly activity = computed(() => this.store.agent().activity);

  constructor() {
    // Tabs stay alive (KeepAliveRouteReuseStrategy), but a detached view loses its scroll
    // offset, and all tabs share one scroll container. Save it on leave, restore it on return.
    const router = inject(Router);
    router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      const view = this.view()?.nativeElement;
      if (!view) return;
      if (event instanceof NavigationStart) {
        this.scrollTops.set(pathOf(router.url), view.scrollTop);
      } else if (event instanceof NavigationEnd) {
        const top = this.scrollTops.get(pathOf(event.urlAfterRedirects)) ?? 0;
        afterNextRender({ write: () => (view.scrollTop = top) }, { injector: this.injector });
      }
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
}

function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0];
}
