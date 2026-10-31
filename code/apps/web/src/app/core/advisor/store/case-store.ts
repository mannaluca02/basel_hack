import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, filter, switchMap } from 'rxjs';
import { AdvisorDataSource, AdvisorEvent } from '../advisor-data-source';
import {
  CaseState,
  CaseTransition,
  WORKSPACE_TABS,
  WorkspaceTab,
  applyCaseEvent,
  applyCaseSnapshot,
  initialCaseState,
} from './case-state';

type UnreadIds = Readonly<Record<WorkspaceTab, ReadonlySet<string>>>;

/**
 * The single UI state of the current case, fed by `AdvisorDataSource`. Components read the
 * signals; only the data source writes. Late results that belong to an older input are dropped
 * by the version guard in `case-state.ts`.
 *
 * On every (re)connect the store loads a fresh snapshot (contracts 9.3, step 6). Events that
 * arrive while it loads are held back and applied on top of it, so nothing is lost and the
 * guard drops the ones the snapshot already contains.
 */
@Injectable({ providedIn: 'root' })
export class CaseStore {
  private readonly source = inject(AdvisorDataSource);
  private readonly state = signal<CaseState>(initialCaseState());
  private readonly unreadIds = signal<UnreadIds>(noUnread());
  private readonly loadedState = signal(false);
  private readonly syncFailedState = signal(false);
  /** Events held back until a snapshot is applied; `null` while live. */
  private pending: AdvisorEvent[] | null = [];

  readonly connection = toSignal(this.source.connection, { initialValue: 'disconnected' });
  /** True once the first snapshot is applied. */
  readonly loaded = this.loadedState.asReadonly();
  /** The last snapshot request failed; live events still apply, the view may be incomplete. */
  readonly syncFailed = this.syncFailedState.asReadonly();

  readonly caseId = computed(() => this.state().data.caseId);
  readonly contextRevision = computed(() => this.state().data.contextRevision);
  readonly agent = computed(() => this.state().data.agent);
  readonly progress = computed(() => this.state().data.progress);
  readonly transcript = computed(() => this.state().data.transcript);
  readonly replies = computed(() => this.state().data.replies);
  /** Keyed by chartId, in order of first appearance: the feed order of the Graphics tab. */
  readonly charts = computed(() => this.state().data.charts);
  readonly risks = computed(() => this.state().data.risks);
  readonly info = computed(() => this.state().data.info);
  readonly analysis = computed(() => this.state().data.analysis);
  readonly summary = computed(() => this.state().data.summary);

  /**
   * Items added or changed per tab since the tab was last marked read, for the live update dots.
   * Several updates to the same item count once.
   */
  readonly unread = computed(() => {
    const ids = this.unreadIds();
    return Object.fromEntries(WORKSPACE_TABS.map((tab) => [tab, ids[tab].size])) as Readonly<
      Record<WorkspaceTab, number>
    >;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Subscribe to events before the first snapshot request so no event slips through.
    this.source.events
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((event) => this.receive(event));
    this.source.connection
      .pipe(
        filter((state) => state === 'connected'),
        switchMap(() => {
          this.pending ??= [];
          return this.source.snapshot().pipe(
            catchError((error: unknown) => {
              console.error('CaseStore: loading the case snapshot failed', error);
              this.syncFailedState.set(true);
              this.flushPending();
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((snapshot) => {
        // The first snapshot is the starting point, not news for the unread counters.
        this.commit(applyCaseSnapshot(this.state(), snapshot), this.loadedState());
        this.loadedState.set(true);
        this.syncFailedState.set(false);
        this.flushPending();
      });
  }

  /** Starts or resumes the live call. */
  connect(): void {
    this.source.connect();
  }

  disconnect(): void {
    this.source.disconnect();
  }

  /** Call when the tab is shown, and again while it stays visible and its count rises. */
  markRead(tab: WorkspaceTab): void {
    if (this.unreadIds()[tab].size === 0) return;
    this.unreadIds.update((ids) => ({ ...ids, [tab]: new Set<string>() }));
  }

  private receive(event: AdvisorEvent): void {
    if (this.pending) {
      this.pending.push(event);
      return;
    }
    this.commit(applyCaseEvent(this.state(), event), true);
  }

  private flushPending(): void {
    const events = this.pending ?? [];
    this.pending = null;
    for (const event of events) this.commit(applyCaseEvent(this.state(), event), true);
  }

  private commit({ state, changes }: CaseTransition, countUnread: boolean): void {
    this.state.set(state);
    if (!countUnread || changes.length === 0) return;
    this.unreadIds.update((ids) => {
      const next = { ...ids };
      for (const { tab, id } of changes) next[tab] = new Set(next[tab]).add(id);
      return next;
    });
  }
}

function noUnread(): UnreadIds {
  return { graphics: new Set(), risks: new Set(), chat: new Set(), info: new Set() };
}
