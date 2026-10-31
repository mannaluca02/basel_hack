import { inject } from '@angular/core';
import type { AdvisorContextUpdated } from '@pax/contracts';
import { BehaviorSubject, EMPTY, Observable, Subject, from, map } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { AppLanguage } from '../../i18n/language';
import {
  AdvisorDataSource,
  AdvisorEvent,
  AdvisorSnapshot,
  ConnectionState,
  emptySnapshot,
} from '../advisor-data-source';
import { CaseProjection, projectCase } from './case-projection';
import { projectInfo, projectSummary, projectTranscript } from './summary-projection';
import { CustomerApi } from './customer-api';

type Projection = CaseProjection &
  Pick<AdvisorSnapshot, 'transcript' | 'info' | 'summary'>;

/**
 * The advisor backend behind `dataSource: 'api'`. The backend's only live event says "the case
 * changed, reload it": this passes it on as a context event, reloads the case and pushes the
 * projected view models as upserts. `CustomerReview` does its own reloading.
 *
 * Besides the case it loads the summaries of the current snapshot (summary sheet, Info tab) and
 * the call history a linked voice agent recorded (Chat tab). Replies stay empty: the backend has
 * no reply route.
 */
export class ApiDataSource extends AdvisorDataSource {
  private readonly api = inject(CustomerApi);
  private readonly language = inject(AppLanguage);
  private readonly demoStart = inject(APP_ENVIRONMENT).demoStart === true;
  private starting: Promise<void> | null = null;
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
        transcript: projection.transcript,
        info: projection.info,
        summary: projection.summary,
      })),
    );
  }

  /**
   * Waits for a customer session; `CustomerReview` calls it again after the sign-in. In the demo
   * start the backend hands out its ready case first.
   */
  connect(): void {
    const caseId = this.api.session()?.caseId;
    if (!caseId && this.demoStart) {
      this.startDemo();
      return;
    }
    if (this.stream || !caseId) return;

    this.connectionState.next('connecting');
    const stream = new EventSource(this.api.eventsUrl(caseId), { withCredentials: true });
    stream.onopen = () => this.connectionState.next('connected');
    // The browser retries on its own unless the server refused the stream.
    stream.onerror = () => {
      if (stream.readyState !== EventSource.CLOSED) {
        this.connectionState.next('connecting');
        return;
      }
      this.disconnect();
      // A refused stream in the demo usually means the stored session expired: start again.
      if (this.demoStart) {
        this.api.clearSession();
        this.startDemo();
      }
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

  private startDemo(): void {
    if (this.starting) return;
    this.connectionState.next('connecting');
    this.starting = this.api
      .startDemo()
      .then(() => {
        this.starting = null;
        this.connect();
      })
      .catch((error: unknown) => {
        this.starting = null;
        console.error('ApiDataSource: the demo start failed; is the backend running with PAX_DEMO_START=1?', error);
        this.connectionState.next('disconnected');
      });
  }

  private async project(caseId: string): Promise<{ contextRevision: number; projection: Projection }> {
    // Only the case is required; the rest may not exist yet (no analysis, no voice agent).
    const [dto, context, summaries, turns, suitability] = await Promise.all([
      this.api.loadCase(caseId),
      this.api.loadContext(caseId).catch(() => null),
      this.api.loadSummaries(caseId).catch(() => null),
      this.api.loadAgentTurns(caseId).catch(() => []),
      this.api.loadSuitability(caseId).catch(() => null),
    ]);
    const language = this.language.language();
    const at = new Date().toISOString();
    const projection = projectCase(dto, context, language, at);
    return {
      contextRevision: dto.contextRevision,
      projection: {
        ...projection,
        transcript: projectTranscript(turns),
        info: projectInfo(dto, summaries, language),
        summary: projectSummary(dto, context, summaries, projection.risks, language, suitability),
      },
    };
  }

  private async push(caseId: string): Promise<void> {
    const reload = ++this.reloads;
    try {
      const { projection } = await this.project(caseId);
      if (reload !== this.reloads) return;
      if (projection.progress) this.eventStream.next({ type: 'progress', payload: projection.progress });
      for (const chart of projection.charts) this.eventStream.next({ type: 'chart', payload: chart });
      for (const risk of projection.risks) this.eventStream.next({ type: 'risk', payload: risk });
      for (const entry of projection.transcript) this.eventStream.next({ type: 'transcript', payload: entry });
      for (const item of projection.info) this.eventStream.next({ type: 'info', payload: item });
      if (projection.summary) this.eventStream.next({ type: 'summary', payload: projection.summary });
    } catch (error) {
      // The next context event or reconnect loads again.
      console.error('ApiDataSource: reloading the case failed', error);
    }
  }
}
