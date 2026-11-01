import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { DEFAULT_HUMAN_HANDOVER } from '@pax/contracts';
import { Consent } from '../../consent/consent';
import { provideI18nTesting } from '../../i18n/i18n-testing';
import { AdvisorDataSource, AdvisorSnapshot } from '../advisor-data-source';
import { CaseStore } from './case-store';
import { CASE_ID, FakeDataSource, chart, contextUpdate, event, info, risk, snapshot } from './case-testing';

describe('CaseStore', () => {
  let source: FakeDataSource;
  let store: CaseStore;

  /** Connects with a snapshot request the test answers by hand. */
  function connectPending(): Subject<AdvisorSnapshot> {
    const pending = new Subject<AdvisorSnapshot>();
    source.nextSnapshot = pending;
    store.connect();
    return pending;
  }

  beforeEach(() => {
    source = new FakeDataSource();
    TestBed.configureTestingModule({
      providers: [{ provide: AdvisorDataSource, useValue: source }],
    });
    sessionStorage.clear();
    TestBed.inject(Consent).grant();
    store = TestBed.inject(CaseStore);
  });

  it('loads the snapshot on connect, without counting it as unread', () => {
    expect(store.loaded()).toBe(false);
    const pending = connectPending();
    expect(store.connection()).toBe('connected');

    pending.next(snapshot({ charts: [chart()] }));

    expect(store.loaded()).toBe(true);
    expect(store.caseId()).toBe(CASE_ID);
    expect(store.charts()).toEqual([chart()]);
    expect(store.unread()).toEqual({ graphics: 0, risks: 0, chat: 0, info: 0 });
  });

  it('delivers handover Stop synchronously through the store before a pending canonical snapshot', () => {
    connectPending();
    const stopMedia = vi.fn();
    const seenContext = vi.fn();
    store.digitalStops.subscribe(stopMedia);
    store.contextUpdates.subscribe(seenContext);
    const update = {
      ...contextUpdate(8),
      handover: { ...DEFAULT_HUMAN_HANDOVER, wantsHumanAdvisor: true, stopDigitalConversation: true },
    };

    source.emit(event('context', update));

    // No render, promise, snapshot result, or change detection needed to stop browser media.
    expect(stopMedia).toHaveBeenCalledExactlyOnceWith({ reason: 'human-handover', update });
    expect(seenContext).toHaveBeenCalledExactlyOnceWith(update);
    expect(store.loaded()).toBe(false);
    expect(source.snapshotRequests).toBe(1);
  });

  it('does not let a late, older result overwrite a newer one', () => {
    store.connect();
    source.emit(
      event('chart', chart({ runId: 'run_03', revision: 1 })),
      event('chart', chart({ runId: 'run_04', profileVersion: 2, revision: 2 })),
      event('chart', chart({ runId: 'run_03', revision: 3 })),
      event('risk', risk({ profileVersion: 2, status: 'identified' })),
      event('risk', risk({ profileVersion: 1, status: 'needs_data' })),
    );

    expect(store.charts().map((c) => c.runId)).toEqual(['run_04']);
    expect(store.risks().map((r) => r.status)).toEqual(['identified']);
  });

  it('updates an existing chartId in place instead of appending', () => {
    store.connect();
    source.emit(
      event('chart', chart({ chartId: 'chart_a' })),
      event('chart', chart({ chartId: 'chart_b' })),
      event('chart', chart({ chartId: 'chart_a', revision: 2 })),
    );

    expect(store.charts().map((c) => [c.chartId, c.revision])).toEqual([
      ['chart_a', 2],
      ['chart_b', 1],
    ]);
  });

  it('counts changed items per tab once until the tab is marked read', () => {
    store.connect();
    source.emit(
      event('chart', chart({ chartId: 'chart_a' })),
      event('chart', chart({ chartId: 'chart_a', revision: 2 })),
      event('chart', chart({ chartId: 'chart_b' })),
      event('chart', chart({ chartId: 'chart_b' })),
      event('risk', risk()),
      event('info', info()),
    );
    expect(store.unread()).toEqual({ graphics: 2, risks: 1, chat: 0, info: 1 });

    store.markRead('graphics');
    expect(store.unread()).toEqual({ graphics: 0, risks: 1, chat: 0, info: 1 });

    // An ignored late result is no news.
    source.emit(event('chart', chart({ chartId: 'chart_a', revision: 1 })));
    expect(store.unread().graphics).toBe(0);
  });

  it('holds back events that arrive while the snapshot loads and applies them on top', () => {
    const pending = connectPending();
    source.emit(event('chart', chart({ revision: 3 })), event('risk', risk()));
    expect(store.charts()).toEqual([]);

    pending.next(snapshot({ charts: [chart({ revision: 2 })] }));

    expect(store.charts().map((c) => c.revision)).toEqual([3]);
    expect(store.risks()).toHaveLength(1);
  });

  it('drops held-back events the snapshot already supersedes', () => {
    const pending = connectPending();
    source.emit(event('chart', chart({ revision: 1 })));

    pending.next(snapshot({ charts: [chart({ revision: 2 })] }));

    expect(store.charts().map((c) => c.revision)).toEqual([2]);
    expect(store.unread().graphics).toBe(0);
  });

  it('reloads the snapshot after a reconnect and marks what changed meanwhile', () => {
    connectPending().next(snapshot({ charts: [chart()] }));
    store.disconnect();
    expect(store.connection()).toBe('disconnected');

    connectPending().next(snapshot({ charts: [chart({ revision: 2 })], risks: [risk()] }));

    expect(source.snapshotRequests).toBe(2);
    expect(store.charts()[0].revision).toBe(2);
    expect(store.unread()).toEqual({ graphics: 1, risks: 1, chat: 0, info: 0 });
  });

  it('keeps applying live events when the snapshot request fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pending = connectPending();
    source.emit(event('risk', risk()));

    pending.error(new Error('offline'));
    source.emit(event('chart', chart()));

    expect(store.syncFailed()).toBe(true);
    expect(store.loaded()).toBe(false);
    expect(store.risks()).toHaveLength(1);
    expect(store.charts()).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});

describe('CaseStore before consent', () => {
  let source: FakeDataSource;
  let store: CaseStore;

  beforeEach(() => {
    sessionStorage.clear();
    source = new FakeDataSource();
    TestBed.configureTestingModule({
      providers: [{ provide: AdvisorDataSource, useValue: source }],
    });
    store = TestBed.inject(CaseStore);
  });

  it('does not connect', () => {
    store.connect();

    expect(store.connection()).toBe('disconnected');
    expect(source.snapshotRequests).toBe(0);
  });

  it('drops events and snapshots even if the data source runs on its own', () => {
    source.connectionState.next('connected');
    source.emit(event('chart', chart()), event('risk', risk()));

    expect(source.snapshotRequests).toBe(0);
    expect(store.loaded()).toBe(false);
    expect(store.charts()).toEqual([]);
    expect(store.risks()).toEqual([]);
    expect(store.unread()).toEqual({ graphics: 0, risks: 0, chat: 0, info: 0 });
  });

  it('processes only what arrives after consent', () => {
    source.emit(event('risk', risk({ riskId: 'risk_before' })));

    TestBed.inject(Consent).grant();
    store.connect();
    source.emit(event('risk', risk({ riskId: 'risk_after' })));

    expect(store.loaded()).toBe(true);
    expect(store.risks().map((r) => r.riskId)).toEqual(['risk_after']);
  });
});
