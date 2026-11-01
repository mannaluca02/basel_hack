import { TestBed } from '@angular/core/testing';
import { AdvisorDataSource } from '../advisor/advisor-data-source';
import { CaseStore } from '../advisor/store/case-store';
import { FakeDataSource, chart, event, info, line, risk } from '../advisor/store/case-testing';
import { Consent } from '../consent/consent';
import { PaxiPlacement } from './paxi-placement';

describe('PaxiPlacement', () => {
  let source: FakeDataSource;
  let store: CaseStore;
  let placement: PaxiPlacement;

  beforeEach(() => {
    source = new FakeDataSource();
    TestBed.configureTestingModule({ providers: [{ provide: AdvisorDataSource, useValue: source }] });
    sessionStorage.clear();
    TestBed.inject(Consent).grant();
    store = TestBed.inject(CaseStore);
    placement = TestBed.inject(PaxiPlacement);
    store.connect();
  });

  it('keeps Paxi in the centre while the shown tab is empty', () => {
    placement.tab.set('graphics');
    expect(placement.spot()).toBe('centre');

    placement.tab.set('chat');
    expect(placement.spot()).toBe('centre');
  });

  it('moves Paxi to the corner on the Chat tab with lines, but only while it is shown', () => {
    placement.tab.set('chat');
    source.emit(event('transcript', line()), event('risk', risk()));
    expect(placement.spot()).toBe('corner');

    // The risk was never on screen: the empty Graphics tab gets the centre back.
    placement.tab.set('graphics');
    expect(placement.spot()).toBe('centre');
  });

  it.each([
    ['graphics', () => event('chart', chart())],
    ['risks', () => event('risk', risk())],
    ['info', () => event('info', info())],
  ] as const)('moves Paxi to the corner once %s shows an item', (tab, item) => {
    placement.tab.set(tab);
    source.emit(item());

    expect(placement.spot()).toBe('corner');
  });

  it('keeps the corner on the Chat tab and returns to the centre for an empty case', () => {
    placement.tab.set('risks');
    source.emit(event('risk', risk()));
    // Rendered once with the risk on screen, as the shell does on every change.
    expect(placement.spot()).toBe('corner');
    placement.tab.set('chat');
    expect(placement.spot()).toBe('corner');

    store.clear();
    expect(placement.spot()).toBe('centre');
  });
});
