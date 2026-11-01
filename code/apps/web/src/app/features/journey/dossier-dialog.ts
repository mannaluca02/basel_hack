import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { JourneyApi } from '../../core/advisor/api/journey-api';

/**
 * The advice dossier in a dialog on the same page: the backend's escaped print HTML (all details,
 * assumptions, reasons and sources of the advice), loaded with the app's own session and shown in
 * a sandboxed frame without scripts. Print prints only the dossier.
 */
@Component({
  selector: 'app-dossier-dialog',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dossier" aria-labelledby="dossier-title" (close)="closed.emit()">
      <header>
        <h2 id="dossier-title">{{ 'journey.dossierTitle' | transloco }}</h2>
        <button
          type="button"
          class="action"
          data-action="print"
          [disabled]="!html()"
          (click)="print()"
        >
          {{ 'journey.print' | transloco }}
        </button>
        <button type="button" class="close" data-action="close" (click)="dialog.close()">
          <span aria-hidden="true">×</span>
          <span class="visually-hidden">{{ 'journey.dossierClose' | transloco }}</span>
        </button>
      </header>
      @if (failed()) {
        <p class="error" role="alert">{{ 'journey.dossierFailed' | transloco }}</p>
      } @else if (!html()) {
        <p class="note" role="status">{{ 'journey.working' | transloco }}</p>
      }
      <iframe
        #frame
        class="frame"
        [class.frame--hidden]="!html()"
        sandbox="allow-same-origin allow-modals"
        [attr.title]="'journey.dossierTitle' | transloco"
      ></iframe>
    </dialog>
  `,
  styles: `
    .dossier {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: min(60rem, calc(100vw - 2rem));
      height: min(52rem, calc(100dvh - 2rem));
      max-width: none;
      max-height: none;
      padding: 0;
      border: 0;
      border-radius: var(--radius-xl);
      color: var(--text-default);
      background: var(--bg-default);
    }

    .dossier:not([open]) {
      display: none;
    }

    .dossier::backdrop {
      background: var(--text-default);
      opacity: 0.4;
    }

    header {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      padding: 0.75rem 1rem;
      border-bottom: var(--stroke-border) solid var(--border-soft);
    }

    // Size and weight from the global heading scale; the margin pushes the buttons right.
    h2 {
      margin: 0 auto 0 0;
    }

    .close {
      width: 2.75rem;
      height: 2.75rem;
      border: 0;
      border-radius: var(--radius-full);
      color: inherit;
      background: var(--bg-muted);
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
    }

    .note,
    .error {
      margin: 1rem;
    }

    .error {
      color: var(--text-error);
    }

    // The dossier brings its own styles: the app's colours in the system theme, light on paper.
    .frame {
      flex: 1;
      width: 100%;
      border: 0;
      border-radius: 0 0 var(--radius-xl) var(--radius-xl);
      background: var(--bg-default);
    }

    .frame--hidden {
      display: none;
    }
  `,
})
export class DossierDialog {
  readonly caseId = input.required<string>();
  readonly closed = output<void>();

  private readonly api = inject(JourneyApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  protected readonly html = signal<string | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      void this.load();
    });
    // Set directly: the frame is sandboxed without scripts, and the backend escapes every value.
    effect(() => {
      const html = this.html();
      if (html !== null) this.frame().nativeElement.srcdoc = html;
    });
  }

  protected print(): void {
    this.frame().nativeElement.contentWindow?.print();
  }

  private async load(): Promise<void> {
    try {
      this.html.set(await this.api.dossierHtml(this.caseId()));
    } catch {
      this.failed.set(true);
    }
  }
}
