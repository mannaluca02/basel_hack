import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { CaseStore } from '../advisor/store/case-store';
import type { WorkspaceTab } from '../advisor/store/case-state';

/** `centre`: Paxi talks in the middle of the screen; `corner`: Paxi makes room for the content. */
export type PaxiSpot = 'centre' | 'corner';

/**
 * Where Paxi stands. Paxi starts in the centre and moves to the corner as soon as the shown
 * Graphics, Risks or Info tab has at least one item; the Chat tab never moves Paxi. Once in the
 * corner Paxi stays there, also on the Chat tab, until the case has no chart, risk or info any
 * more (a new case).
 */
@Injectable({ providedIn: 'root' })
export class PaxiPlacement {
  private readonly store = inject(CaseStore);

  /** The tab the router shows, set by the app shell; `null` before the first redirect. */
  readonly tab = signal<WorkspaceTab | null>(null);

  private readonly items = computed<Readonly<Record<WorkspaceTab, number>>>(() => ({
    graphics: this.store.charts().length,
    risks: this.store.risks().length,
    info: this.store.info().length,
    chat: 0,
  }));

  // Advances when read: the shell's template reads `spot` on every render, so "shown" means a tab
  // was on screen with items, not that items arrived between two renders.
  private readonly cornered = linkedSignal<{ shown: boolean; any: boolean }, boolean>({
    source: () => {
      const items = this.items();
      const tab = this.tab();
      return {
        shown: tab !== null && items[tab] > 0,
        any: items.graphics + items.risks + items.info > 0,
      };
    },
    computation: (now, before) => now.any && (now.shown || (before?.value ?? false)),
  });

  readonly spot = computed<PaxiSpot>(() => (this.cornered() ? 'corner' : 'centre'));
}
