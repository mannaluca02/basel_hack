import { AdvisorEvent, AdvisorSnapshot, emptySnapshot } from '../advisor-data-source';
import { VersionRefs } from '../contracts';

/**
 * Pure state transitions behind `CaseStore`, including the version guard of interface contracts
 * section 3: a late result that belongs to an older input never replaces a newer one.
 *
 * Versions are compared per item (same chartId, riskId, replyId, or the single analysis/summary/
 * progress), not against one global "current run": the Graphics feed legitimately shows charts
 * from different runs side by side.
 *
 * Order of the checks, the first difference decides:
 * 1. `profileVersion`, a number: higher is newer.
 * 2. `runId`, then `scenarioVersionId`: opaque strings, ordered by when the store first accepted
 *    them (an id never seen before counts as newer). Assumption until FE-06 (#13): the backend
 *    issues a fresh id for every new run and scenario version and never reuses an old one.
 * 3. Per type: chart `revision`; reply and context `contextRevision`; a final transcript line is
 *    never replaced by an interim one.
 * An update with the same content as the stored item is a duplicate and changes nothing.
 */

export type WorkspaceTab = 'graphics' | 'risks' | 'chat' | 'info';
export const WORKSPACE_TABS: readonly WorkspaceTab[] = ['graphics', 'risks', 'chat', 'info'];

/** Run and scenario version ids in the order the store first accepted them. */
export interface VersionOrder {
  readonly runs: readonly string[];
  readonly scenarios: readonly string[];
}

export interface CaseState {
  readonly data: AdvisorSnapshot;
  readonly order: VersionOrder;
}

/** An item a tab shows that was added or changed. */
export interface TabChange {
  readonly tab: WorkspaceTab;
  readonly id: string;
}

export interface CaseTransition {
  /** The same object as the input state when the event was ignored. */
  readonly state: CaseState;
  readonly changes: readonly TabChange[];
}

export function initialCaseState(caseId = ''): CaseState {
  return { data: emptySnapshot(caseId), order: { runs: [], scenarios: [] } };
}

/** Applies one live event, unless it is older than or identical to what the store holds. */
export function applyCaseEvent(state: CaseState, event: AdvisorEvent): CaseTransition {
  const { data, order } = state;
  switch (event.type) {
    case 'agent':
      return replace(state, 'agent', event.payload);

    case 'transcript': {
      const line = event.payload;
      return upsert(
        state,
        'transcript',
        line,
        (t) => t.entryId,
        'chat',
        (current) => (current.status === 'final' && line.status === 'interim' ? -1 : 1),
      );
    }

    case 'reply': {
      const reply = event.payload;
      // An answer to an outdated conversation context is stale (contracts 9.3, STALE_CONTEXT).
      if (reply.contextRevision < data.contextRevision) return unchanged(state);
      return upsert(
        state,
        'replies',
        reply,
        (r) => r.replyId,
        null,
        (current) =>
          reply.contextRevision - current.contextRevision || compareVersions(reply, current, order),
      );
    }

    case 'progress': {
      const progress = event.payload;
      if (data.progress && progress.profileVersion < data.progress.profileVersion) {
        return unchanged(state);
      }
      return replace(state, 'progress', progress);
    }

    case 'analysis': {
      const analysis = event.payload;
      if (data.analysis && compareVersions(analysis, data.analysis, order) < 0) {
        return unchanged(state);
      }
      return replace(state, 'analysis', analysis);
    }

    case 'chart': {
      const chart = event.payload;
      return upsert(
        state,
        'charts',
        chart,
        (c) => c.chartId,
        'graphics',
        (current) => compareVersions(chart, current, order) || chart.revision - current.revision,
      );
    }

    case 'risk': {
      const risk = event.payload;
      return upsert(
        state,
        'risks',
        risk,
        (r) => r.riskId,
        'risks',
        (current) => compareVersions(risk, current, order),
      );
    }

    case 'info':
      return upsert(
        state,
        'info',
        event.payload,
        (i) => i.infoId,
        'info',
        () => 1,
      );

    case 'summary': {
      const summary = event.payload;
      if (data.summary && compareVersions(summary, data.summary, order) < 0) {
        return unchanged(state);
      }
      return replace(state, 'summary', summary);
    }

    case 'context': {
      const { contextRevision } = event.payload;
      if (contextRevision <= data.contextRevision) return unchanged(state);
      return { state: { ...state, data: { ...data, contextRevision } }, changes: [] };
    }
  }
}

/**
 * Takes over a fresh snapshot (start, reconnect). The snapshot is the backend's current state and
 * replaces the held one; the changes list the items a tab now shows differently.
 */
export function applyCaseSnapshot(state: CaseState, snapshot: AdvisorSnapshot): CaseTransition {
  const before = state.data;
  if (before.caseId === snapshot.caseId && before.canonical && snapshot.canonical &&
      (snapshot.canonical.caseRevision < before.canonical.caseRevision ||
       snapshot.canonical.contextRevision < before.canonical.contextRevision)) return unchanged(state);
  const changes: TabChange[] = [
    ...changedIds('graphics', before.charts, snapshot.charts, (c) => c.chartId),
    ...changedIds('risks', before.risks, snapshot.risks, (r) => r.riskId),
    ...changedIds('chat', before.transcript, snapshot.transcript, (t) => t.entryId),
    ...changedIds('info', before.info, snapshot.info, (i) => i.infoId),
  ];
  // A snapshot lists items, not runs in time order. Ids unknown so far are registered by
  // profileVersion; within one profile the analysis goes last, it belongs to the latest run.
  const refs: VersionRefs[] = [
    ...snapshot.charts,
    ...snapshot.risks,
    ...(snapshot.summary ? [snapshot.summary] : []),
    ...(snapshot.analysis ? [snapshot.analysis] : []),
  ].sort((a, b) => a.profileVersion - b.profileVersion);
  return { state: { data: snapshot, order: refs.reduce(register, state.order) }, changes };
}

/** Negative: `next` is older than `current`; zero: same input; positive: newer. */
export function compareVersions(
  next: Partial<VersionRefs>,
  current: Partial<VersionRefs>,
  order: VersionOrder,
): number {
  if (next.profileVersion !== undefined && current.profileVersion !== undefined) {
    const byProfile = next.profileVersion - current.profileVersion;
    if (byProfile !== 0) return byProfile;
  }
  return (
    compareOrdered(next.runId, current.runId, order.runs) ||
    compareOrdered(next.scenarioVersionId, current.scenarioVersionId, order.scenarios)
  );
}

function compareOrdered(
  next: string | undefined,
  current: string | undefined,
  order: readonly string[],
): number {
  if (next === undefined || current === undefined || next === current) return 0;
  const nextIndex = order.indexOf(next);
  if (nextIndex === -1) return 1;
  return nextIndex - order.indexOf(current);
}

// --- helpers -----------------------------------------------------------------------------------

type ListKey = 'transcript' | 'replies' | 'charts' | 'risks' | 'info';
type ItemKey = 'agent' | 'progress' | 'analysis' | 'summary';
type ListItem<K extends ListKey> = AdvisorSnapshot[K][number];

function unchanged(state: CaseState): CaseTransition {
  return { state, changes: [] };
}

function replace<K extends ItemKey>(
  state: CaseState,
  key: K,
  value: NonNullable<AdvisorSnapshot[K]>,
): CaseTransition {
  if (sameContent(state.data[key], value)) return unchanged(state);
  return {
    state: {
      data: { ...state.data, [key]: value },
      order: register(state.order, value as Partial<VersionRefs>),
    },
    changes: [],
  };
}

/**
 * Replaces the item with the same id in place, keeping its position, or appends a new one.
 * `compare` says how the incoming item relates to the stored one; a negative result keeps the
 * stored item. Equal versions with different content replace it: same input, completed content.
 */
function upsert<K extends ListKey>(
  state: CaseState,
  key: K,
  item: ListItem<K>,
  idOf: (value: ListItem<K>) => string,
  tab: WorkspaceTab | null,
  compare: (current: ListItem<K>) => number,
): CaseTransition {
  const items: readonly ListItem<K>[] = state.data[key];
  const id = idOf(item);
  const index = items.findIndex((existing) => idOf(existing) === id);
  if (index !== -1 && (compare(items[index]) < 0 || sameContent(items[index], item))) {
    return unchanged(state);
  }
  const next =
    index === -1 ? [...items, item] : items.map((existing, i) => (i === index ? item : existing));
  return {
    state: {
      data: { ...state.data, [key]: next },
      order: register(state.order, item as Partial<VersionRefs>),
    },
    changes: tab ? [{ tab, id }] : [],
  };
}

function register(order: VersionOrder, refs: Partial<VersionRefs>): VersionOrder {
  const runs = append(order.runs, refs.runId);
  const scenarios = append(order.scenarios, refs.scenarioVersionId);
  return runs === order.runs && scenarios === order.scenarios ? order : { runs, scenarios };
}

function append(list: readonly string[], id: string | undefined): readonly string[] {
  return id === undefined || list.includes(id) ? list : [...list, id];
}

function changedIds<T>(
  tab: WorkspaceTab,
  before: readonly T[],
  after: readonly T[],
  idOf: (item: T) => string,
): TabChange[] {
  const previous = new Map(before.map((item) => [idOf(item), item]));
  return after
    .filter((item) => !sameContent(previous.get(idOf(item)), item))
    .map((item) => ({ tab, id: idOf(item) }));
}

/** Payloads are plain JSON from the backend, so comparing their serialisation is exact. */
function sameContent(a: unknown, b: unknown): boolean {
  return a === b || (a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b));
}
