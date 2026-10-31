import { inject } from '@angular/core';
import type { AdvisorContextUpdated } from '@pax/contracts';
import { BehaviorSubject, EMPTY, Observable, Subject, from, map } from 'rxjs';
import {
  AdvisorDataSource,
  AdvisorEvent,
  AdvisorSnapshot,
  ConnectionState,
  emptySnapshot,
} from '../advisor-data-source';
import { CustomerApi } from './customer-api';

/**
 * The advisor backend behind `dataSource: 'api'`. The backend's only live event says "the case
 * changed, reload it", so this carries context updates; `CustomerReview` does the reloading.
 *
 * ponytail: charts, risks, transcript and info stay empty because the backend has no routes for
 * them yet. Map them into `snapshot()` and `events` once it does.
 */
export class ApiDataSource extends AdvisorDataSource {
  private readonly api = inject(CustomerApi);
  private readonly eventStream = new Subject<AdvisorEvent>();
  private readonly connectionState = new BehaviorSubject<ConnectionState>('disconnected');
  private stream: EventSource | null = null;

  readonly events: Observable<AdvisorEvent> = this.eventStream.asObservable();
  readonly connection: Observable<ConnectionState> = this.connectionState.asObservable();

  snapshot(): Observable<AdvisorSnapshot> {
    const caseId = this.api.session()?.caseId;
    if (!caseId) return EMPTY;
    return from(this.api.loadCase(caseId)).pipe(
      map(({ id, contextRevision }) => ({ ...emptySnapshot(id), contextRevision })),
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
    });
    this.stream = stream;
  }

  disconnect(): void {
    this.stream?.close();
    this.stream = null;
    if (this.connectionState.value !== 'disconnected') this.connectionState.next('disconnected');
  }
}
