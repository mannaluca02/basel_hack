import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ImpactEventKind } from '../advisor/ui-models';

/** A chart card to show in the Graphics tab, and the life-event scenario it should select. */
export interface ChartTarget {
  readonly chartId: string;
  /** Selects the first scenario of this event on an event-impact chart; ignored by other charts. */
  readonly event?: ImpactEventKind;
}

/**
 * "Show in Graphics" from another tab (FE-16). `show` stores the target and opens the Graphics
 * tab; the Graphics tab takes the target once its view is shown and its scroll offset restored,
 * then scrolls to the card and highlights it.
 */
@Injectable({ providedIn: 'root' })
export class ChartJump {
  private readonly router = inject(Router);
  private readonly target = signal<ChartTarget | null>(null);

  /** The target not yet taken by the Graphics tab. */
  readonly pending = this.target.asReadonly();

  show(target: ChartTarget): void {
    // A new object, so the same target twice in a row still notifies.
    this.target.set({ ...target });
    void this.router.navigateByUrl('/graphics');
  }

  take(): ChartTarget | null {
    const target = this.target();
    this.target.set(null);
    return target;
  }
}
