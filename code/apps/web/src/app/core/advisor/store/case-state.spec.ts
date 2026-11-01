import { AdvisorEvent } from '../advisor-data-source';
import { CaseState, applyCaseEvent, applyCaseSnapshot, initialCaseState } from './case-state';
import { analysis, chart, contextUpdate, event, line, progress, reply, risk, snapshot } from './case-testing';

function apply(...events: AdvisorEvent[]): CaseState {
  return events.reduce((state, e) => applyCaseEvent(state, e).state, initialCaseState());
}

describe('applyCaseEvent: version guard', () => {
  it('keeps a newer chart when an older profileVersion arrives late, even with a higher revision', () => {
    const state = apply(
      event('chart', chart({ profileVersion: 7, revision: 2 })),
      event('chart', chart({ profileVersion: 6, revision: 5 })),
    );
    expect(state.data.charts).toEqual([chart({ profileVersion: 7, revision: 2 })]);
  });

  it('keeps the newer run when the older run of the same profile finishes late', () => {
    const state = apply(
      event('chart', chart({ runId: 'run_03', revision: 1 })),
      event('chart', chart({ runId: 'run_04', revision: 2 })),
      event('chart', chart({ runId: 'run_03', revision: 3 })),
    );
    expect(state.data.charts.map((c) => [c.runId, c.revision])).toEqual([['run_04', 2]]);
  });

  it('keeps the newer scenario version when the older one arrives late', () => {
    const state = apply(
      event('chart', chart({ scenarioVersionId: 'scenario_1', revision: 1 })),
      event('chart', chart({ scenarioVersionId: 'scenario_2', revision: 2 })),
      event('chart', chart({ scenarioVersionId: 'scenario_1', revision: 3 })),
    );
    expect(state.data.charts[0].scenarioVersionId).toBe('scenario_2');
  });

  it('ignores a lower chart revision for the same input', () => {
    const state = apply(
      event('chart', chart({ revision: 2, status: 'estimated' })),
      event('chart', chart({ revision: 1, status: 'needs_input' })),
    );
    expect(state.data.charts[0]).toMatchObject({ revision: 2, status: 'estimated' });
  });

  it('treats a run it has never seen as newer', () => {
    const state = apply(
      event('chart', chart({ runId: 'run_03' })),
      event('chart', chart({ runId: 'run_07', revision: 2 })),
    );
    expect(state.data.charts[0].runId).toBe('run_07');
  });

  it('orders runs across items: a run first seen elsewhere earlier is older', () => {
    const state = apply(
      event('analysis', analysis({ runId: 'run_03' })),
      event('analysis', analysis({ runId: 'run_04' })),
      event('risk', risk({ runId: 'run_04', status: 'identified' })),
      event('risk', risk({ runId: 'run_03', status: 'needs_data' })),
    );
    expect(state.data.risks[0]).toMatchObject({ runId: 'run_04', status: 'identified' });
  });

  it('keeps the newer analysis result', () => {
    const state = apply(
      event('analysis', analysis({ runId: 'run_01' })),
      event('analysis', analysis({ runId: 'run_02', profileVersion: 2 })),
      event('analysis', analysis({ runId: 'run_01' })),
    );
    expect(state.data.analysis?.runId).toBe('run_02');
  });

  it('keeps the newer progress', () => {
    const newer = progress({ profileVersion: 3 }),
      older = progress({ profileVersion: 2 });
    const state = apply(event('progress', newer), event('progress', older));
    expect(state.data.progress).toBe(newer);
  });

  it('drops a reply that answers an older conversation context', () => {
    const state = apply(
      event('context', contextUpdate(5)),
      event('reply', reply({ replyId: 'reply_old', contextRevision: 4 })),
      event('reply', reply({ replyId: 'reply_new', contextRevision: 5 })),
    );
    expect(state.data.replies.map((r) => r.replyId)).toEqual(['reply_new']);
  });

  it('never moves the context revision backwards', () => {
    const state = apply(event('context', contextUpdate(5)), event('context', contextUpdate(3)));
    expect(state.data.contextRevision).toBe(5);
  });

  it('does not let a late interim line replace the final one', () => {
    const state = apply(
      event('transcript', line({ status: 'interim', text: 'Wir sind' })),
      event('transcript', line({ status: 'final', text: 'Wir sind verheiratet.' })),
      event('transcript', line({ status: 'interim', text: 'Wir sind' })),
    );
    expect(state.data.transcript).toEqual([line({ text: 'Wir sind verheiratet.' })]);
  });

  it('returns the same state object for an ignored or duplicate event', () => {
    const state = apply(event('chart', chart({ revision: 2 })));
    expect(applyCaseEvent(state, event('chart', chart({ revision: 1 })))).toEqual({
      state,
      changes: [],
    });
    expect(applyCaseEvent(state, event('chart', chart({ revision: 2 }))).state).toBe(state);
  });
});

describe('applyCaseEvent: charts', () => {
  it('updates an existing chartId in place instead of appending', () => {
    const before = apply(
      event('chart', chart({ chartId: 'chart_a' })),
      event('chart', chart({ chartId: 'chart_b' })),
    );
    const { state, changes } = applyCaseEvent(
      before,
      event('chart', chart({ chartId: 'chart_a', revision: 2, status: 'estimated' })),
    );
    expect(state.data.charts.map((c) => [c.chartId, c.revision, c.status])).toEqual([
      ['chart_a', 2, 'estimated'],
      ['chart_b', 1, 'valid'],
    ]);
    expect(changes).toEqual([{ tab: 'graphics', id: 'chart_a' }]);
  });

  it('keeps charts in order of first appearance', () => {
    const state = apply(
      event('chart', chart({ chartId: 'chart_b' })),
      event('chart', chart({ chartId: 'chart_a' })),
      event('chart', chart({ chartId: 'chart_b', revision: 2 })),
    );
    expect(state.data.charts.map((c) => c.chartId)).toEqual(['chart_b', 'chart_a']);
  });
});

describe('applyCaseEvent: tab changes', () => {
  it('reports the tab and id of every shown item that changed', () => {
    const state = initialCaseState();
    expect(applyCaseEvent(state, event('risk', risk())).changes).toEqual([
      { tab: 'risks', id: 'risk_a' },
    ]);
    expect(applyCaseEvent(state, event('transcript', line())).changes).toEqual([
      { tab: 'chat', id: 'entry_1' },
    ]);
    expect(applyCaseEvent(state, event('reply', reply())).changes).toEqual([]);
  });
});

describe('applyCaseSnapshot', () => {
  it('replaces the state and lists what changed per tab', () => {
    const before = apply(
      event('chart', chart({ chartId: 'chart_a' })),
      event('chart', chart({ chartId: 'chart_b' })),
    );
    const fresh = snapshot({
      charts: [chart({ chartId: 'chart_a' }), chart({ chartId: 'chart_b', revision: 2 })],
      risks: [risk()],
    });
    const { state, changes } = applyCaseSnapshot(before, fresh);
    expect(state.data).toBe(fresh);
    expect(changes).toEqual([
      { tab: 'graphics', id: 'chart_b' },
      { tab: 'risks', id: 'risk_a' },
    ]);
  });

  it('orders the snapshot runs by profileVersion, not by list position', () => {
    const fresh = snapshot({
      charts: [chart({ runId: 'run_04', profileVersion: 2 })],
      risks: [risk({ runId: 'run_03', profileVersion: 1 })],
      analysis: analysis({ runId: 'run_04', profileVersion: 2 }),
    });
    const { state } = applyCaseSnapshot(initialCaseState(), fresh);
    expect(state.order.runs).toEqual(['run_03', 'run_04']);

    const late = applyCaseEvent(
      state,
      event('chart', chart({ runId: 'run_03', profileVersion: 2 })),
    );
    expect(late.state).toBe(state);
  });
});
