import { computed, signal } from '@angular/core';
import type { HumanHandover } from '@pax/contracts';
import type { CustomerSession } from '../advisor/api/customer-api';

export interface HandoverEvidence {
  readonly caseId: string;
  readonly handover?: Pick<HumanHandover, 'revision' | 'stopDigitalConversation'>;
}

interface ControlState {
  readonly session: CustomerSession;
  readonly revision: number;
  readonly stopped: boolean;
  readonly requestPending: boolean;
}

/** The control plane only: monotonic backend handover evidence, scoped to one authenticated
 * session object. Financial case state still belongs exclusively to CaseStore.
 */
export class HandoverControl {
  private readonly held = signal<ControlState | null>(null);

  constructor(
    private readonly session: () => CustomerSession | null,
    private readonly canonical: () => HandoverEvidence | null,
  ) {}

  readonly stopped = computed(() => {
    const session = this.session();
    if (!session) return false;
    const current = this.current(session);
    return current.stopped || current.requestPending;
  });

  /** Idempotent: a delayed Angular effect cannot erase evidence already received for this scope. */
  synchronizeSession(): void {
    const session = this.session();
    if (!session) this.held.set(null);
    else {
      const held = this.held(), current = this.current(session);
      if (held?.session !== session || held.revision !== current.revision ||
          held.stopped !== current.stopped || held.requestPending !== current.requestPending) this.held.set(current);
    }
  }

  requestStop(session: CustomerSession): void {
    if (this.session() !== session) return;
    this.held.set({ ...this.current(session), requestPending: true });
  }

  /** Older evidence never unlocks OR re-stops a newer revision. At an equal revision Stop wins.
   * Local request intent is independent of observed backend state. Only an accepted, matching
   * command acknowledgment (or ending the session) discharges it, at any observed revision.
   */
  observe(session: CustomerSession, evidence: HandoverEvidence, commandAcknowledged = false): boolean {
    if (this.session() !== session || evidence.caseId !== session.caseId || !valid(evidence.handover)) return false;
    const current = this.current(session);
    const next = evidence.handover!;
    if (next.revision < current.revision ||
        next.revision === current.revision && current.stopped && !next.stopDigitalConversation) return false;
    this.held.set({
      session, revision: next.revision, stopped: next.stopDigitalConversation,
      requestPending: current.requestPending && !commandAcknowledged,
    });
    return true;
  }

  private current(session: CustomerSession): ControlState {
    const held = this.held();
    const current: ControlState = held?.session === session ? held :
      { session, revision: -1, stopped: false, requestPending: false };
    const canonical = this.canonical();
    if (canonical?.caseId !== session.caseId || !valid(canonical.handover)) return current;
    const next = canonical.handover!;
    if (next.revision < current.revision) return current;
    if (next.revision === current.revision) return next.stopDigitalConversation && !current.stopped ?
      { ...current, stopped: true } : current;
    return { session, revision: next.revision, stopped: next.stopDigitalConversation, requestPending: current.requestPending };
  }
}

function valid(handover: HandoverEvidence['handover']): boolean {
  return !!handover && Number.isSafeInteger(handover.revision) && handover.revision >= 0 &&
    typeof handover.stopDigitalConversation === 'boolean';
}
