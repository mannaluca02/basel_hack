import { HttpTestingController } from '@angular/common/http/testing';
import type { AdvisorContext, CustomerConfirmation, InsuranceCaseDto } from '@pax/contracts';
import batchConfirmationJson from '../../../../../../../fixtures/voice-confirmation/batch-confirmation.v1.json';
import dialogue from '../../../../../../../fixtures/voice-confirmation/dialogue-awaiting-acceptance.v1.json';
import extractor from '../../../../../../../fixtures/voice-confirmation/extractor-awaiting-acceptance.v1.json';
import profileConfirmationJson from '../../../../../../../fixtures/voice-confirmation/profile-confirmation.v1.json';

/**
 * The specs run on the JSON the real backend produced for the journey "119'000 CHF gross → package
 * → acceptance → profile confirmation" (frozen JSON in `code/fixtures/voice-confirmation`), not on hand-made
 * look-alikes. Only imported by specs.
 */
export const CASE_ID = extractor.caseId;
export const BATCH_ID = '033d2fbd-7a5d-42f0-a111-3d9bca269573';
export const QUESTION_TEXT = batchConfirmationJson.questionText;

export function reviewCase(overrides: Partial<InsuranceCaseDto> = {}): InsuranceCaseDto {
  const { locale, caseRevision, contextRevision, draft, draftDirty, proposalBatches, ambiguities } =
    extractor;
  return {
    id: CASE_ID,
    locale,
    caseRevision,
    contextRevision,
    draft,
    draftDirty,
    proposalBatches,
    ambiguities,
    confirmedVersions: [{ version: 1, draft, confirmedAt: '2026-10-31T10:00:00.000Z' }],
    runs: [], estimates: [], activeRunId: null,
    createdAt: '2026-10-31T10:00:00.000Z', updatedAt: '2026-10-31T10:00:00.000Z',
    ...overrides,
  } as unknown as InsuranceCaseDto;
}

export function reviewContext(overrides: Partial<AdvisorContext> = {}): AdvisorContext {
  return { ...dialogue, ...overrides } as unknown as AdvisorContext;
}

/** The accepted state: gross income taken over, nothing left to decide, the profile not confirmed. */
export function acceptedCase(): InsuranceCaseDto {
  const before = reviewCase();
  const draft = structuredClone(before.draft);
  draft.insurance!.persons[0].grossAnnualIncomeCents = 11900000;
  return reviewCase({
    draft,
    draftDirty: true,
    ambiguities: [],
    proposalBatches: before.proposalBatches.map((batch) =>
      batch.id === BATCH_ID ? { ...batch, status: 'accepted' } : batch,
    ),
  });
}

export const acceptedContext = () =>
  reviewContext({ ambiguities: [], pendingAcceptanceBatchIds: [], missingFields: [] });

export function batchConfirmation(
  overrides: Partial<CustomerConfirmation> = {},
): CustomerConfirmation {
  return {
    ...batchConfirmationJson,
    channel: 'screen',
    ...overrides,
  } as unknown as CustomerConfirmation;
}

export function profileConfirmation(
  overrides: Partial<CustomerConfirmation> = {},
): CustomerConfirmation {
  return {
    ...profileConfirmationJson,
    channel: 'screen',
    ...overrides,
  } as unknown as CustomerConfirmation;
}

interface ServerState {
  readonly dto?: InsuranceCaseDto;
  readonly context?: AdvisorContext;
  readonly confirmation?: CustomerConfirmation | null;
}

/** Answers every pending reload of the central state; an event and a mutation can overlap. */
export function serve(http: HttpTestingController, state: ServerState = {}): void {
  const answer = (url: string, body: object) => {
    const requests = http.match(url);
    if (!requests.length) throw new Error(`No pending request for ${url}`);
    for (const request of requests) request.flush(body);
  };
  answer(`/api/cases/${CASE_ID}`, state.dto ?? reviewCase());
  answer(`/api/cases/${CASE_ID}/advisor/context`, state.context ?? reviewContext());
  answer(`/api/cases/${CASE_ID}/customer-confirmations/current`, {
    confirmation: state.confirmation ?? null,
  });
  for (const request of http.match(request => request.method === 'GET' &&
    ['/summaries','/suitability','/voice/agent-turns','/voice/sessions'].some(route => request.url.endsWith(route)))) {
    request.flush({code:'NOT_FOUND'},{status:404,statusText:'Not Found'});
  }
}

/** Lets pending promises and the render after them finish. */
export async function settle(whenStable?: () => Promise<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await whenStable?.();
  await new Promise((resolve) => setTimeout(resolve));
}

/** Stands in for the browser's EventSource, which jsdom lacks. Only imported by specs. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CLOSED = 2;

  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();

  static reset(): void {
    FakeEventSource.instances = [];
  }

  constructor(
    readonly url: string,
    readonly init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  fail({ closed = false } = {}): void {
    this.readyState = closed ? FakeEventSource.CLOSED : 0;
    this.onerror?.();
  }

  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}
