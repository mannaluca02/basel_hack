import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CustomerApi } from '../../core/advisor/api/customer-api';
import { VoiceAgentLink } from '../../core/advisor/api/voice-agent-link';
import { CaseStore } from '../../core/advisor/store/case-store';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { LiveVoice } from '../../core/voice/live-voice';

/** Translation keys, written out in full for the i18n check. */
const ERROR_LABELS: Readonly<Record<string, string>> = {
  NotAllowedError: 'lab.error.microphoneDenied',
  PermissionDeniedError: 'lab.error.microphoneDenied',
  NotFoundError: 'lab.error.microphoneMissing',
  SESSION_EXPIRED: 'lab.error.sessionExpired',
};

let nextId = 0;

/**
 * The live conversation with Paxi right in the app, at the right end of the tab bar: a microphone
 * button that first asks for both consents (voice transfer, AI extraction), then talks over the
 * case backend (`LiveVoice`). While the call runs the same button ends it. What Paxi hears
 * arrives as proposals; Paxi shows its activity. "I agree" on the consent banner starts the first
 * call without this panel (`startPaxiWhenReady`); the button is for every later start and stop.
 *
 * Only shown when the backend offers GPT-Live and the model extraction, and not in the `paxi`
 * configuration, where Paxi talks in its own window. The demo start has no review stand: there a
 * card above the tab bar offers to accept what Paxi heard, which also recalculates the scenarios.
 */
@Component({
  selector: 'app-live-voice-control',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'open.set(false)' },
  template: `
    @if (shown()) {
      <button
        type="button"
        class="mic"
        [class.mic--active]="live.active()"
        [attr.aria-expanded]="live.active() ? null : open()"
        [attr.aria-controls]="live.active() ? null : panelId"
        (click)="toggle()"
      >
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          @if (live.active()) {
            <rect x="7" y="7" width="10" height="10" rx="1.5" />
          } @else {
            <path
              d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5 11a7 7 0 0 0 14 0M12 18v3"
            />
          }
        </svg>
        <span class="label">{{ (live.active() ? 'voice.stop' : 'voice.start') | transloco }}</span>
      </button>

      @if (open() && !live.active()) {
        <section class="panel" role="dialog" [id]="panelId" [attr.aria-labelledby]="titleId">
          <h2 [id]="titleId">{{ 'voice.title' | transloco }}</h2>
          <p class="notice">{{ live.notice() }}</p>
          <label class="consent">
            <input
              type="checkbox"
              [checked]="live.consent()"
              (change)="live.consent.set($any($event.target).checked)"
            />
            <span>{{ 'lab.voiceConsent' | transloco }}</span>
          </label>
          @if (live.extractionNotice(); as extraction) {
            <p class="notice">{{ extraction.text }}</p>
          }
          <label class="consent">
            <input
              type="checkbox"
              data-action="extraction-consent"
              [checked]="live.extractionConsent()"
              (change)="live.extractionConsent.set($any($event.target).checked)"
            />
            <span>{{ 'lab.intake.extractionConsent' | transloco }}</span>
          </label>
          @if (blocker(); as blocker) {
            <p class="status" role="status">{{ blocker | transloco }}</p>
          }
          <div class="actions">
            <button
              type="button"
              class="action action--primary"
              data-action="start"
              [disabled]="!!blocker()"
              (click)="start()"
            >
              {{ 'voice.begin' | transloco }}
            </button>
            <button type="button" class="action" (click)="open.set(false)">
              {{ 'voice.cancel' | transloco }}
            </button>
          </div>
        </section>
      }

      <span class="visually-hidden" aria-live="polite">
        @if (errorLabel(); as error) {
          {{ error | transloco: { code: live.error() } }}
        } @else if (live.state() === 'connected') {
          {{ 'voice.connected' | transloco }}
        }
      </span>
      @if (errorLabel(); as error) {
        @if (!open()) {
          <p class="error" role="alert">{{ error | transloco: { code: live.error() } }}</p>
        }
      }
    }
    <!-- Also in the paxi configuration: Paxi's proposals need the same acceptance in the demo. -->
    @if (offerAccept() && !open() && !(shown() && errorLabel())) {
      <section class="card" role="status">
        <p>{{ (acceptFailed() ? 'voice.acceptFailed' : 'voice.pending') | transloco }}</p>
        <button
          type="button"
          class="action action--primary"
          data-action="accept"
          [disabled]="accepting()"
          (click)="accept()"
        >
          {{ (accepting() ? 'voice.accepting' : 'voice.accept') | transloco }}
        </button>
      </section>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }

    .mic {
      position: relative;
      display: grid;
      place-items: center;
      width: var(--tab-size);
      height: var(--tab-size);
      padding: 0;
      border: var(--stroke-s) solid var(--border-soft);
      border-radius: var(--radius-full);
      color: var(--text-default);
      background: var(--bg-default);
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--bg-muted);
        }
      }
    }

    // Running call: filled, so the stop button stands out from the tabs.
    .mic--active {
      border-color: transparent;
      color: var(--text-on-brand);
      background: var(--bg-brand);

      @media (hover: hover) {
        &:hover {
          background: var(--bg-brand);
        }
      }
    }

    .icon {
      width: var(--icon-size);
      height: var(--icon-size);
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .mic--active .icon {
      fill: currentColor;
    }

    // Tooltip above the button, which sits at the right end of the tab bar.
    .label {
      position: absolute;
      right: 0;
      bottom: calc(100% + 0.5rem);
      padding: 0.25rem 0.5rem;
      border: var(--stroke-border) solid var(--border-soft);
      border-radius: var(--radius-sm);
      color: var(--text-default);
      background: var(--bg-default);
      font-size: 0.8125rem;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease-out;
    }

    .mic:focus-visible .label {
      opacity: 1;
    }

    @media (hover: hover) {
      .mic:hover .label {
        opacity: 1;
      }
    }

    // Opens above the tab bar, over the Dynamic View.
    .panel,
    .error,
    .card {
      position: absolute;
      right: 0;
      bottom: calc(100% + 0.5rem);
      width: min(22rem, calc(100vw - 2rem));
      margin: 0;
      padding: 1rem;
      border: var(--stroke-border) solid var(--border-soft);
      border-radius: var(--radius-m);
      color: var(--text-default);
      background: var(--bg-default);
    }

    .error {
      width: max-content;
      max-width: 15rem;
      padding: 0.5rem 0.75rem;
      border-color: var(--border-error);
      color: var(--text-error);
      font-size: 0.8125rem;
    }

    .card {
      width: max-content;
      max-width: 16rem;
      padding: 0.75rem;
      font-size: 0.875rem;

      p {
        margin: 0 0 0.5rem;
      }
    }

    h2 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
    }

    .notice,
    .status {
      margin: 0 0 0.75rem;
      color: var(--text-muted);
      font-size: 0.8125rem;
    }

    .consent {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      margin: 0 0 0.75rem;
      font-size: 0.875rem;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    @media (prefers-reduced-motion: reduce) {
      .label {
        transition: none;
      }
    }
  `,
})
export class LiveVoiceControl {
  protected readonly live = inject(LiveVoice);
  private readonly paxi = inject(VoiceAgentLink);

  private readonly customer = inject(CustomerApi);
  private readonly store = inject(CaseStore);
  private readonly demoStart = inject(APP_ENVIRONMENT).demoStart === true;
  private readonly liveStart = inject(APP_ENVIRONMENT).liveStart === true;

  protected readonly open = signal(false);
  protected readonly accepting = signal(false);
  protected readonly acceptFailed = signal(false);
  /** Demo start: Paxi heard something that is not accepted yet. */
  protected readonly offerAccept = computed(
    () =>
      // The live build takes proposals over by itself (LiveVoice), so it needs no card.
      this.demoStart && !this.liveStart && this.live.caseReady() && (this.store.projection()?.pending.length ?? 0) > 0,
  );
  protected readonly panelId = `live-voice-panel-${nextId}`;
  protected readonly titleId = `live-voice-title-${nextId++}`;

  /** Also while a call runs, so it can always be stopped. */
  protected readonly shown = computed(
    () => this.live.active() || (this.live.available() && !this.paxi.available),
  );

  /** Translation key of the reason Start is disabled, or `null`. */
  protected readonly blocker = computed(() => {
    if (this.live.handoverActive()) return 'lab.setup.handover';
    if (!this.live.speakable()) return 'lab.setup.choosePerson';
    if (this.live.busy()) return 'lab.setup.working';
    if (!this.live.consent()) return 'lab.setup.consent';
    if (!this.live.extractionConsent()) return 'lab.intake.extractionBlocker';
    return null;
  });

  protected readonly errorLabel = computed(() => {
    const error = this.live.error();
    if (!error || error === 'BACKEND_UNAVAILABLE') return null;
    return ERROR_LABELS[error] ?? 'voice.interrupted';
  });

  constructor() {
    // Notices and settings belong to the case session (and its language, see LiveVoice).
    effect(() => {
      const session = this.customer.session();
      untracked(() => {
        if (session && this.live.apiMode) void this.live.loadNotice();
      });
    });
  }

  protected toggle(): void {
    if (this.live.active()) this.live.stop();
    // Live build: the consent banner gave both consents, so the button only stops and resumes.
    else if (this.liveStart) void this.resume();
    else this.open.update((open) => !open);
  }

  private async resume(): Promise<void> {
    this.live.consent.set(true);
    this.live.extractionConsent.set(true);
    if (!this.blocker()) await this.live.start();
  }

  protected async start(): Promise<void> {
    if (this.blocker()) return;
    this.open.set(false);
    await this.live.start();
  }

  protected async accept(): Promise<void> {
    const caseId = this.customer.session()?.caseId;
    if (!caseId || this.accepting()) return;
    this.accepting.set(true);
    this.acceptFailed.set(false);
    try {
      await this.customer.demoAccept(caseId);
    } catch (error) {
      console.error('LiveVoiceControl: accepting the proposals failed', error);
      this.acceptFailed.set(true);
    } finally {
      this.accepting.set(false);
      this.store.refresh();
    }
  }
}
