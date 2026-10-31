import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, filter, switchMap } from 'rxjs';
import { Consent } from '../../consent/consent';
import { AdvisorDataSource, AdvisorEvent } from '../advisor-data-source';
import { caseProjection } from '../api/case-presenter';
import type { AdvisorContextUpdate } from '../contracts';
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
export type DigitalStop =
  | { readonly reason: 'human-handover'; readonly update: AdvisorContextUpdate }
  | { readonly reason: 'session-ended' };

/**
 * The single UI state of the current case, fed by `AdvisorDataSource`. Components read the
 * signals; only the data source writes. Late results that belong to an older input are dropped
 * by the version guard in `case-state.ts`.
 *
 * On every (re)connect the store loads a fresh snapshot (contracts 9.3, step 6). Events that
 * arrive while it loads are held back and applied on top of it, so nothing is lost and the
 * guard drops the ones the snapshot already contains.
 *
 * Before the user has consented (`Consent`), the store does not connect and drops every event
 * and snapshot, so no case data is processed without consent.
 */
@Injectable({ providedIn: 'root' })
export class CaseStore {
  private readonly source = inject(AdvisorDataSource);
  private readonly consent = inject(Consent);
  private readonly state = signal<CaseState>(initialCaseState());
  private readonly unreadIds = signal<UnreadIds>(noUnread());
  private readonly loadedState = signal(false);
  private readonly syncFailedState = signal(false);
  /** Events held back until a snapshot is applied; `null` while live. */
  private pending: AdvisorEvent[] | null = [];
  private generation = 0;
  private readonly stopCommands = new Subject<DigitalStop>();
  private readonly contextNotifications = new Subject<AdvisorContextUpdate>();

  /** Synchronous control plane: never waits for a snapshot, promise, or Angular effect. */
  readonly digitalStops = this.stopCommands.asObservable();
  /** Original backend notifications for diagnostics; financial views still read projections. */
  readonly contextUpdates = this.contextNotifications.asObservable();

  readonly connection = toSignal(this.source.connection, { initialValue: 'disconnected' });
  /** True once the first snapshot is applied. */
  readonly loaded = this.loadedState.asReadonly();
  /** The last snapshot request failed; live events still apply, the view may be incomplete. */
  readonly syncFailed = this.syncFailedState.asReadonly();

  readonly caseId = computed(() => this.state().data.caseId);
  readonly contextRevision = computed(() => this.state().data.contextRevision);
  readonly canonical = computed(() => this.state().data.canonical ?? null);
  readonly projection = computed(() => {
    const dto=this.canonical();return dto ? caseProjection(dto) : null;
  });
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
    destroyRef.onDestroy(() => { this.stopCommands.complete(); this.contextNotifications.complete(); });
    // Subscribe to events before the first snapshot request so no event slips through.
    this.source.events
      .pipe(
        filter(() => this.consent.granted()),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((event) => this.receive(event));
    this.source.connection
      .pipe(
        filter((state) => state === 'connected' && this.consent.granted()),
        switchMap(() => {
          this.pending ??= [];
          const generation=this.generation;
          return this.source.snapshot().pipe(
            filter(()=>generation===this.generation),
            catchError((error: unknown) => {
              if(generation!==this.generation)return EMPTY;
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

  /** Starts or resumes the live call. Does nothing before consent. */
  connect(): void {
    if (!this.consent.granted()) return;
    this.source.connect();
  }

  disconnect(): void {
    this.source.disconnect();
  }

  /** End of an authenticated case session: retained results and late reads lose their authority. */
  clear(): void {
    this.stopCommands.next({ reason: 'session-ended' });
    ++this.generation;
    this.disconnect();
    this.pending=[];
    this.state.set(initialCaseState());
    this.unreadIds.set(noUnread());
    this.loadedState.set(false);
    this.syncFailedState.set(false);
  }

  /** Reload after a case command. Canonical revision guards also cover late overlapping reads. */
  refresh(): void {
    if (!this.consent.granted()) return;
    const generation=this.generation;
    this.source.snapshot().subscribe({
      next: snapshot => {
        if(generation!==this.generation)return;
        this.commit(applyCaseSnapshot(this.state(),snapshot),this.loadedState());
        this.loadedState.set(true);this.syncFailedState.set(false);
      },
      error: () => {if(generation===this.generation)this.syncFailedState.set(true);},
    });
  }

  /** Call when the tab is shown, and again while it stays visible and its count rises. */
  markRead(tab: WorkspaceTab): void {
    if (this.unreadIds()[tab].size === 0) return;
    this.unreadIds.update((ids) => ({ ...ids, [tab]: new Set<string>() }));
  }

  private receive(event: AdvisorEvent): void {
    if (event.type === 'context') {
      // Stop goes first, even while the financial snapshot/event buffer is still loading.
      if (event.payload.handover?.stopDigitalConversation) {
        this.stopCommands.next({ reason: 'human-handover', update: event.payload });
      }
      this.contextNotifications.next(event.payload);
    }
    if (this.pending) {
      this.pending.push(event);
      return;
    }
    this.commit(applyCaseEvent(this.state(), event), true);
    if (event.type === 'context') this.refresh();
  }

  private flushPending(): void {
    const events = this.pending ?? [];
    this.pending = null;
    for (const event of events) this.commit(applyCaseEvent(this.state(), event), true);
    if (events.some(event=>event.type==='context')) this.refresh();
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
