import { DestroyRef, Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject, defer, of } from 'rxjs';
import { AppLanguage } from '../../i18n/language';
import {
  AdvisorDataSource,
  AdvisorEvent,
  AdvisorSnapshot,
  ConnectionState,
} from '../advisor-data-source';
import { MOCK_CALL_SCRIPT, MOCK_CASE_ID, ScriptStep } from './mock-call-script';

/**
 * Replays the scripted synthetic call on a timer, standing in for the advisor backend.
 * Texts are generated in the UI language at emit time, like a backend answering with the
 * requested `Accept-Language`. `disconnect()` pauses the call clock; `connect()` resumes it.
 */
@Injectable()
export class MockDataSource extends AdvisorDataSource {
  private readonly appLanguage = inject(AppLanguage);
  private readonly script: readonly ScriptStep[] = MOCK_CALL_SCRIPT;

  private readonly eventStream = new Subject<AdvisorEvent>();
  private readonly connectionState = new BehaviorSubject<ConnectionState>('disconnected');
  readonly events = this.eventStream.asObservable();
  readonly connection = this.connectionState.asObservable();

  private state: AdvisorSnapshot = emptySnapshot(MOCK_CASE_ID);
  private nextStep = 0;
  /** Call time played before the current connection. */
  private playedMs = 0;
  private connectedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.eventStream.complete();
      this.connectionState.complete();
    });
  }

  /** Total length of the scripted call. */
  get durationMs(): number {
    return this.script.at(-1)?.atMs ?? 0;
  }

  snapshot(): Observable<AdvisorSnapshot> {
    return defer(() => of(this.state));
  }

  connect(): void {
    if (this.connectionState.value === 'connected') return;
    this.connectedAt = Date.now();
    this.connectionState.next('connected');
    this.scheduleNext();
  }

  disconnect(): void {
    if (this.connectionState.value !== 'connected') return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.playedMs = this.elapsedMs();
    this.connectionState.next('disconnected');
  }

  private elapsedMs(): number {
    return this.playedMs + (Date.now() - this.connectedAt);
  }

  private scheduleNext(): void {
    const step = this.script[this.nextStep];
    if (!step) return;
    this.timer = setTimeout(() => this.emitDue(), Math.max(0, step.atMs - this.elapsedMs()));
  }

  /** Emits every step that is due; several steps can share one offset. */
  private emitDue(): void {
    const elapsed = this.elapsedMs();
    while (this.nextStep < this.script.length && this.script[this.nextStep].atMs <= elapsed) {
      const index = this.nextStep++;
      const event = this.script[index].build({
        language: this.appLanguage.language(),
        locale: this.appLanguage.locale(),
        at: new Date().toISOString(),
        messageId: `message_mock_${index + 1}`,
      });
      this.state = applyEvent(this.state, event);
      this.eventStream.next(event);
    }
    this.scheduleNext();
  }
}

export function emptySnapshot(caseId: string): AdvisorSnapshot {
  return {
    caseId,
    contextRevision: 0,
    agent: { activity: 'idle', at: new Date(0).toISOString() },
    progress: null,
    transcript: [],
    replies: [],
    charts: [],
    risks: [],
    info: [],
    analysis: null,
    summary: null,
  };
}

/**
 * The mock backend's own state, so `snapshot()` can answer like the real one. Not the UI store:
 * the version guard against late results lives in FE-05.
 */
export function applyEvent(state: AdvisorSnapshot, event: AdvisorEvent): AdvisorSnapshot {
  switch (event.type) {
    case 'agent':
      return { ...state, agent: event.payload };
    case 'transcript':
      return { ...state, transcript: upsert(state.transcript, event.payload, (e) => e.entryId) };
    case 'reply':
      return { ...state, replies: upsert(state.replies, event.payload, (r) => r.replyId) };
    case 'progress':
      return { ...state, progress: event.payload };
    case 'analysis':
      return { ...state, analysis: event.payload };
    case 'chart':
      return { ...state, charts: upsert(state.charts, event.payload, (c) => c.chartId) };
    case 'risk':
      return { ...state, risks: upsert(state.risks, event.payload, (r) => r.riskId) };
    case 'info':
      return { ...state, info: upsert(state.info, event.payload, (i) => i.infoId) };
    case 'summary':
      return { ...state, summary: event.payload };
    case 'context':
      return { ...state, contextRevision: event.payload.contextRevision };
  }
}

/** Replaces the item with the same id in place, or appends it. */
function upsert<T>(items: readonly T[], item: T, id: (value: T) => string): readonly T[] {
  const index = items.findIndex((existing) => id(existing) === id(item));
  if (index === -1) return [...items, item];
  return items.map((existing, i) => (i === index ? item : existing));
}
