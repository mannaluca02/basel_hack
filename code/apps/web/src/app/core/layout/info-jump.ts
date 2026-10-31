import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/**
 * "Show in Info" from a risk row or a chart card (FE-18). `show` stores the info card and opens
 * the Info tab; the Info tab takes the target once its view is shown and its scroll offset
 * restored, then opens the card, scrolls to it and highlights it.
 */
@Injectable({ providedIn: 'root' })
export class InfoJump {
  private readonly router = inject(Router);
  private readonly target = signal<{ readonly infoId: string } | null>(null);

  /** The target not yet taken by the Info tab. */
  readonly pending = this.target.asReadonly();

  show(infoId: string): void {
    // A new object, so the same target twice in a row still notifies.
    this.target.set({ infoId });
    void this.router.navigateByUrl('/info');
  }

  take(): string | null {
    const target = this.target();
    this.target.set(null);
    return target?.infoId ?? null;
  }
}
