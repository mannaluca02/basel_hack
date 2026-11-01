import { Injectable, signal } from '@angular/core';
import { LifeEventKind } from '../advisor/ui-models';

export interface SelectedLifeEvent {
  readonly eventId: string;
  readonly kind: LifeEventKind;
  readonly year: number;
  readonly label: string;
}

/**
 * The life event the reader picked on the timeline (FE-15). The other charts mark its year, and a
 * retirement selects the retirement scenario of the event-impact chart. It lives in the root
 * injector, so it survives tab switches.
 */
@Injectable({ providedIn: 'root' })
export class LifeEventSelection {
  private readonly state = signal<SelectedLifeEvent | null>(null);

  readonly selected = this.state.asReadonly();

  /** Picking the selected event again clears the selection. */
  toggle(event: SelectedLifeEvent): void {
    this.state.update((current) => (current?.eventId === event.eventId ? null : event));
  }
}
