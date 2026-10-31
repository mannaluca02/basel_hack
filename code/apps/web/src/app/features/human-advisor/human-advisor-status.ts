import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { HumanAdvisor } from '../../core/advisor/api/human-advisor';

/**
 * The way to a human advisor (FE-10, rule 5), kept unobtrusive: in the summary sheet (`sheet`) a
 * quiet text link offers it, and once help was asked for a muted note above the tabs (`banner`)
 * shows Pax's public contact. Nothing dials or books by itself.
 */
@Component({
  selector: 'app-human-advisor-status',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (advisor.requested()) {
      <div class="status" role="status">
        <p>
          {{ 'human.requested' | transloco }}
          <a [href]="'tel:' + advisor.contact().phone">{{ advisor.contact().displayPhone }}</a>
        </p>
        <button type="button" class="action" [disabled]="advisor.busy()" (click)="advisor.resume()">
          {{ 'human.resume' | transloco }}
        </button>
      </div>
    } @else if (placement() === 'sheet') {
      <p class="offer">
        {{ 'human.prompt' | transloco }}
        <button type="button" class="link" [disabled]="advisor.busy()" (click)="advisor.request()">
          {{ 'human.request' | transloco }}
        </button>
      </p>
    }
    @if (advisor.failed()) {
      <p class="failed" role="alert">{{ 'human.failed' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .status {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1rem;
      align-items: center;
      justify-content: space-between;
      margin: 0 0 1rem;
      padding: 0.375rem 0.75rem;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      background: var(--bg-muted);
      font-size: 0.875rem;
    }

    .offer {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .link {
      padding: 0;
      border: 0;
      color: inherit;
      background: none;
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }

    .status p {
      margin: 0;
    }

    .status a {
      color: inherit;
      font-weight: 700;
    }

    .action {
      padding: 0.125rem 0.5rem;
      border: var(--stroke-s) solid var(--border-soft);
      border-radius: var(--radius-sm);
      color: inherit;
      background: none;
      font: inherit;
      cursor: pointer;
    }

    .failed {
      margin: 0.5rem 0 0;
      color: var(--text-error);
    }
  `,
})
export class HumanAdvisorStatus {
  readonly placement = input<'banner' | 'sheet'>('banner');
  protected readonly advisor = inject(HumanAdvisor);
}
