import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { HumanAdvisor } from '../../core/advisor/api/human-advisor';

/**
 * The way to a human advisor (FE-10, rule 5). As `banner` it appears above the tabs once help was
 * asked for; in the summary sheet (`sheet`) it also offers the request itself. It shows Pax's
 * public contact; nothing dials or books by itself.
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
      <button
        type="button"
        class="action action--primary"
        [disabled]="advisor.busy()"
        (click)="advisor.request()"
      >
        {{ 'human.request' | transloco }}
      </button>
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
      gap: 0.5rem 1rem;
      align-items: center;
      justify-content: space-between;
      margin: 0 0 1rem;
      padding: 0.5rem 0.75rem;
      border-left: var(--stroke-m) solid var(--border-info);
      color: var(--text-info);
      background: var(--bg-info);
    }

    .status p {
      margin: 0;
    }

    .status a {
      color: inherit;
      font-weight: 700;
    }

    .action {
      padding: 0.375rem 0.875rem;
      border: var(--stroke-s) solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-default);
      background: var(--bg-default);
      font: inherit;
      cursor: pointer;
    }

    .action--primary {
      border-color: var(--bg-brand);
      color: var(--text-on-brand);
      background: var(--bg-brand);
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
