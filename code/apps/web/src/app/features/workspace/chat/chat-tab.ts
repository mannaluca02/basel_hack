import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EnvironmentInjector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CaseStore } from '../../../core/advisor/store/case-store';
import { Speaker, TranscriptEntry } from '../../../core/advisor/ui-models';
import { LocaleFormat } from '../../../core/i18n/locale-format';
import { ViewScroller } from '../../../core/layout/view-scroller';

const TIME: Intl.DateTimeFormatOptions = { timeStyle: 'short' };

const SPEAKER_KEYS: Readonly<Record<Speaker, string>> = {
  customer: 'chat.speaker.customer',
  agent: 'chat.speaker.agent',
};

interface ChatLine {
  readonly entry: TranscriptEntry;
  readonly time: string;
}

/**
 * The Chat tab (FE-17): the voice call as a chat transcript. Customer lines sit on the right,
 * the assistant's on the left. A line the voice client is still transcribing (`interim`) is
 * drawn as an outlined draft and becomes a filled bubble, in place, once it is final.
 *
 * Follows the call like the Graphics feed: at the bottom, the view scrolls along with new and
 * growing lines; scrolled up or on another tab, the position is kept and "Jump to latest" offers
 * the way down. Final lines are announced to screen readers; drafts are not, they change too
 * often.
 */
@Component({
  selector: 'app-chat-tab',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'chat.title' | transloco }}</h1>

    @if (lines().length === 0) {
      <p class="empty">{{ 'chat.empty' | transloco }}</p>
    }

    <ol class="log">
      @for (line of lines(); track line.entry.entryId) {
        @let entry = line.entry;
        <li
          class="line"
          [class.line--customer]="entry.speaker === 'customer'"
          [class.line--interim]="entry.status === 'interim'"
          [attr.data-entry-id]="entry.entryId"
          tabindex="-1"
          [animate.enter]="enterClass()"
        >
          <p class="meta">
            <span class="speaker">{{ speakerKey(entry.speaker) | transloco }}</span>
            <time [attr.datetime]="entry.at">{{ line.time }}</time>
          </p>
          <p class="bubble">
            {{ entry.text }}
            @if (entry.status === 'interim') {
              <span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>
              <span class="visually-hidden">({{ 'chat.interim' | transloco }})</span>
            }
          </p>
        </li>
      }
    </ol>

    @if (behind()) {
      <button type="button" class="pill" (click)="showLatest()">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
        {{ 'chat.latest' | transloco }}
      </button>
    }

    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
  `,
  styles: `
    // Positioned, so the visually hidden live region stays inside the view's scroll area.
    :host {
      position: relative;
      display: block;
    }

    .empty {
      color: var(--text-muted);
    }

    .log {
      display: grid;
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .line {
      display: grid;
      justify-items: start;
      gap: 0.25rem;
      max-width: min(85%, 36rem);
      border-radius: var(--radius-xl);
    }

    .line--customer {
      justify-self: end;
      justify-items: end;
    }

    .meta {
      display: flex;
      gap: 0.5rem;
      margin: 0;
      padding: 0 0.25rem;
      color: var(--text-muted);
      font-size: 0.75rem;
    }

    .speaker {
      font-weight: 600;
    }

    .bubble {
      margin: 0;
      padding: 0.625rem 0.875rem;
      border: var(--stroke-border) solid transparent;
      border-radius: var(--radius-xl);
      border-end-start-radius: var(--radius-sm);
      color: var(--text-default);
      background: var(--bg-muted);
      line-height: 1.4;
    }

    .line--customer .bubble {
      border-end-start-radius: var(--radius-xl);
      border-end-end-radius: var(--radius-sm);
      color: var(--text-inverse);
      background: var(--bg-brand-purple);
    }

    // A draft: outlined instead of filled, so it reads as "not yet said in full".
    .line--interim .bubble {
      border-style: dashed;
      border-color: var(--border-subtle);
      color: var(--text-muted);
      background: var(--bg-default);
      font-style: italic;
    }

    .dots {
      display: inline-flex;
      gap: 0.1875rem;
      margin-inline-start: 0.25rem;
      vertical-align: middle;
    }

    .dots span {
      width: 0.3125rem;
      height: 0.3125rem;
      border-radius: var(--radius-full);
      background: currentColor;
      animation: dot 1.2s ease-in-out infinite;
    }

    .dots span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .dots span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes dot {
      0%,
      80%,
      100% {
        opacity: 0.25;
      }
      40% {
        opacity: 1;
      }
    }

    // Added by animate.enter to a new line only, removed when the animation ends.
    .line-enter {
      animation: line-enter 240ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }

    @keyframes line-enter {
      from {
        opacity: 0;
        transform: translateY(0.75rem);
      }
    }

    @keyframes line-fade {
      from {
        opacity: 0;
      }
    }

    // Sticks to the bottom of the view while the latest lines are further down.
    .pill {
      position: sticky;
      bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 2.75rem;
      margin: 1rem auto 0;
      padding: 0 1rem;
      border: 0;
      border-radius: var(--radius-full);
      // Green, not purple: purple marks the customer's own lines.
      color: var(--text-on-brand);
      background: var(--bg-brand);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .icon {
      width: 1.125rem;
      height: 1.125rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    @media (prefers-reduced-motion: reduce) {
      .line-enter {
        animation-name: line-fade;
      }

      .dots span {
        animation: none;
        opacity: 0.6;
      }
    }
  `,
})
export class ChatTab {
  private readonly store = inject(CaseStore);
  private readonly scroller = inject(ViewScroller);
  private readonly transloco = inject(TranslocoService);
  private readonly format = inject(LocaleFormat);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  /** Not the component injector, which made the follow-scroll one event late (see GraphicsTab). */
  private readonly injector = inject(EnvironmentInjector);

  /** In order of first appearance; an interim line becomes final under the same entryId. */
  protected readonly lines = computed<readonly ChatLine[]>(() =>
    this.store.transcript().map((entry) => ({ entry, time: this.format.date(entry.at, TIME) })),
  );
  /** New lines arrived while the user was not at the bottom. */
  protected readonly behind = signal(false);
  protected readonly announcement = signal('');
  /** Empty for the lines of the first snapshot, so a reload does not replay every entrance. */
  protected readonly enterClass = signal('');

  /** Last status and text rendered per entryId. */
  private readonly rendered = new Map<string, Pick<TranscriptEntry, 'status' | 'text'>>();
  private started = false;
  private opened = false;

  constructor() {
    effect(() => {
      const transcript = this.store.transcript();
      const loaded = this.store.loaded();
      untracked(() => this.receive(transcript, loaded));
    });

    // Reaching the bottom means every line has been seen. Not while detached: the shared view
    // then shows another tab, and its bottom says nothing about this one.
    effect(() => {
      if (this.scroller.settled() && this.scroller.atBottom() && this.host.isConnected)
        untracked(() => this.behind.set(false));
    });

    // A chat opens at its latest line. Only once: later visits get back the position the user
    // left, which the shell restores before it settles.
    effect(() => {
      if (this.opened || !this.store.loaded() || !this.scroller.settled()) return;
      untracked(() => this.open());
    });
  }

  protected speakerKey(speaker: Speaker): string {
    return SPEAKER_KEYS[speaker];
  }

  protected showLatest(): void {
    this.behind.set(false);
    // Instant like the follow-scroll: a line arriving mid-animation would bring the pill back.
    this.scroller.scrollToEnd(false);
    // The pill is gone; continue from the latest line instead of losing focus to <body>.
    const lines = this.host.querySelectorAll<HTMLElement>('.line');
    lines[lines.length - 1]?.focus({ preventScroll: true });
  }

  private open(): void {
    // Detached while another tab is shown: the next tab switch runs this again.
    if (!this.host.isConnected) return;
    this.opened = true;
    afterNextRender({ write: () => this.scroller.scrollToEnd(false) }, { injector: this.injector });
  }

  /**
   * Runs before the template shows the new lines, so the position read here is the one the user
   * was reading at before the view grew.
   */
  private receive(transcript: readonly TranscriptEntry[], loaded: boolean): void {
    let added = false;
    let changed = false;
    const finished: TranscriptEntry[] = [];
    for (const entry of transcript) {
      const last = this.rendered.get(entry.entryId);
      if (!last) added = true;
      else if (last.text !== entry.text || last.status !== entry.status) changed = true;
      if (entry.status === 'final' && last?.status !== 'final') finished.push(entry);
      this.rendered.set(entry.entryId, { status: entry.status, text: entry.text });
    }

    if (!this.started) {
      // The first snapshot is the starting point, not news: no entrance, pill or announcement.
      if (!loaded) return;
      this.started = true;
      afterNextRender(
        { write: () => this.enterClass.set('line-enter') },
        { injector: this.injector },
      );
      return;
    }

    this.announce(finished);
    if (!added && !changed) return;

    // While the shell switches tabs, or this tab is detached, offsets belong to another tab.
    const follow = this.scroller.settled() && this.host.isConnected && this.scroller.measure();
    if (follow) {
      // Instant; the line's entrance is the motion. A smooth scroll still running when the next
      // line arrived made `measure()` read a mid-scroll offset, and the view stopped following.
      afterNextRender(
        { write: () => this.scroller.scrollToEnd(false) },
        { injector: this.injector },
      );
    } else if (added) {
      this.behind.set(true);
    }
  }

  private announce(finished: readonly TranscriptEntry[]): void {
    if (finished.length === 0) return;
    const message = finished
      .map((entry) =>
        this.transloco.translate('chat.announce', {
          speaker: this.transloco.translate(SPEAKER_KEYS[entry.speaker]),
          text: entry.text,
        }),
      )
      .join(' ');
    // A live region only speaks when its text changes: the same message twice in a row toggles a
    // silent trailing no-break space, so it is read again.
    this.announcement.update((last) => (last === message ? `${message} ` : message));
  }
}
