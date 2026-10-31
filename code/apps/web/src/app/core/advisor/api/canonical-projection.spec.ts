import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { Consent } from '../../consent/consent';
import { AdvisorDataSource, AdvisorSnapshot } from '../advisor-data-source';
import { CaseStore } from '../store/case-store';
import { FakeDataSource } from '../store/case-testing';
import { acceptedCase, reviewCase } from './review-testing';
import { projectCase } from './case-presenter';

it('projects pending and accepted canonical values through the store and drops a late stale reload', () => {
  const source = new FakeDataSource();
  TestBed.configureTestingModule({providers:[{provide:AdvisorDataSource,useValue:source}]});
  sessionStorage.clear();TestBed.inject(Consent).grant();
  const store=TestBed.inject(CaseStore);
  const incoming=new Subject<AdvisorSnapshot>();source.nextSnapshot=incoming;store.connect();
  const proposed=reviewCase({caseRevision:3,contextRevision:4});
  incoming.next(projectCase(proposed));
  expect(store.canonical()?.proposalBatches[0].status).toBe('proposed');
  expect(store.projection()?.persons[0].grossCents).toBe(12000000);
  incoming.next(projectCase({...acceptedCase(),caseRevision:4,contextRevision:5}));
  expect(store.projection()?.persons[0].grossCents).toBe(11900000);
  incoming.next(projectCase(proposed));
  expect(store.canonical()?.caseRevision).toBe(4);
  expect(store.projection()?.persons[0].grossCents).toBe(11900000);
});

it('clears the canonical projection when a customer session ends and ignores its pending snapshot',()=>{
  const source=new FakeDataSource();
  TestBed.configureTestingModule({providers:[{provide:AdvisorDataSource,useValue:source}]});
  sessionStorage.clear();TestBed.inject(Consent).grant();
  const store=TestBed.inject(CaseStore),incoming=new Subject<AdvisorSnapshot>();
  source.nextSnapshot=incoming;store.connect();incoming.next(projectCase(reviewCase()));
  expect(store.canonical()).not.toBeNull();
  store.clear();incoming.next(projectCase(acceptedCase()));
  expect(store.canonical()).toBeNull();expect(store.loaded()).toBe(false);
});
