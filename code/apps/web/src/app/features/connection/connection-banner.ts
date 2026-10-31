import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CaseStore } from '../../core/advisor/store/case-store';
import { VoiceCall } from '../../core/voice/voice-call';

/**
 * "Connection lost" (FE-20): once the live stream was up, any drop is shown above the tabs. While
 * it is down no update arrives, so the figures on screen may be outdated; the store loads the full
 * case again as soon as the stream is back. Before the first connection nothing is shown.
 */
@Component({
  selector: 'app-connection-banner',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lost()) {
      <p class="banner" role="status">
        <span>
          @if (store.connection() === 'connecting') {
            {{ 'connection.reconnecting' | transloco }}
          } @else {
            {{ 'connection.lost' | transloco }}
          }
          {{ 'connection.paused' | transloco }}
        </span>
        @if (store.connection() === 'disconnected') {
          <button type="button" class="retry" (click)="store.connect()">
            {{ 'connection.retry' | transloco }}
          </button>
        }
      </p>
    }
  `,
  styles: `
    .banner {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      align-items: center;
      justify-content: space-between;
      margin: 0 0 1rem;
      padding: 0.5rem 0.75rem;
      border-left: var(--stroke-m) solid var(--border-warning);
      color: var(--text-warning);
      background: var(--bg-warning);
    }

    .retry {
      padding: 0.25rem 0.75rem;
      border: var(--stroke-s) solid currentColor;
      border-radius: var(--radius-sm);
      color: inherit;
      background: none;
      font: inherit;
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }
  `,
})
export class ConnectionBanner {
  protected readonly store = inject(CaseStore);
  private readonly wasConnected = signal(false);

  private readonly call = inject(VoiceCall);

  /** A call the customer ended on purpose is no lost connection. */
  protected readonly lost = computed(
    () => this.wasConnected() && this.store.connection() !== 'connected' && !this.call.endedByUser(),
  );

  constructor() {
    effect(() => {
      if (this.store.connection() === 'connected') this.wasConnected.set(true);
    });
  }
}
