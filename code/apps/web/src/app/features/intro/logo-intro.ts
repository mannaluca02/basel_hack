import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { PAX_LOGO_DOT, PAX_LOGO_LETTERS, PAX_LOGO_VIEWBOX } from '../../core/brand/pax-logo';

/** The "."'s closed eyes, in logo units (Dario's demo intro, fitted to the official dot). */
const EYES = [9.19, 24.55].map((x) => ({ x, y: 117.1, width: 6.2, height: 9, rx: 3.1 }));
/** Double blink before the zoom, then the eyes open while the "." flies to Paxi. */
const ZOOM_MS = 625;
const EYES_OPEN_MS = ZOOM_MS + 1000;
const EASING = 'cubic-bezier(.65, 0, .2, 1)';

/**
 * The entry before consent (FE-28, ported from `code/voice-agent/public/intro.js`): the .Pax logo
 * on Pax Purple, its "." asleep. `wake()` lets the "." blink twice, then zooms into it while it
 * becomes Paxi and lands on Paxi's body in the app. Decorative: the consent banner beside it
 * carries everything a screen reader needs.
 *
 * Without the Web Animations API (tests) or with reduced motion the logo only fades out.
 */
@Component({
  selector: 'app-logo-intro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <div class="backdrop" #backdrop></div>
    <svg class="logo" #logo [attr.viewBox]="viewBox" focusable="false">
      <path class="letters" #lettersPath [attr.d]="letters" />
      <g class="sleeper">
        <rect class="dot" #sleepingDot [attr.x]="dot.x" [attr.y]="dot.y" [attr.width]="dot.width" [attr.height]="dot.height" />
        @for (eye of eyes; track eye.x) {
          <rect class="eye" [attr.x]="eye.x" [attr.y]="eye.y" [attr.width]="eye.width" [attr.height]="eye.height" [attr.rx]="eye.rx" />
        }
      </g>
    </svg>
    <span class="morph" #morph>
      <span class="shine"></span>
      <span class="eyes" #morphEyes><i></i><i></i></span>
    </span>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 2;
      display: grid;
      place-items: center;
      // Above the consent banner, which takes the lower part of the screen.
      padding-bottom: min(30dvh, 14rem);
      overflow: hidden;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: var(--intro-bg);
    }

    .logo {
      position: relative;
      width: min(70vw, 32rem);
      height: auto;
      overflow: visible;
      transform-origin: 0 0;
    }

    .letters {
      fill: var(--logo-letters);
    }

    .dot {
      fill: var(--intro-dot);
    }

    .eye {
      fill: var(--intro-eye);
      transform: scaleY(0.2);
      transform-box: fill-box;
      transform-origin: center;
    }

    // Asleep: a small shiver now and then.
    .sleeper {
      transform-box: fill-box;
      transform-origin: center;
      animation: shiver 4.6s ease-in-out infinite;
    }

    :host(.running) .sleeper {
      visibility: hidden;
      animation: none;
    }

    // Laid out at Paxi's size and scaled down to the dot, so it only ever shrinks and stays sharp.
    .morph {
      position: fixed;
      display: none;
      background: var(--intro-dot);
      pointer-events: none;
      transform-origin: 0 0;

      &::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: var(--intro-paxi);
        opacity: 0;
      }
    }

    :host(.running) .morph {
      display: block;
    }

    :host(.landing) .morph::after {
      opacity: 1;
      transition: opacity 500ms ease;
    }

    .eyes {
      position: absolute;
      inset: 0;
      z-index: 1;

      i {
        position: absolute;
        top: 40%;
        left: 23%;
        width: 15.6%;
        height: 22%;
        border-radius: var(--radius-full);
        background: var(--intro-eye);
      }

      i + i {
        left: 61.5%;
      }
    }

    // Paxi's shine (ellipse 72/62, 22×11, −20° in the avatar), faded in before the handoff.
    .shine {
      position: absolute;
      z-index: 1;
      top: 9.17%;
      left: 8.33%;
      width: 36.67%;
      height: 18.33%;
      border-radius: 50%;
      background: var(--intro-dot);
      opacity: 0;
      transform: rotate(-20deg);
    }

    :host(.landing) .shine {
      opacity: 0.35;
      transition: opacity 600ms ease-in-out;
    }

    @keyframes shiver {
      0%, 38%, 52%, 100% { transform: translate(0, 0) rotate(0); }
      40%, 44%, 48% { transform: translate(-0.65px, 0.25px) rotate(-0.8deg); }
      42%, 46%, 50% { transform: translate(0.65px, -0.25px) rotate(0.8deg); }
    }

    @media (prefers-reduced-motion: reduce) {
      .sleeper {
        animation: none;
      }
    }
  `,
})
export class LogoIntro {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly backdrop = viewChild.required<ElementRef<HTMLElement>>('backdrop');
  private readonly logo = viewChild.required<ElementRef<SVGSVGElement>>('logo');
  private readonly lettersPath = viewChild.required<ElementRef<SVGPathElement>>('lettersPath');
  private readonly dotRect = viewChild.required<ElementRef<SVGRectElement>>('sleepingDot');
  private readonly morph = viewChild.required<ElementRef<HTMLElement>>('morph');
  private readonly morphEyes = viewChild.required<ElementRef<HTMLElement>>('morphEyes');

  protected readonly viewBox = PAX_LOGO_VIEWBOX;
  protected readonly letters = PAX_LOGO_LETTERS;
  protected readonly dot = PAX_LOGO_DOT;
  protected readonly eyes = EYES;

  private readonly animations: Animation[] = [];
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private finish: (() => void) | null = null;
  private waking: Promise<void> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.finish?.());
  }

  /**
   * Wakes the "." and flies it onto `target`, Paxi's body on screen. `reveal` shows the real
   * Paxi under the landing "."; the promise resolves when the intro is gone.
   */
  wake(target: DOMRect, reveal: () => void): Promise<void> {
    if (this.waking) return this.waking;
    this.waking = this.fly(target, reveal);
    return this.waking;
  }

  private fly(target: DOMRect, reveal: () => void): Promise<void> {
    const view = this.host.ownerDocument.defaultView;
    const reduced = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const dot = this.dotRect().nativeElement.getBoundingClientRect();
    // Nothing to fly to or from (hidden, not laid out yet): fade instead of scaling by infinity.
    const measurable = target.width > 0 && dot.width > 0 && dot.height > 0;
    if (typeof this.host.animate !== 'function' || reduced || !measurable) {
      reveal();
      if (typeof this.host.animate !== 'function') return Promise.resolve();
      return this.host
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'both' })
        .finished.then(() => undefined, () => undefined);
    }

    return new Promise((resolve) => {
      let revealed = false;
      const show = () => {
        if (!revealed) reveal();
        revealed = true;
      };
      this.finish = () => {
        this.finish = null;
        view?.removeEventListener('resize', onResize);
        this.timers.forEach(clearTimeout);
        this.animations.forEach((animation) => animation.cancel());
        show();
        resolve();
      };
      // A new layout moves Paxi away from where the "." would land: skip to the end.
      const onResize = () => this.finish?.();
      view?.addEventListener('resize', onResize);
      this.run(target, show);
      this.after(ZOOM_MS + 1530, () => this.finish?.());
    });
  }

  private run(target: DOMRect, reveal: () => void): void {
    const logo = this.logo().nativeElement;
    const dot = this.dotRect().nativeElement.getBoundingClientRect();
    const logoBox = logo.getBoundingClientRect();
    const morph = this.morph().nativeElement;
    const size = target.width;
    const sx = size / dot.width;
    const sy = size / dot.height;
    const dx = target.left - logoBox.left - (dot.left - logoBox.left) * sx;
    const dy = target.top - logoBox.top - (dot.top - logoBox.top) * sy;

    Object.assign(morph.style, {
      left: `${target.left}px`,
      top: `${target.top}px`,
      width: `${size}px`,
      height: `${size}px`,
    });
    // Class changes outside change detection: the animation reads layout right after.
    this.host.classList.add('running');

    // Wake-up: a rapid double blink in place, a short pause, then the eyes open while we zoom.
    this.animate(
      this.morphEyes().nativeElement,
      [
        { transform: 'scaleY(.2)', easing: 'ease-out' },
        { transform: 'scaleY(.85)', offset: 125 / EYES_OPEN_MS, easing: 'ease-in' },
        { transform: 'scaleY(.08)', offset: 250 / EYES_OPEN_MS, easing: 'ease-out' },
        { transform: 'scaleY(.85)', offset: 375 / EYES_OPEN_MS, easing: 'ease-in' },
        { transform: 'scaleY(.08)', offset: 500 / EYES_OPEN_MS },
        { transform: 'scaleY(.08)', offset: ZOOM_MS / EYES_OPEN_MS, easing: 'cubic-bezier(.3, 0, .2, 1)' },
        { transform: 'scaleY(1)' },
      ],
      EYES_OPEN_MS,
      0,
      'linear',
    );
    this.animate(
      logo,
      [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }],
      1270,
      ZOOM_MS,
    );
    this.animate(this.lettersPath().nativeElement, [{ opacity: 1 }, { opacity: 0 }], 650, ZOOM_MS + 170, 'ease');
    this.animate(
      morph,
      [
        {
          transform: `translate(${dot.left - target.left}px, ${dot.top - target.top}px) scale(${1 / sx}, ${1 / sy})`,
          borderRadius: '0',
        },
        { transform: 'none', borderRadius: `${(size * 34) / 120}px` },
      ],
      1270,
      ZOOM_MS,
    );
    // Hold the purple through the wake-up, then let the app appear around the landing square.
    this.animate(
      this.backdrop().nativeElement,
      [{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }],
      1450,
      ZOOM_MS - 180,
      'linear',
    );
    this.after(ZOOM_MS + 670, () => this.host.classList.add('landing'));
    this.after(ZOOM_MS + 1120, reveal);
    // Crossfade the waking face into the live expression.
    this.animate(morph, [{ opacity: 1 }, { opacity: 0 }], 260, ZOOM_MS + 1270, 'ease');
  }

  private animate(
    element: Element,
    frames: Keyframe[],
    duration: number,
    delay: number,
    easing = EASING,
  ): void {
    this.animations.push(element.animate(frames, { duration, delay, easing, fill: 'both' }));
  }

  private after(ms: number, work: () => void): void {
    this.timers.push(setTimeout(work, ms));
  }
}
