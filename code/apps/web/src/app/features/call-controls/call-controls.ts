import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { VoiceCall } from '../../core/voice/voice-call';

/**
 * Minimal controls for the voice call (FE-10): start or end, mute, stop speaking. They only talk
 * to `VoiceCall`. With Paxi the voice notice comes first, and the person starts talking in Paxi's
 * window.
 */
@Component({
  selector: 'app-call-controls',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" role="group" [attr.aria-label]="'call.label' | transloco">
      @switch (call.state()) {
        @case ('notice') {
          <div class="notice">
            <p>{{ call.notice()?.text }}</p>
            <button type="button" class="action action--primary" (click)="call.confirm()">
              {{ 'call.openPaxi' | transloco }}
            </button>
            <button type="button" class="action" (click)="call.cancel()">
              {{ 'call.cancel' | transloco }}
            </button>
          </div>
        }
        @case ('active') {
          <span class="state">
            {{ (call.viaPaxi ? 'call.activePaxi' : 'call.active') | transloco }}
          </span>
          <button
            type="button"
            class="action"
            [attr.aria-pressed]="call.muted()"
            (click)="call.toggleMute()"
          >
            {{ (call.muted() ? 'call.unmute' : 'call.mute') | transloco }}
          </button>
          @if (call.viaPaxi) {
            <button type="button" class="action" (click)="call.stopSpeaking()">
              {{ 'call.stopSpeaking' | transloco }}
            </button>
          }
          <button type="button" class="action action--end" (click)="call.end()">
            {{ 'call.end' | transloco }}
          </button>
        }
        @default {
          <button type="button" class="action action--primary" (click)="call.start()">
            {{ (call.viaPaxi ? 'call.startPaxi' : 'call.start') | transloco }}
          </button>
        }
      }
    </div>
  `,
  styles: `
    .bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin: 0 0 1rem;
    }

    .state {
      margin-right: auto;
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .notice {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      padding: 0.75rem;
      border-radius: var(--radius-sm);
      background: var(--bg-muted);
    }

    .notice p {
      flex-basis: 100%;
      margin: 0;
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

    .action[aria-pressed='true'] {
      color: var(--text-warning);
      background: var(--bg-warning);
    }

    .action--primary {
      border-color: var(--bg-brand);
      color: var(--text-on-brand);
      background: var(--bg-brand);
    }

    .action--end {
      border-color: var(--border-error);
      color: var(--text-error);
    }
  `,
})
export class CallControls {
  protected readonly call = inject(VoiceCall);
}
