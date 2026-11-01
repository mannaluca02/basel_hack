import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NOTICE_SECTIONS } from './notice-sections';

let nextId = 0;

/**
 * Consent before the first session (DSG/FADP, project rule 7), at the bottom of the logo intro:
 * two lines at most, "Details" for the full notice, "I agree" and "I decline" with the same
 * weight. Declining keeps the banner and says why Paxi cannot start; nothing is processed and no
 * call starts. Storing the consent and starting the call is up to the parent, see `App`.
 */
@Component({
  selector: 'app-consent-banner',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      #banner
      class="banner"
      role="dialog"
      tabindex="-1"
      [attr.aria-labelledby]="titleId"
      [attr.aria-describedby]="textId"
    >
      <h2 class="visually-hidden" [id]="titleId">{{ 'consent.title' | transloco }}</h2>
      <p class="text" [id]="textId">
        {{ (voice() ? 'consent.banner.textVoice' : 'consent.banner.text') | transloco }}
        <button type="button" class="link" aria-haspopup="dialog" (click)="details.showModal()">
          {{ 'consent.banner.details' | transloco }}
        </button>
      </p>
      <p class="declined" role="status" [class.shown]="declined()">
        @if (declined()) {
          {{ 'consent.banner.declined' | transloco }}
        }
      </p>
      <div class="actions">
        <button type="button" class="action" data-action="decline" (click)="declined.set(true)">
          {{ 'consent.banner.decline' | transloco }}
        </button>
        <button type="button" class="action action--primary" data-action="agree" (click)="agreed.emit()">
          {{ 'consent.banner.agree' | transloco }}
        </button>
      </div>
    </section>

    <!-- A click on the backdrop lands on the dialog itself and closes it, like Esc and ×. -->
    <dialog
      #details
      class="details"
      [attr.aria-labelledby]="detailsId"
      (click)="$event.target === details && details.close()"
    >
      <div class="sheet">
        <header>
          <h2 [id]="detailsId">{{ 'consent.title' | transloco }}</h2>
          <button type="button" class="close" (click)="details.close()">
            <span aria-hidden="true">×</span>
            <span class="visually-hidden">{{ 'consent.details.close' | transloco }}</span>
          </button>
        </header>
        <p>{{ 'consent.intro' | transloco }}</p>
        @for (section of sections; track section.id) {
          <section class="section">
            <h3>{{ section.title | transloco }}</h3>
            <p>{{ section.body | transloco }}</p>
          </section>
        }
        <p class="session">{{ 'consent.session' | transloco }}</p>
      </div>
    </dialog>
  `,
  styles: `
    :host {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 3;
      display: flex;
      justify-content: center;
      padding: 1rem;
      padding-bottom: max(1rem, env(safe-area-inset-bottom));
      pointer-events: none;
    }

    .banner {
      width: min(40rem, 100%);
      padding: 1.25rem;
      border: var(--stroke-border) solid var(--border-soft);
      border-radius: var(--radius-xl);
      color: var(--text-default);
      background: var(--bg-default);
      pointer-events: auto;

      // Focused by script only, so screen readers start here; not a control, so no ring.
      &:focus-visible {
        outline: none;
        box-shadow: none;
      }
    }

    p {
      margin: 0;
      line-height: 1.5;
    }

    // Two lines at the banner's full width; the six sections sit behind the link.
    .text {
      font-size: 0.9375rem;
    }

    .link {
      padding: 0;
      border: 0;
      color: var(--text-brand);
      background: none;
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }

    .declined.shown {
      margin-top: 0.75rem;
      color: var(--text-error);
      font-weight: var(--font-weight-bold);
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    // The host lets clicks through to the intro; the dialog in the top layer still inherits that,
    // so without this it could neither scroll nor close by pointer.
    .details {
      pointer-events: auto;
      width: min(40rem, calc(100% - 2rem));
      max-height: calc(100dvh - 2rem);
      // On the inner sheet: the dialog's own box is the backdrop's click target.
      padding: 0;
      border: var(--stroke-border) solid var(--border-soft);
      border-radius: var(--radius-xl);
      color: var(--text-default);
      background: var(--bg-default);

      &::backdrop {
        background: var(--bg-brand-purple);
        opacity: 0.6;
      }
    }

    .sheet {
      padding: 1.25rem;
    }

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .close {
      flex: none;
      width: 2.75rem;
      height: 2.75rem;
      border: 0;
      border-radius: var(--radius-full);
      color: var(--text-default);
      background: var(--bg-muted);
      font: inherit;
      font-size: 1.5rem;
      cursor: pointer;
    }

    .section {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      border-left: var(--stroke-m) solid var(--border-focusring);
      border-radius: var(--radius-sm);
      background: var(--bg-muted);
    }

    h3 {
      margin: 0 0 0.25rem;
      font-size: 1rem;
    }

    .session {
      margin-top: 1.25rem;
      color: var(--text-muted);
      font-size: 0.875rem;
    }
  `,
})
export class ConsentBanner {
  /** "I agree" also starts the live voice: the text then says that microphone and talk go to OpenAI. */
  readonly voice = input(false);
  /** The user agreed; consent and start are up to the parent. */
  readonly agreed = output<void>();

  protected readonly declined = signal(false);
  protected readonly sections = NOTICE_SECTIONS;
  protected readonly titleId = `consent-title-${nextId}`;
  protected readonly textId = `consent-text-${nextId}`;
  protected readonly detailsId = `consent-details-${nextId++}`;

  private readonly banner = viewChild.required<ElementRef<HTMLElement>>('banner');

  constructor() {
    afterNextRender({ write: () => this.banner().nativeElement.focus({ preventScroll: true }) });
  }
}
