import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

interface NoticeSection {
  readonly id: string;
  /** Translation keys. */
  readonly title: string;
  readonly body: string;
}

/**
 * Privacy notice shown before the first session (DSG/FADP, project rule 7). The notice and the
 * consent are separate: the sections inform, only the checkbox enables "Start advice".
 * Storing the consent and starting the call is up to the parent, see `App`.
 */
@Component({
  selector: 'app-consent-screen',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'consent.title' | transloco }}</h1>
    <p class="intro">{{ 'consent.intro' | transloco }}</p>

    @for (section of sections; track section.id) {
      <section class="section">
        <h2>{{ section.title | transloco }}</h2>
        <p>{{ section.body | transloco }}</p>
      </section>
    }

    <p class="session">{{ 'consent.session' | transloco }}</p>

    <label class="agree">
      <input type="checkbox" [checked]="agreed()" (change)="toggle($event)" />
      <span>{{ 'consent.agree' | transloco }}</span>
    </label>

    <button type="button" class="start" [disabled]="!agreed()" (click)="start()">
      {{ 'consent.start' | transloco }}
    </button>
  `,
  styles: `
    :host {
      display: block;
      max-width: 40rem;
      margin: 0 auto;
    }

    h1 {
      margin: 0.5rem 0 0.75rem;
    }

    h2 {
      margin: 0 0 0.25rem;
      font-size: 1rem;
    }

    p {
      margin: 0;
      line-height: 1.5;
    }

    .intro {
      margin-bottom: 1.25rem;
    }

    .section {
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
      border-left: var(--stroke-m) solid var(--border-focusring);
      border-radius: var(--radius-sm);
      background: var(--bg-muted);
    }

    .session {
      margin: 1.25rem 0;
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .agree {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      line-height: 1.5;
      cursor: pointer;

      input {
        flex: none;
        width: 1.25rem;
        height: 1.25rem;
        margin: 0.125rem 0 0;
        accent-color: var(--bg-brand-purple);
      }
    }

    .start {
      width: 100%;
      min-height: 2.75rem;
      padding: 0.625rem 1.25rem;
      border: 0;
      border-radius: var(--radius-full);
      color: var(--text-on-brand);
      background: var(--bg-brand);
      font: inherit;
      font-weight: 700;
      cursor: pointer;

      &:disabled {
        color: var(--text-muted);
        background: var(--bg-muted);
        cursor: not-allowed;
      }
    }

    @media (min-width: 768px) {
      .start {
        width: auto;
      }
    }
  `,
})
export class ConsentScreen {
  /** The user has agreed and pressed "Start advice". */
  readonly started = output<void>();

  protected readonly agreed = signal(false);

  protected readonly sections: readonly NoticeSection[] = [
    { id: 'recorded', title: 'consent.recorded.title', body: 'consent.recorded.body' },
    { id: 'ai', title: 'consent.ai.title', body: 'consent.ai.body' },
    { id: 'demo', title: 'consent.demo.title', body: 'consent.demo.body' },
    { id: 'human', title: 'consent.human.title', body: 'consent.human.body' },
  ];

  protected toggle(event: Event): void {
    this.agreed.set((event.target as HTMLInputElement).checked);
  }

  protected start(): void {
    if (this.agreed()) this.started.emit();
  }
}
