import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ProgressSnapshot } from '../../core/advisor/contracts';
import type { AgentActivity } from '../../core/advisor/ui-models';
import type { PaxiSpot } from '../../core/paxi/paxi-placement';
import { AgentDock } from '../agent-dock/agent-dock';
import { PaxiAvatar } from './paxi-avatar';

/** Share of the renderer's 200-unit viewBox that Paxi's body covers (40…160). */
const BODY_SHARE = 0.6;

/**
 * The one Paxi of the app, in a layer above the Dynamic View. In the centre Paxi talks, with the
 * latest line as a caption below; in the corner Paxi makes room for charts, risks and info. Paxi
 * moves between both by layout, so the renderer, its audio and its expression carry on.
 *
 * Paxi is the agent dock: the ring shows the captured information, a tap opens the summary.
 * The parent sizes the spots with `--paxi-top`, `--paxi-centre`, `--paxi-corner`, `--paxi-gap`.
 */
@Component({
  selector: 'app-paxi-stage',
  imports: [AgentDock, PaxiAvatar, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-spot]': 'spot()', '[class.veiled]': 'veiled()' },
  template: `
    <app-agent-dock class="paxi" [progress]="progress()" [activity]="activity()">
      <app-paxi-avatar [activity]="activity()" [audio]="audio()" />
    </app-agent-dock>
    @if (caption(); as caption) {
      <p class="caption">{{ caption }}</p>
    } @else if (hint()) {
      <p class="caption hint">{{ 'paxi.hint' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      position: relative;
      container-type: size;
      pointer-events: none;
    }

    .paxi {
      position: absolute;
      top: var(--paxi-top);
      left: calc(50cqw - var(--paxi-centre) / 2);
      width: var(--paxi-centre);
      height: var(--paxi-centre);
      pointer-events: auto;
      transition-property: top, left, width, height, opacity;
      // Slow enough to follow with the eye as Paxi makes room for the content.
      transition-duration: 900ms;
      transition-timing-function: cubic-bezier(0.65, 0, 0.2, 1);
    }

    :host([data-spot='corner']) .paxi {
      top: calc(100cqh - var(--paxi-corner) - var(--paxi-gap));
      left: calc(100cqw - var(--paxi-corner) - var(--paxi-gap));
      width: var(--paxi-corner);
      height: var(--paxi-corner);
    }

    // Under the logo intro until the waking "." has landed on Paxi.
    :host(.veiled) .paxi {
      opacity: 0;
      transition: none;
    }

    // Three lines at most; the Chat tab keeps the whole conversation.
    .caption {
      position: absolute;
      top: calc(var(--paxi-top) + var(--paxi-centre) + 0.75rem);
      left: 50%;
      display: -webkit-box;
      width: min(36rem, calc(100cqw - 2rem));
      margin: 0;
      overflow: hidden;
      color: var(--text-default);
      font-size: 1.0625rem;
      line-height: 1.45;
      text-align: center;
      transform: translateX(-50%);
      transition: opacity 200ms ease-out;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }

    .hint {
      color: var(--text-muted);
    }

    :host([data-spot='corner']) .caption,
    :host(.veiled) .caption {
      visibility: hidden;
      opacity: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      .paxi,
      .caption {
        transition: none;
      }
    }
  `,
})
export class PaxiStage {
  readonly spot = input<PaxiSpot>('centre');
  readonly progress = input<ProgressSnapshot | null>(null);
  readonly activity = input<AgentActivity>('idle');
  readonly audio = input<MediaStream | null>(null);
  readonly caption = input<string | null>(null);
  /** Without a caption: how to start talking (no call runs, e.g. after a reload). */
  readonly hint = input(false);
  /** Hidden under the logo intro. */
  readonly veiled = input(false);

  private readonly avatar = viewChild.required(PaxiAvatar, { read: ElementRef });

  /** Where Paxi's body is on screen: the square the intro's "." lands on. */
  bodyRect(): DOMRect {
    const box = (this.avatar().nativeElement as HTMLElement).getBoundingClientRect();
    const size = box.width * BODY_SHARE;
    return new DOMRect(
      box.left + (box.width - size) / 2,
      box.top + (box.height - size) / 2,
      size,
      size,
    );
  }
}
