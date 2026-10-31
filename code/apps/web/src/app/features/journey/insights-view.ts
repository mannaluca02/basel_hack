import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Insights, JourneyApi } from '../../core/advisor/api/journey-api';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';

/** Stage labels in funnel order; translation keys in full for the i18n check. */
const STAGES = [
  { id: 'intake', label: 'insights.stage.intake' },
  { id: 'profile_confirmed', label: 'insights.stage.profile_confirmed' },
  { id: 'analysis', label: 'insights.stage.analysis' },
  { id: 'recommendation', label: 'insights.stage.recommendation' },
  { id: 'application_submitted', label: 'insights.stage.application_submitted' },
  { id: 'demo_policy', label: 'insights.stage.demo_policy' },
] as const;

/**
 * Product management insights (Nice-to-have): where cases are, where they may drop off, NPS and
 * requests for a human advisor, over all demo cases. Aggregates only: no amounts, no free text,
 * no person. In the demo start the backend reads them with the demo reviewer account.
 */
@Component({
  selector: 'app-insights-view',
  imports: [TranslocoPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="insights" aria-labelledby="insights-title">
      <h1 id="insights-title">{{ 'insights.title' | transloco }}</h1>
      <p class="note">{{ 'insights.intro' | transloco }}</p>

      @if (!demoStart || failed()) {
        <p>{{ 'insights.unavailable' | transloco }}</p>
      } @else if (data(); as d) {
        <dl class="figures">
          <div>
            <dt>{{ 'insights.cases' | transloco }}</dt>
            <dd>{{ d.caseCount }}</dd>
          </div>
          <div>
            <dt>{{ 'insights.nps' | transloco }}</dt>
            <dd>
              @if (d.nps.score === null) {
                {{ 'insights.noNps' | transloco }}
              } @else {
                {{ d.nps.score }}
                <small>{{ 'insights.responses' | transloco: { count: d.nps.responses } }}</small>
              }
            </dd>
          </div>
          <div>
            <dt>{{ 'insights.handover' | transloco }}</dt>
            <dd>{{ d.humanHandover.requested }}</dd>
          </div>
        </dl>

        <table class="funnel">
          <thead>
            <tr>
              <th scope="col">{{ 'insights.stages' | transloco }}</th>
              <th scope="col">{{ 'insights.cases' | transloco }}</th>
              <th scope="col">{{ 'insights.dropoffs' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (stage of stages; track stage.id) {
              <tr>
                <th scope="row">{{ stage.label | transloco }}</th>
                <td>{{ d.currentStageCounts[stage.id] ?? 0 }}</td>
                <td>{{ d.potentialDropoffs[stage.id] ?? 0 }}</td>
              </tr>
            }
          </tbody>
        </table>
        <p class="note">{{ 'insights.dropoffNote' | transloco }}</p>

        @if (reasons().length) {
          <h2>{{ 'insights.reasons' | transloco }}</h2>
          <ul class="reasons">
            @for (reason of reasons(); track reason.code) {
              <li>
                <code>{{ reason.code }}</code> {{ reason.count }}
              </li>
            }
          </ul>
        }
      }

      <p>
        <a class="link" routerLink="/journey">{{ 'insights.back' | transloco }}</a>
      </p>
    </section>
  `,
  styles: `
    .insights {
      display: grid;
      gap: 1rem;
      max-width: 48rem;
      padding: 1rem;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: var(--font-weight-bold);
    }

    h2 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: var(--font-weight-bold);
    }

    p {
      margin: 0;
    }

    .note {
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .figures {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 0.75rem;
      margin: 0;

      div {
        padding: 0.75rem;
        border-radius: var(--radius-m);
        background: var(--bg-muted);
      }

      dt {
        color: var(--text-muted);
        font-size: 0.875rem;
      }

      dd {
        margin: 0.25rem 0 0;
        font-size: 1.5rem;
        font-weight: var(--font-weight-bold);
      }

      small {
        display: block;
        color: var(--text-muted);
        font-size: 0.8125rem;
        font-weight: var(--font-weight-regular);
      }
    }

    .funnel {
      width: 100%;
      border-collapse: collapse;

      th,
      td {
        padding: 0.5rem;
        border-bottom: var(--stroke-border) solid var(--border-soft);
        text-align: left;
      }

      td {
        text-align: right;
      }
    }

    .reasons {
      margin: 0;
      padding-left: 1.25rem;
    }

    .link {
      color: var(--text-brand);
    }
  `,
})
export class InsightsView {
  private readonly api = inject(JourneyApi);
  protected readonly demoStart = inject(APP_ENVIRONMENT).demoStart === true;
  protected readonly stages = STAGES;
  protected readonly data = signal<Insights | null>(null);
  protected readonly failed = signal(false);
  protected readonly reasons = computed(() =>
    Object.entries(this.data()?.blockingReasons ?? {})
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  );

  constructor() {
    if (this.demoStart)
      this.api.insights().then(
        (insights) => this.data.set(insights),
        () => this.failed.set(true),
      );
  }
}
