import { inject } from '@angular/core';
import type { AdvisorContextUpdated } from '@pax/contracts';
import { BehaviorSubject, EMPTY, Observable, Subject, from, map } from 'rxjs';
import { AppLanguage } from '../../i18n/language';
import {
  AdvisorDataSource,
  AdvisorEvent,
  AdvisorSnapshot,
  ConnectionState,
  emptySnapshot,
} from '../advisor-data-source';
import { CaseProjection, projectCase } from './case-projection';
import { CustomerApi } from './customer-api';

/**
 * The advisor backend behind `dataSource: 'api'`. The backend's only live event says "the case
 * changed, reload it": this passes it on as a context event, reloads the case and pushes the
 * projected charts, risks and progress as upserts. `CustomerReview` does its own reloading.
 *
 * Transcript, replies and info stay empty: the voice agent keeps its transcript, and the backend
 * has no reply or info routes.
 */
export class ApiDataSource extends AdvisorDataSource {
  private readonly api = inject(CustomerApi);
  private readonly language = inject(AppLanguage);
  private readonly eventStream = new Subject<AdvisorEvent>();
  private readonly connectionState = new BehaviorSubject<ConnectionState>('disconnected');
  private stream: EventSource | null = null;
  /** Only the newest reload may emit: an older one can answer last. */
  private reloads = 0;

  readonly events: Observable<AdvisorEvent> = this.eventStream.asObservable();
  readonly connection: Observable<ConnectionState> = this.connectionState.asObservable();

  snapshot(): Observable<AdvisorSnapshot> {
    const caseId = this.api.session()?.caseId;
    if (!caseId) return EMPTY;
    return from(this.project(caseId)).pipe(
      map(({ contextRevision, projection }) => ({
        ...emptySnapshot(caseId),
        contextRevision,
        charts: projection.charts,
        risks: projection.risks,
        progress: projection.progress,
      })),
    );
  }

  /** Waits for a customer session; `CustomerReview` calls it again after the sign-in. */
  connect(): void {
    const caseId = this.api.session()?.caseId;
    if (this.stream || !caseId) return;

    this.connectionState.next('connecting');
    const stream = new EventSource(this.api.eventsUrl(caseId), { withCredentials: true });
    stream.onopen = () => this.connectionState.next('connected');
    // The browser retries on its own unless the server refused the stream.
    stream.onerror = () => {
      if (stream.readyState === EventSource.CLOSED) this.disconnect();
      else this.connectionState.next('connecting');
    };
    stream.addEventListener('advisor.context.updated', ({ data }) => {
      const payload = JSON.parse(data as string) as AdvisorContextUpdated;
      this.eventStream.next({ type: 'context', payload });
      void this.push(caseId);
    });
    this.stream = stream;
  }

  disconnect(): void {
    this.stream?.close();
    this.stream = null;
    if (this.connectionState.value !== 'disconnected') this.connectionState.next('disconnected');
  }

  private async project(caseId: string): Promise<{ contextRevision: number; projection: CaseProjection }> {
    const [dto, context] = await Promise.all([
      this.api.loadCase(caseId),
      this.api.loadContext(caseId).catch(() => null),
    ]);
    return { contextRevision: dto.contextRevision, projection: projectCase(dto, context, this.language.language()) };
  }

  private async push(caseId: string): Promise<void> {
    const reload = ++this.reloads;
    try {
      const { projection } = await this.project(caseId);
      if (reload !== this.reloads) return;
      if (projection.progress) this.eventStream.next({ type: 'progress', payload: projection.progress });
      for (const chart of projection.charts) this.eventStream.next({ type: 'chart', payload: chart });
      for (const risk of projection.risks) this.eventStream.next({ type: 'risk', payload: risk });
    } catch (error) {
      // The next context event or reconnect loads again.
      console.error('ApiDataSource: reloading the case failed', error);
    }
  }
}
