import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_HUMAN_HANDOVER, PAX_HUMAN_ADVISOR_CONTACT, type InsuranceCaseDto } from '@pax/contracts';
import { APP_ENVIRONMENT } from '../../../src/app/core/config/app-environment';
import { Consent } from '../../../src/app/core/consent/consent';
import { provideI18nTesting } from '../../../src/app/core/i18n/i18n-testing';
import { AdvisorDataSource } from '../../../src/app/core/advisor/advisor-data-source';
import { ApiDataSource } from '../../../src/app/core/advisor/api/api-data-source';
import { CaseStore } from '../../../src/app/core/advisor/store/case-store';
import { contextUpdate } from '../../../src/app/core/advisor/store/case-testing';
import { CUSTOMER_SESSION_KEY, CustomerApi } from '../../../src/app/core/advisor/api/customer-api';
import { CASE_ID, FakeEventSource, reviewCase, reviewContext, settle } from '../../../src/app/core/advisor/api/review-testing';
import { TranslocoService } from '@jsverse/transloco';
import { VoiceLab } from './voice-lab';

const emptyCase = () => reviewCase({
  draft: { financial: null, insurance: null, goals: [], reviewFlags: [] }, proposalBatches: [], confirmedVersions: [], ambiguities: [],
});
const populatedCase = () => reviewCase({ proposalBatches: [], ambiguities: [], confirmedVersions: [], handover: DEFAULT_HUMAN_HANDOVER });
const handoverAt = (revision: number, stopped: boolean) => ({
  ...DEFAULT_HUMAN_HANDOVER, revision, status: stopped ? 'requested' as const : 'digital' as const,
  wantsHumanAdvisor: stopped, stopDigitalConversation: stopped, leaveViewRequested: stopped,
  requestId: revision ? 'handover_test' : null, requestedAt: revision ? '2026-10-31T10:00:00.000Z' : null,
  resumedAt: revision && !stopped ? '2026-10-31T10:01:00.000Z' : null, source: revision ? 'ui' as const : null,
});

describe('Voice Lab rendered setup and browser controls', () => {
  let fixture: ComponentFixture<VoiceLab>;
  let http: HttpTestingController;
  let microphone: ReturnType<typeof vi.fn>;
  const caseUrl = `/api/cases/${CASE_ID}`;
  const controls = () => fixture.nativeElement.querySelector('.controls') as HTMLElement;
  const action = (name: string) => controls().querySelector(`[data-action="${name}"]`) as HTMLButtonElement | null;
  const live = () => {
    expect(action('replay')).toBeNull();
    expect(controls().querySelector('button[aria-pressed]')).toBeNull();
  };
  const consent = (includeExtraction = true) => {
    const boxes = controls().querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not([data-setting])');
    for (const checkbox of Array.from(boxes).slice(0,includeExtraction?2:1)) {
      checkbox.checked = true; checkbox.dispatchEvent(new Event('change'));
    }
    fixture.detectChanges();
  };

  let extractionNotice = { enabled: true, version: 'notice', noticeHash: 'hash', text: 'Synthetic extraction notice' };
  const settings = { skills: [{ id: 'friendly-conversation.md', name: 'Friendly conversation', description: 'Follow the person’s story' }], defaultTimeBudgetMinutes: 10 };
  const intakeRow = (field: string) => fixture.nativeElement.querySelector(`.intake [data-field="${field}"]`) as HTMLElement;

  async function setup(dto: InsuranceCaseDto, signedIn = true, apiMode = true) {
    sessionStorage.clear();
    if (signedIn) sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ caseId: CASE_ID, csrfToken: 'csrf_test' }));
    FakeEventSource.reset(); vi.stubGlobal('EventSource', FakeEventSource);
    microphone = vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, mediaDevices: { getUserMedia: microphone } });
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideI18nTesting(),
      { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api', dataSource: apiMode ? 'api' : 'mock' } },
      { provide: AdvisorDataSource, useClass: ApiDataSource },
    ] });
    TestBed.inject(Consent).grant();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VoiceLab);
    fixture.detectChanges();
    FakeEventSource.instances[0]?.open();
    await paint(dto);
  }

  /** Answer reads and the shared consent setup; special consent tests use their own notice hash. */
  async function paint(dto: InsuranceCaseDto) {
    const currentCaseUrl = `/api/cases/${dto.id}`;
    for (let i = 0; i < 5; i++) {
      if (extractionNotice.noticeHash === 'hash') {
        for (const request of http.match(request => request.method === 'POST' && request.url.endsWith('/extraction/consent'))) {
          expect(request.request.body).toMatchObject({ noticeVersion: 'notice', noticeHash: 'hash', allowSyntheticModelExtraction: true });
          expect(request.request.headers.get('X-CSRF-Token')).toBeTruthy();request.flush({});
        }
      }
      for (const request of http.match(request => request.method === 'GET')) {
        const url = request.request.url;
        if (url.startsWith('/api/voice/privacy')) request.flush({ text: 'Synthetic OpenAI voice notice', providers: [{ provider: 'gpt-live', available: true }] });
        else if (url === '/api/voice/settings') request.flush(settings);
        else if (url.startsWith('/api/extraction/privacy')) request.flush(extractionNotice);
        else if (url === currentCaseUrl) request.flush(dto);
        else if (url === `${currentCaseUrl}/advisor/context`) request.flush(reviewContext({ caseId: dto.id }));
         else if (url === `${currentCaseUrl}/customer-confirmations/current`) request.flush({ confirmation: null });
         else if (['/summaries','/suitability','/voice/agent-turns'].some(route=>url===`${currentCaseUrl}${route}`))
           request.flush({code:'NOT_FOUND'},{status:404,statusText:'Not Found'});
        else throw new Error(`Unexpected GET ${url}`);
      }
      await settle(); fixture.detectChanges();
    }
  }

  afterEach(() => {
    fixture?.destroy();
    sessionStorage.clear(); vi.unstubAllGlobals();
  });

  it('guides the exact empty-case scenario to populated options and enabled Live/Replay in the same panel', async () => {
    await setup(emptyCase());
    live(); consent();
    expect(microphone).not.toHaveBeenCalled();
    expect(controls().querySelector('#lab-person')).toBeNull(); // Never an optionless select.
    expect(action('prepare')).not.toBeNull();
    expect(action('start')?.disabled).toBe(true);

    action('prepare')!.click();
    await paint(emptyCase());
    const init = http.expectOne({ method: 'POST', url: `${caseUrl}/voice-lab/initialize` });
    expect(init.request.headers.get('X-CSRF-Token')).toBe('csrf_test');
    expect(init.request.body).toEqual({ expectedCaseRevision: emptyCase().caseRevision });
    init.flush({ initialized: true, syntheticOnly: true, confirmed: false });
    await paint(populatedCase());

    const select = controls().querySelector<HTMLSelectElement>('#lab-person')!;
    expect(Array.from(select.options).map(option => option.value)).toEqual(['person_demo_1', 'person_demo_2']);
    expect(select.textContent).not.toContain('person_demo');
    expect(select.value).toBe('person_demo_1');
    expect(action('start')?.disabled).toBe(false);
    expect(microphone).not.toHaveBeenCalled(); // Preparation never opens media.
    live();
    http.expectNone({ method: 'POST', url: '/api/sessions' }); // Existing ownership is preserved.
    http.verify();
  });

  it('prepares from a fresh tab with the explicitly supplied access code, owner CSRF and no microphone or implicit profile confirmation', async () => {
    await setup(emptyCase(), false);
    live(); consent();
    const code = controls().querySelector<HTMLInputElement>('#lab-code')!;
    code.value = 'explicit-local-test-code'; code.dispatchEvent(new Event('input'));
    await settle(); fixture.detectChanges();
    action('prepare')!.click();
    const login = http.expectOne({ method: 'POST', url: '/api/sessions' });
    expect(login.request.body).toEqual({ accessCode: 'explicit-local-test-code' });
    login.flush({ csrfToken: 'csrf_new', sessionToken: 'never-stored' });
    await settle();
    const create = http.expectOne({ method: 'POST', url: '/api/cases' });
    expect(create.request.headers.get('X-CSRF-Token')).toBe('csrf_new');
    expect(create.request.body.dataClassification).toBe('synthetic');
    create.flush(emptyCase());
    await paint(emptyCase());
    const init = http.expectOne({ method: 'POST', url: `${caseUrl}/voice-lab/initialize` });
    expect(init.request.headers.get('X-CSRF-Token')).toBe('csrf_new');
    init.flush({ initialized: true, confirmed: false });
    await paint(populatedCase());
    expect(action('start')?.disabled).toBe(false);
    expect(TestBed.inject(CaseStore).canonical()?.confirmedVersions).toEqual([]);
    expect(microphone).not.toHaveBeenCalled();
    http.expectNone(request => request.method === 'POST' && request.url.includes('/voice/sessions'));
    http.verify();
  });

  it('shows failed preparation and allows a safe explicit retry against the still-empty case', async () => {
    await setup(emptyCase()); live(); consent();
    action('prepare')!.click(); await paint(emptyCase());
    http.expectOne({ method: 'POST', url: `${caseUrl}/voice-lab/initialize` })
      .flush({ code: 'UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    await paint(emptyCase());
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('erneut');
    expect(action('prepare')?.disabled).toBe(false);
    expect(action('start')?.disabled).toBe(true);
    expect(microphone).not.toHaveBeenCalled();

    action('prepare')!.click(); await paint(emptyCase());
    http.expectOne({ method: 'POST', url: `${caseUrl}/voice-lab/initialize` }).flush({ initialized: true });
    await paint(populatedCase());
    expect(action('start')?.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    http.verify();
  });

  it('uses actual existing person IDs/order after refresh and never seeds or replaces a populated draft or confirmed history', async () => {
    const dto = structuredClone(reviewCase());
    dto.draft.insurance!.persons.reverse();
    await setup(dto);
    expect(controls().querySelector<HTMLSelectElement>('#lab-person')?.value).toBe('person_demo_2');
    expect(action('prepare')).toBeNull();
    action('refresh-setup')!.click(); await paint(dto);
    expect(TestBed.inject(CaseStore).canonical()?.draft).toEqual(dto.draft);
    expect(TestBed.inject(CaseStore).canonical()?.confirmedVersions).toEqual(dto.confirmedVersions);
    consent(); expect(action('start')?.disabled).toBe(false);
    http.expectNone(request => request.method === 'POST');
    http.verify();
  });

  it('explains an existing partial case and preserves its authored goals instead of replacing it with a demo', async () => {
    const dto = emptyCase();
    dto.draft.goals = [{ id: 'authored_goal', kind: 'retirement', targetMonth: '2050-01', priority: 1, targetCapitalCents: null }];
    await setup(dto);
    expect(controls().textContent).toContain('überschreibt keine vorhandenen');
    expect(action('prepare')).toBeNull();
    expect(controls().querySelector('#lab-person')).toBeNull();
    expect(action('start')?.disabled).toBe(true);
    action('refresh-setup')!.click(); await paint(dto);
    expect(TestBed.inject(CaseStore).canonical()?.draft.goals[0].id).toBe('authored_goal');
    http.expectNone(request => request.method === 'POST');
    http.verify();
  });

  it('recovers a restarted/expired session into the same-panel sign-in action with a readable explanation', async () => {
    await setup(emptyCase()); live(); consent();
    action('prepare')!.click();
    http.expectOne({ method: 'GET', url: caseUrl })
      .flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });
    await paint(emptyCase());
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('abgelaufen');
    expect(controls().querySelector('#lab-code')).not.toBeNull();
    expect(action('prepare')?.disabled).toBe(false);
    expect(action('start')?.disabled).toBe(true);
    expect(controls().querySelector('#lab-person')).toBeNull();
    expect(TestBed.inject(CaseStore).canonical()).toBeNull();
    expect(microphone).not.toHaveBeenCalled();
    http.verify();
  });

  it('requires explicit voice consent and makes a denied microphone permission readable and retryable', async () => {
    await setup(populatedCase()); live();
    expect(action('start')?.disabled).toBe(true);
    expect(controls().textContent).toContain('Bestätige den angezeigten Sprachhinweis');
    action('start')!.click(); expect(microphone).not.toHaveBeenCalled();
    consent(); expect(action('start')?.disabled).toBe(false);
    action('start')!.click(); await paint(populatedCase()); fixture.detectChanges();
    expect(microphone).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Website-Einstellungen');
    expect(action('start')?.disabled).toBe(false);
    action('start')!.click(); await paint(populatedCase()); fixture.detectChanges();
    expect(microphone).toHaveBeenCalledTimes(2);
    http.expectNone(request => request.method === 'POST' && request.url.includes('/voice/sessions'));
    http.verify();
  });

  it('blocks live and replay during human handover and exposes only an explicit resume before restart', async () => {
    const stopped = { ...populatedCase(), handover: { ...DEFAULT_HUMAN_HANDOVER, revision: 1, wantsHumanAdvisor: true, stopDigitalConversation: true } };
    await setup(stopped); live(); consent();
    expect(action('start')?.disabled).toBe(true);
    expect(controls().textContent).toContain('menschliche Berater');
    expect(action('resume')?.disabled).toBe(false);
    expect(action('start')?.disabled).toBe(true);
    action('start')!.click();
    http.expectNone(request => request.method === 'POST');
    action('resume')!.click(); await paint(stopped);
    const resume = http.expectOne({ method: 'POST', url: `${caseUrl}/handover` });
    expect(resume.request.body.action).toBe('resume');
    resume.flush({
      caseId: CASE_ID, caseRevision: stopped.caseRevision + 1, contextRevision: stopped.contextRevision + 1,
      handover: handoverAt(2, false), contact: PAX_HUMAN_ADVISOR_CONTACT,
      command: { messageId: resume.request.body.messageId, action: 'resume', replayed: false, changed: true },
    });
    await paint({ ...populatedCase(), caseRevision: stopped.caseRevision + 1, contextRevision: stopped.contextRevision + 1, handover: handoverAt(2, false) });
    expect(action('resume')).toBeNull(); expect(action('start')?.disabled).toBe(false);
    expect(microphone).not.toHaveBeenCalled();
    http.verify();
  });

  it('blocks restart immediately on a handover stop notification while canonical reloads are still pending', async () => {
    await setup(populatedCase()); live(); consent();
    expect(action('start')?.disabled).toBe(false);
    const handover = { ...DEFAULT_HUMAN_HANDOVER, revision: 1, wantsHumanAdvisor: true, stopDigitalConversation: true };
    FakeEventSource.instances[0].emit('advisor.context.updated', { ...contextUpdate(99), caseId: CASE_ID, handover });
    fixture.detectChanges();
    expect(action('start')?.disabled).toBe(true);
    expect(action('resume')).not.toBeNull();
    expect(microphone).not.toHaveBeenCalled();
    await paint({ ...populatedCase(), contextRevision: 99, handover });
    http.verify();
  });

  it.each([false, true])('retains an unknown-outcome human request across higher state revisions until explicit resume (%s unrelated resume after Stop)', async unrelatedResume => {
    const initial = populatedCase();
    await setup(initial); live(); consent();
    expect(action('start')?.disabled).toBe(false);
    action('handover')!.click();
    const basis = { ...initial, caseRevision: initial.caseRevision + 2, handover: handoverAt(2, false) };
    http.expectOne({ method: 'GET', url: caseUrl }).flush(basis);
    await settle();
    const request = http.expectOne({ method: 'POST', url: `${caseUrl}/handover` });
    expect(request.request.body).toMatchObject({ action: 'request', expectedCaseRevision: basis.caseRevision });
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf_test');
    // The backend may have committed Stop/3. Its response is lost; no stop notification arrives.
    request.error(new ProgressEvent('error'));
    await settle(); fixture.detectChanges();
    const reconciliation = http.expectOne({ method: 'GET', url: caseUrl });
    // Keep reconciliation pending and prove this is not just the busy flag disabling Start.
    expect(action('resume')?.disabled).toBe(false);
    expect(action('start')?.disabled).toBe(true);
    action('start')!.click(); expect(microphone).not.toHaveBeenCalled();
    expect(action('start')?.disabled).toBe(true); action('start')!.click();
    http.expectNone(request => request.method === 'POST');

    // Another tab's subsequent stop/resume is ordinary state, not this command's acknowledgment.
    const unrelated = { ...initial, caseRevision: initial.caseRevision + 4, contextRevision: 100, handover: handoverAt(4, false) };
    reconciliation.flush(unrelated);
    // The shared workspace snapshot now also loads its optional presentation sources.
    for(const request of http.match(request=>request.method==='GET'&&request.url!==caseUrl)){
      if(request.request.url.endsWith('/advisor/context'))request.flush(reviewContext());
      else if(request.request.url.endsWith('/current'))request.flush({confirmation:null});
      else request.flush({code:'NOT_FOUND'},{status:404,statusText:'Not Found'});
    }
    await settle(); fixture.detectChanges();
    expect(TestBed.inject(CaseStore).canonical()?.handover.revision).toBe(4);
    expect(action('resume')?.disabled).toBe(false);
    expect(action('start')?.disabled).toBe(true);
    FakeEventSource.instances[0].emit('advisor.context.updated', {
      ...contextUpdate(102), caseId: CASE_ID, handover: handoverAt(6, false),
    });
    await settle(); fixture.detectChanges();
    expect(action('start')?.disabled).toBe(true);
    expect(action('resume')?.disabled).toBe(false);
    expect(microphone).not.toHaveBeenCalled();

    // Authoritative Stop evidence must not consume the still-unacknowledged local intent either.
    FakeEventSource.instances[0].emit('advisor.context.updated', {
      ...contextUpdate(103), caseId: CASE_ID, handover: handoverAt(7, true),
    });
    const stopped = { ...initial, caseRevision: initial.caseRevision + 7, contextRevision: 103, handover: handoverAt(7, true) };
    await paint(stopped); live(); consent();
    expect(action('start')?.disabled).toBe(true);
    let resumeBasis = stopped;
    if (unrelatedResume) {
      const digital = { ...initial, caseRevision: initial.caseRevision + 8, contextRevision: 104, handover: handoverAt(8, false) };
      FakeEventSource.instances[0].emit('advisor.context.updated', {
        ...contextUpdate(104), caseId: CASE_ID, handover: digital.handover,
      });
      await paint(digital);
      expect(action('start')?.disabled).toBe(true);
      expect(action('resume')?.disabled).toBe(false);
      expect(microphone).not.toHaveBeenCalled();
      resumeBasis = digital;
    }
    action('resume')!.click();
    http.expectOne({ method: 'GET', url: caseUrl }).flush(resumeBasis);
    await settle();
    const resume = http.expectOne({ method: 'POST', url: `${caseUrl}/handover` });
    expect(resume.request.body).toMatchObject({ action: 'resume', expectedCaseRevision: resumeBasis.caseRevision });
    resume.flush({
      caseId: CASE_ID, caseRevision: initial.caseRevision + 8, contextRevision: 104,
      handover: handoverAt(8, false), contact: PAX_HUMAN_ADVISOR_CONTACT,
      command: { messageId: resume.request.body.messageId, action: 'resume', replayed: false, changed: !unrelatedResume },
    });
    await settle(); fixture.detectChanges();
    expect(action('start')?.disabled).toBe(false);
    expect(action('resume')).toBeNull();
    expect(microphone).not.toHaveBeenCalled(); // Resume only enables an explicit Start.
    await paint({ ...initial, caseRevision: initial.caseRevision + 8, contextRevision: 104, handover: handoverAt(8, false) });
    http.verify();
  });

  it('resolves local request intent on its matching successful command acknowledgment while retaining the authoritative Stop', async () => {
    const initial = populatedCase();
    await setup(initial); live(); consent(); action('handover')!.click();
    http.expectOne({ method: 'GET', url: caseUrl }).flush({ ...initial, caseRevision: initial.caseRevision + 2, handover: handoverAt(2, false) });
    await settle();
    const request = http.expectOne({ method: 'POST', url: `${caseUrl}/handover` });
    request.flush({
      caseId: CASE_ID, caseRevision: initial.caseRevision + 3, contextRevision: 100,
      handover: handoverAt(3, true), contact: PAX_HUMAN_ADVISOR_CONTACT,
      command: { messageId: request.request.body.messageId, action: 'request', replayed: false, changed: true },
    });
    await settle(); fixture.detectChanges();
    expect(action('start')?.disabled).toBe(true);
    expect(action('resume')).not.toBeNull();
    // The request is now acknowledged. A later authoritative resume can release Stop/3.
    FakeEventSource.instances[0].emit('advisor.context.updated', {
      ...contextUpdate(101), caseId: CASE_ID, handover: handoverAt(4, false),
    });
    fixture.detectChanges();
    expect(action('start')?.disabled).toBe(false);
    expect(action('resume')).toBeNull();
    expect(microphone).not.toHaveBeenCalled();
    await paint({ ...initial, caseRevision: initial.caseRevision + 4, contextRevision: 101, handover: handoverAt(4, false) });
    http.verify();
  });

  it.each([0, 1])('keeps the handover Stop when a nonstopped Reload case response at revision %i arrives before canonical reloads', async revision => {
    await setup(populatedCase()); live(); consent();
    action('refresh-setup')!.click();
    const oldRead = http.expectOne({ method: 'GET', url: caseUrl });
    FakeEventSource.instances[0].emit('advisor.context.updated', {
      ...contextUpdate(99), caseId: CASE_ID, handover: handoverAt(1, true),
    });
    fixture.detectChanges();
    expect(action('start')?.disabled).toBe(true);
    oldRead.flush({ ...populatedCase(), handover: handoverAt(revision, false) });
    await settle();
    http.expectOne(request => request.url.startsWith('/api/voice/privacy'))
      .flush({ text: 'Synthetic notice', providers: [{ provider: 'gpt-live', available: true }] });
    await settle(); fixture.detectChanges();
    // Leave every subsequent canonical GET pending. The old control read must not unlock media.
    expect(action('start')?.disabled).toBe(true);
    expect(action('resume')).not.toBeNull();
    action('start')!.click(); expect(microphone).not.toHaveBeenCalled();
    expect(action('start')?.disabled).toBe(true);
    action('start')!.click();
    http.expectNone(request => request.method === 'POST');
    await paint({ ...populatedCase(), contextRevision: 99, handover: handoverAt(1, true) });
    http.verify();
  });

  it('ignores an older resume acknowledgment after a newer Stop, and unlocks only on resume of that latest revision', async () => {
    await setup(populatedCase()); live(); consent();
    FakeEventSource.instances[0].emit('advisor.context.updated', {
      ...contextUpdate(90), caseId: CASE_ID, handover: handoverAt(1, true),
    });
    await paint({ ...populatedCase(), contextRevision: 90 }); // Older canonical still says digital/0.
    action('resume')!.click();
    const basis = http.expectOne({ method: 'GET', url: caseUrl });
    basis.flush({ ...populatedCase(), handover: handoverAt(1, true) });
    await settle();
    const oldResume = http.expectOne({ method: 'POST', url: `${caseUrl}/handover` });
    FakeEventSource.instances[0].emit('advisor.context.updated', {
      ...contextUpdate(99), caseId: CASE_ID, handover: handoverAt(3, true),
    });
    oldResume.flush({
      caseId: CASE_ID, caseRevision: populatedCase().caseRevision + 1, contextRevision: 95,
      handover: handoverAt(2, false), contact: PAX_HUMAN_ADVISOR_CONTACT,
      command: { ...oldResume.request.body, replayed: false, changed: true },
    });
    await settle(); fixture.detectChanges();
    expect(action('start')?.disabled).toBe(true);
    expect(action('resume')).not.toBeNull();
    action('start')!.click(); expect(microphone).not.toHaveBeenCalled();
    expect(action('start')?.disabled).toBe(true);

    await paint({ ...populatedCase(), caseRevision: populatedCase().caseRevision + 2, contextRevision: 99, handover: handoverAt(3, true) });
    action('resume')!.click();
    http.expectOne({ method: 'GET', url: caseUrl }).flush({ ...populatedCase(), caseRevision: populatedCase().caseRevision + 2, handover: handoverAt(3, true) });
    await settle();
    const currentResume = http.expectOne({ method: 'POST', url: `${caseUrl}/handover` });
    currentResume.flush({
      caseId: CASE_ID, caseRevision: populatedCase().caseRevision + 3, contextRevision: 100,
      handover: handoverAt(4, false), contact: PAX_HUMAN_ADVISOR_CONTACT,
      command: { ...currentResume.request.body, replayed: false, changed: true },
    });
    await settle(); fixture.detectChanges();
    // A bound, newer command response is authority even before the canonical GET completes.
    expect(action('start')?.disabled).toBe(false);
    expect(action('resume')).toBeNull();
    expect(microphone).not.toHaveBeenCalled();
    await paint({ ...populatedCase(), caseRevision: populatedCase().caseRevision + 3, contextRevision: 100, handover: handoverAt(4, false) });
    http.verify();
  });

  it('orders adequately recent HTTP/SSE state and ignores stale or foreign-case control notifications', async () => {
    await setup(populatedCase()); live(); consent();
    const stream = FakeEventSource.instances[0];
    stream.emit('advisor.context.updated', { ...contextUpdate(80), caseId: 'foreign-case', handover: handoverAt(100, true) });
    fixture.detectChanges();
    expect(action('start')?.disabled).toBe(false);
    stream.emit('advisor.context.updated', { ...contextUpdate(90), caseId: CASE_ID, handover: handoverAt(1, true) });
    await paint({ ...populatedCase(), contextRevision: 90 });
    expect(action('start')?.disabled).toBe(true);

    action('refresh-setup')!.click();
    http.expectOne({ method: 'GET', url: caseUrl }).flush({ ...populatedCase(), handover: handoverAt(2, false) });
    await settle();
    http.expectOne(request => request.url.startsWith('/api/voice/privacy'))
      .flush({ text: 'Synthetic notice', providers: [{ provider: 'gpt-live', available: true }] });
    await settle(); fixture.detectChanges();
    expect(action('start')?.disabled).toBe(false);
    expect(action('resume')).toBeNull();
    stream.emit('advisor.context.updated', { ...contextUpdate(91), caseId: CASE_ID, handover: handoverAt(1, true) });
    fixture.detectChanges();
    expect(action('start')?.disabled).toBe(false); // Old Stop cannot undo authoritative digital/2.
    expect(action('resume')).toBeNull();
    expect(microphone).not.toHaveBeenCalled();
    await paint({ ...populatedCase(), contextRevision: 92, handover: handoverAt(2, false) });
    http.verify();
  });

  it.each([
    { sameCase: true, expiredReply: false },
    { sameCase: true, expiredReply: true },
    { sameCase: false, expiredReply: false },
    { sameCase: false, expiredReply: true },
  ])('binds old reads and stream failures to their original session ($sameCase same case, $expiredReply expired reply)', async ({ sameCase, expiredReply }) => {
    await setup(populatedCase()); live(); consent();
    action('refresh-setup')!.click();
    const oldRead = http.expectOne({ method: 'GET', url: caseUrl });
    const oldStream = FakeEventSource.instances[0];
    oldStream.emit('advisor.context.updated', { ...contextUpdate(90), caseId: CASE_ID, handover: handoverAt(5, true) });
    const oldReloads = http.match(request => request.method === 'GET');
    const api = TestBed.inject(CustomerApi), store = TestBed.inject(CaseStore);
    api.clearSession(); store.clear(); fixture.detectChanges();
    const newCase = { ...populatedCase(), id: sameCase ? CASE_ID : 'case_reauthenticated' };
    const signIn = api.signIn('new-explicit-access-code');
    http.expectOne({ method: 'POST', url: '/api/sessions' }).flush({ csrfToken: 'csrf_new' });
    await settle();
    http.expectOne({ method: 'POST', url: '/api/cases' }).flush(newCase);
    await signIn;
    store.connect();
    const newStream = FakeEventSource.instances.at(-1)!;
    newStream.open(); store.refresh();
    await paint(newCase); consent();
    expect(action('resume')).toBeNull(); // Old session's Stop/5 is not inherited (the old HTTP work is still pending).
    newStream.emit('advisor.context.updated', { ...contextUpdate(99), caseId: newCase.id, handover: handoverAt(1, true) });
    fixture.detectChanges();
    expect(action('start')?.disabled).toBe(true);
    if (expiredReply) oldRead.flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });
    else oldRead.flush(populatedCase());
    // Also deliver old background reads, and a terminal error from the closed old EventSource.
    for (const request of oldReloads) {
      if (['/summaries','/suitability','/voice/agent-turns'].some(route=>request.request.url.endsWith(route)))
        request.flush({code:'NOT_FOUND'},{status:404,statusText:'Not Found'});
      else if (request.request.url.endsWith('/advisor/context')) request.flush(reviewContext());
      else if (request.request.url.endsWith('/current')) request.flush({ confirmation: null });
      else request.flush(populatedCase());
    }
    oldStream.fail({ closed: true });
    await settle(); fixture.detectChanges();
    expect(api.session()).toEqual({ caseId: newCase.id, csrfToken: 'csrf_new' });
    expect(newStream.closed).toBe(false);
    expect(action('start')?.disabled).toBe(true);
    expect(action('resume')).not.toBeNull();
    expect(microphone).not.toHaveBeenCalled();
    await paint({ ...newCase, contextRevision: 99, handover: handoverAt(1, true) });
    http.verify();
  });

  it.each([true, false])('ignores a higher-revision resume reply from an expired session (%s same case ID)', async sameCase => {
    const oldCase = { ...populatedCase(), handover: handoverAt(5, true) };
    await setup(oldCase); live(); consent();
    action('resume')!.click();
    http.expectOne({ method: 'GET', url: caseUrl }).flush(oldCase);
    await settle();
    const oldResume = http.expectOne({ method: 'POST', url: `${caseUrl}/handover` });
    const api = TestBed.inject(CustomerApi), store = TestBed.inject(CaseStore);
    api.clearSession(); store.clear(); fixture.detectChanges();
    const newCase = { ...populatedCase(), id: sameCase ? CASE_ID : 'case_after_expiry' };
    const signIn = api.signIn('explicit-replacement-code');
    http.expectOne({ method: 'POST', url: '/api/sessions' }).flush({ csrfToken: 'csrf_replacement' });
    await settle(); http.expectOne({ method: 'POST', url: '/api/cases' }).flush(newCase);
    await signIn;
    store.connect(); FakeEventSource.instances.at(-1)!.open(); store.refresh();
    await paint(newCase); consent();
    expect(action('resume')).toBeNull();
    FakeEventSource.instances.at(-1)!.emit('advisor.context.updated', {
      ...contextUpdate(99), caseId: newCase.id, handover: handoverAt(1, true),
    });
    oldResume.flush({
      caseId: CASE_ID, caseRevision: oldCase.caseRevision + 1, contextRevision: 100,
      handover: handoverAt(6, false), contact: PAX_HUMAN_ADVISOR_CONTACT,
      command: { messageId: oldResume.request.body.messageId, action: 'resume', replayed: false, changed: true },
    });
    await settle(); fixture.detectChanges();
    expect(action('start')?.disabled).toBe(true);
    expect(action('resume')).not.toBeNull();
    expect(api.session()).toEqual({ caseId: newCase.id, csrfToken: 'csrf_replacement' });
    expect(microphone).not.toHaveBeenCalled();
    await paint({ ...newCase, contextRevision: 99, handover: handoverAt(1, true) });
    http.verify();
  });

  it('explains default mock configuration and offers no misleading preparation/media controls', async () => {
    await setup(emptyCase(), false, false); live(); consent();
    expect(controls().textContent).toContain('start:api');
    expect(action('prepare')).toBeNull();
    expect(action('start')?.disabled).toBe(true);
    expect(controls().querySelector('#lab-person')).toBeNull();
    expect(microphone).not.toHaveBeenCalled(); http.verify();
  });

  it('blocks the exact voice-enabled/extraction-disabled setup instead of silently falling back to rules',async()=>{
    extractionNotice={...extractionNotice,enabled:false};
    try {
      await setup(populatedCase());consent();live();
      expect(action('start')?.disabled).toBe(true);
      expect(controls().querySelector('[data-status="extraction"]')?.textContent).toContain('deaktiviert');
      action('start')!.click();expect(microphone).not.toHaveBeenCalled();
      http.expectNone(request=>request.method==='POST');http.verify();
    } finally {extractionNotice={...extractionNotice,enabled:true};}
  });

  describe('Intake conversation', () => {
    const fieldIds = ['annual_gross_income_chf', 'employment_rate_percent', 'civil_status', 'has_pension_fund',
      'pillar_3a_annual_contribution_chf', 'monthly_housing_cost_chf', 'desired_retirement_age', 'risk_appetite'];
    const scripted = (batchChanges: { path: string; personId?: string; value: unknown }[]) =>
      reviewCase({ proposalBatches: batchChanges.length ? [{ id: 'open', status: 'proposed', changes: batchChanges }] : [], confirmedVersions: [], ambiguities: [] } as unknown as Partial<InsuranceCaseDto>);

    it('updates the readable conversation context from canonical proposals and corrections without showing demo income as captured', async () => {
      await setup(populatedCase());
      const context = () => fixture.nativeElement.querySelector('.conversation-context') as HTMLElement | null;
      expect(context()).not.toBeNull();
      expect(context()!.textContent).toContain('Noch keine');
      expect(context()!.textContent).not.toMatch(/120.000/);
      const capturedCase = (cents: number, revision: number) => ({
        ...scripted([{ path: 'insurance.persons.0.grossAnnualIncomeCents', personId: 'person_demo_1', value: cents }]),
        caseRevision: revision, contextRevision: revision,
      });
      const revision = populatedCase().contextRevision + 10;
      FakeEventSource.instances[0].emit('advisor.context.updated', { ...contextUpdate(revision), caseId: CASE_ID });
      await paint(capturedCase(11900000, revision));
      expect(context()!.textContent).toMatch(/119.000/);
      expect(context()!.textContent).toContain('brutto pro Jahr');
      expect(context()!.textContent).toContain('noch nicht übernommen');
      FakeEventSource.instances[0].emit('advisor.context.updated', { ...contextUpdate(revision + 1), caseId: CASE_ID });
      await paint(capturedCase(11800000, revision + 1));
      expect(context()!.textContent).toMatch(/118.000/);
      expect(context()!.textContent).not.toMatch(/119.000/);
      expect(context()!.querySelector('pre, code, ul, dl')).toBeNull();
      http.verify();
    });

    it('shows all eight fields on the right before anything is said', async () => {
      await setup(populatedCase());
      expect(Array.from(fixture.nativeElement.querySelectorAll('.canonical .intake [data-field]')).map(row => (row as HTMLElement).dataset['field'])).toEqual(fieldIds);
      expect(intakeRow('annual_gross_income_chf').dataset['status']).toBe('asking');
      expect(fixture.nativeElement.querySelector('.intake-progress').textContent).toContain('0/8');
    });

    it('keeps live clarification open across a failed extraction instead of skipping the unanswered field', async () => {
      await setup(populatedCase()); live(); consent();
      const peerChannel = { readyState: 'open', send: vi.fn(), close: vi.fn(), onmessage: null as ((event: { data: string }) => void) | null, onclose: null };
      microphone.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
      vi.stubGlobal('RTCPeerConnection', function () { return {
        iceGatheringState: 'complete', localDescription: { sdp: 'v=offer' }, addTrack: vi.fn(), createDataChannel: () => peerChannel,
        createOffer: async () => ({ sdp: 'v=offer' }), setLocalDescription: async () => {}, setRemoteDescription: vi.fn(async () => {}), close: vi.fn(), ontrack: null, onconnectionstatechange: null,
      }; });
      vi.stubGlobal('Audio', function () { return { autoplay: false, pause: vi.fn(), play: async () => {}, srcObject: null }; });
      action('start')!.click(); await paint(populatedCase());
      const sid = '11111111-1111-4111-8111-111111111111', voiceSession = { id: sid, expiresAt: new Date(Date.now() + 60000).toISOString() };
      http.expectOne({ method: 'POST', url: `${caseUrl}/voice/sessions` }).flush({ voiceSession, connection: { provider: 'gpt-live', transport: { type: 'webrtc', sdp: 'v=answer' } } });
      await paint(populatedCase());
      const emit = (payload: unknown) => peerChannel.onmessage!({ data: JSON.stringify(payload) });
      emit({ type: 'session.started' }); fixture.detectChanges();
      const say = async (text: string, id: string) => {
        emit({ type: 'session.input_transcript.delta', event_id: id, delta: text });
        await new Promise(resolve => setTimeout(resolve, 1550)); await paint(populatedCase());
        http.expectOne({ method: 'POST', url: `${caseUrl}/voice/sessions/${sid}/turns` }).flush({ voiceSession, replayed: false }); await settle();
        return http.expectOne({ method: 'POST', url: `${caseUrl}/voice-lab/turns` });
      };
      (await say('Ich verdiene 100.000 Franken', 'one')).flush({ mode: 'live', source: { text: 'x' }, extraction: { adapter: 'model-v1', route: 'VoiceIntegrationService.propose', request: { observations: [] },
        clarifications: [{ fieldId: 'annual_gross_income_chf', quote: '100.000 Franken', value: '100000', code: 'AMBIGUOUS_VALUE' }], result: { proposalBatch: null, issues: [] } } });
      await paint(populatedCase());
      expect(intakeRow('annual_gross_income_chf').dataset['status']).toBe('unclear');
      expect(intakeRow('annual_gross_income_chf').textContent).toContain('100.000 Franken');
      expect(fixture.nativeElement.querySelector('.conversation-context').textContent).toContain('noch unklar');
      // Paxi is steered to the short clarification, not the long income question again.
      expect(peerChannel.send.mock.calls.map(call => JSON.parse(call[0] as string).content as string).at(-1))
        .toContain(TestBed.inject(TranslocoService).translate('lab.intake.clarify'));

      (await say('Ähm', 'two')).flush({ code: 'VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
      await paint(populatedCase());
      // A conflict is retried once. A failed retry must not masquerade as an unanswered field.
      http.expectOne({ method: 'POST', url: `${caseUrl}/voice-lab/turns` }).flush({ code: 'VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
      await paint(populatedCase());
      expect(controls().textContent).toContain('connected'); // A failed extraction never ends the conversation.
      expect(fixture.nativeElement.querySelector('.conversation-context').textContent).toContain('konnte nicht ausgewertet werden');
      expect(intakeRow('annual_gross_income_chf').dataset['status']).toBe('unclear');
      const messages = peerChannel.send.mock.calls.map(call => JSON.parse(call[0] as string).content as string);
      expect(messages.at(-1)).toContain(TestBed.inject(TranslocoService).translate('lab.intake.clarify'));
      action('stop')!.click();
      http.expectOne({ method: 'POST', url: `${caseUrl}/voice/sessions/${sid}/close` }).flush({});
    }, 15000);

    it('shows civil status and risk appetite as translated words, never the raw enum', async () => {
      await setup(scripted([{ path: 'insurance.relationship', value: 'registered_partnership' }, { path: 'insurance.riskAppetite', value: 'low' }]));
      const translate = (key: string) => TestBed.inject(TranslocoService).translate(key);
      expect(intakeRow('civil_status').textContent).toContain(translate('lab.intake.value.civil_status.registered_partnership'));
      expect(intakeRow('civil_status').textContent).not.toContain('registered_partnership');
      expect(intakeRow('risk_appetite').textContent).toContain(translate('lab.intake.value.risk_appetite.low'));
      expect(intakeRow('risk_appetite').textContent).not.toMatch(/\blow\b/);
    });

    it('retries a racing conflict once with the same message id and does not count it as a failed attempt', async () => {
      await setup(populatedCase()); live(); consent();
      const peerChannel = { readyState: 'open', send: vi.fn(), close: vi.fn(), onmessage: null as ((event: { data: string }) => void) | null, onclose: null };
      microphone.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
      vi.stubGlobal('RTCPeerConnection', function () { return {
        iceGatheringState: 'complete', localDescription: { sdp: 'v=offer' }, addTrack: vi.fn(), createDataChannel: () => peerChannel,
        createOffer: async () => ({ sdp: 'v=offer' }), setLocalDescription: async () => {}, setRemoteDescription: vi.fn(async () => {}), close: vi.fn(), ontrack: null, onconnectionstatechange: null,
      }; });
      vi.stubGlobal('Audio', function () { return { autoplay: false, pause: vi.fn(), play: async () => {}, srcObject: null }; });
      action('start')!.click(); await paint(populatedCase());
      const sid = '11111111-1111-4111-8111-111111111111', voiceSession = { id: sid, expiresAt: new Date(Date.now() + 60000).toISOString() };
      http.expectOne({ method: 'POST', url: `${caseUrl}/voice/sessions` }).flush({ voiceSession, connection: { provider: 'gpt-live', transport: { type: 'webrtc', sdp: 'v=answer' } } });
      await paint(populatedCase());
      peerChannel.onmessage!({ data: JSON.stringify({ type: 'session.started' }) });
      peerChannel.onmessage!({ data: JSON.stringify({ type: 'session.input_transcript.delta', event_id: 'one', delta: 'Ich verdiene 100.000 Franken' }) });
      await new Promise(resolve => setTimeout(resolve, 1550)); await paint(populatedCase());
      http.expectOne({ method: 'POST', url: `${caseUrl}/voice/sessions/${sid}/turns` }).flush({ voiceSession, replayed: false }); await settle();
      const first = http.expectOne({ method: 'POST', url: `${caseUrl}/voice-lab/turns` });
      const messageId = first.request.body.messageId;
      first.flush({ code: 'STALE_PROPOSAL' }, { status: 409, statusText: 'Conflict' });
      await paint(populatedCase());
      const retry = http.expectOne({ method: 'POST', url: `${caseUrl}/voice-lab/turns` });
      expect(retry.request.body.messageId).toBe(messageId);
      retry.flush({ mode: 'live', source: { text: 'x' }, extraction: { adapter: 'model-v1', route: 'VoiceIntegrationService.propose', request: { observations: [] },
        clarifications: [{ fieldId: 'annual_gross_income_chf', quote: '100.000 Franken', value: '100000', code: 'AMBIGUOUS_VALUE' }], result: { proposalBatch: null, issues: [] } } });
      await paint(populatedCase());
      expect(intakeRow('annual_gross_income_chf').dataset['status']).toBe('unclear'); // The conflict left the attempts untouched.
      action('stop')!.click();
      http.expectOne({ method: 'POST', url: `${caseUrl}/voice/sessions/${sid}/close` }).flush({});
    }, 15000);

    it('requires the separate extraction consent before Live when the backend offers the model, and sends the exact notice hash', async () => {
      extractionNotice = { enabled: true, version: 'notice', noticeHash: 'a'.repeat(64), text: 'Separate OpenAI extraction notice' };
      try {
        await setup(populatedCase()); live();
        expect(controls().textContent).toContain('Separate OpenAI extraction notice');
        const boxes = () => Array.from(controls().querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not([data-setting])'));
        expect(boxes()).toHaveLength(2);
        consent(false);
        expect(action('start')?.disabled).toBe(true);
        const box = controls().querySelector<HTMLInputElement>('[data-action="extraction-consent"]')!;
        box.checked = true; box.dispatchEvent(new Event('change')); fixture.detectChanges();
        expect(action('start')?.disabled).toBe(false);
        action('start')!.click(); await paint(populatedCase());
        const grant = http.expectOne({ method: 'POST', url: `${caseUrl}/extraction/consent` });
        expect(grant.request.body).toEqual({ expectedCaseRevision: populatedCase().caseRevision, noticeVersion: 'notice', noticeHash: 'a'.repeat(64),
          dataClassification: 'synthetic', allowSyntheticModelExtraction: true });
        expect(microphone).not.toHaveBeenCalled(); // The transfer consent settles before media opens.
        grant.flush({}); await paint(populatedCase());
        expect(microphone).toHaveBeenCalledOnce();
      } finally { extractionNotice = { enabled: true, version: 'notice', noticeHash: 'hash', text: 'Synthetic extraction notice' }; }
    });
  });

  it('routes the actual observed spoken-word transcripts from one live connection through authenticated HTTP without rewriting their source text', async () => {
    await setup(populatedCase()); live();
    const select = controls().querySelector<HTMLSelectElement>('#lab-person')!;
    select.value = 'person_demo_2'; select.dispatchEvent(new Event('change'));
    await settle(); fixture.detectChanges(); consent();
    const track = { stop: vi.fn() };
    const time=controls().querySelector<HTMLSelectElement>('#lab-time')!;
    time.value='5';time.dispatchEvent(new Event('change'));
    const priority=controls().querySelector<HTMLSelectElement>('#lab-priority')!;
    priority.value='monthly_housing_cost_chf';priority.dispatchEvent(new Event('change'));
    const skill=controls().querySelector<HTMLInputElement>('[data-setting="skill"]')!;
    skill.checked=false;skill.dispatchEvent(new Event('change'));fixture.detectChanges();
    microphone.mockResolvedValue({ getTracks: () => [track] });
    const channel = { readyState: 'open', send: vi.fn(), close: vi.fn(), onmessage: null as ((event: { data: string }) => void) | null, onclose: null };
    const peer = {
      iceGatheringState: 'complete', localDescription: { sdp: 'v=client-offer' }, addTrack: vi.fn(),
      createDataChannel: () => channel, createOffer: async () => ({ sdp: 'v=client-offer' }),
      setLocalDescription: async () => {}, setRemoteDescription: vi.fn(async () => {}), close: vi.fn(),
      ontrack: null, onconnectionstatechange: null,
    };
    const audio = { autoplay: false, pause: vi.fn(), play: async () => {}, srcObject: null };
    vi.stubGlobal('RTCPeerConnection', function () { return peer; });
    vi.stubGlobal('Audio', function () { return audio; });
    action('start')!.click(); await paint(populatedCase());
    const session = http.expectOne({ method: 'POST', url: `${caseUrl}/voice/sessions` });
    expect(session.request.headers.get('X-CSRF-Token')).toBe('csrf_test');
    expect(session.request.body).toMatchObject({ provider: 'gpt-live', sdp: 'v=client-offer', allowExternalVoiceProcessing: true });
    expect(session.request.body.conversationSettings).toEqual({skillIds:[],timeBudgetMinutes:5,priorities:['monthly_housing_cost_chf']});
    const sid = '11111111-1111-4111-8111-111111111111';
    const voiceSession = { id: sid, expiresAt: new Date(Date.now() + 60000).toISOString() };
    session.flush({ voiceSession, connection: { provider: 'gpt-live', transport: { type: 'webrtc', sdp: 'v=server-answer' } } });
    await paint(populatedCase());
    const emit = (payload: unknown) => channel.onmessage!({ data: JSON.stringify(payload) });
    emit({ type: 'session.started' }); fixture.detectChanges();
    const turns: { speaker: string; text: string; messageId: string }[] = [];
    let current = populatedCase();
    for (const [speaker, text] of [
      ['customer', 'My annual gross income is one hundred nineteen thousand Swiss francs'],
      ['agent', "Thanks. And what's your monthly net income, also in CHF?"],
      ['customer', 'Correction. My annual gross income is one hundred eighteen thousand Swiss francs'],
      ['agent', 'Got it, thanks. Now, your monthly net income, please?'],
    ]) {
      emit({ type: speaker === 'customer' ? 'session.input_transcript.delta' : 'session.output_transcript.delta', event_id: `segment_${turns.length}`, delta: text });
      await new Promise(resolve => setTimeout(resolve, 1550));
      await paint(current);
      const turn = http.expectOne({ method: 'POST', url: `${caseUrl}/voice/sessions/${sid}/turns` });
      expect(turn.request.headers.get('X-CSRF-Token')).toBe('csrf_test');
      expect(turn.request.body).toMatchObject({ speaker, log: { caseId: CASE_ID, text, transcriptStatus: 'final', dataClassification: 'synthetic' } });
      turns.push({ speaker, text, messageId: turn.request.body.log.messageId });
      turn.flush({ voiceSession, replayed: false }); await settle();
      if (speaker === 'customer') {
        const extract = http.expectOne({ method: 'POST', url: `${caseUrl}/voice-lab/turns` });
        expect(extract.request.body).toEqual({ mode: 'live', voiceSessionId: sid, messageId: turn.request.body.log.messageId, personId: 'person_demo_2' });
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.conversation-context').textContent).toContain('wird im Backend ausgewertet');
        const cents = text!.startsWith('Correction') ? 11800000 : 11900000;
        const batch = { id: `batch_${turns.length}`, status: 'proposed', changes: [{ path: 'insurance.persons.1.grossAnnualIncomeCents', personId: 'person_demo_2', value: cents }] };
        current = { ...current, caseRevision: current.caseRevision + 1, contextRevision: current.contextRevision + 1,
          proposalBatches: [batch] } as InsuranceCaseDto;
        extract.flush({ mode: 'live', source: { text }, extraction: { adapter: 'model-v1', route: 'VoiceIntegrationService.propose', request: { observations: [{ fieldId: 'annual_gross_income_chf' }] }, result: { proposalBatch: batch, confirmationStillRequired: true } } });
      } else http.expectNone({ method: 'POST', url: `${caseUrl}/voice-lab/turns` });
      await paint(current);
      const context = fixture.nativeElement.querySelector('.conversation-context') as HTMLElement;
      expect(context.textContent).toMatch(turns.length < 3 ? /119.000/ : /118.000/);
      if (turns.length >= 3) expect(context.textContent).not.toMatch(/119.000/);
      if (speaker === 'customer') expect(context.querySelector('blockquote')!.textContent).toBe(text);
    }
    expect(turns.map(turn => turn.speaker)).toEqual(['customer', 'agent', 'customer', 'agent']);
    expect(new Set(turns.map(turn => turn.messageId)).size).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('.turns li')).toHaveLength(4);
    expect(fixture.nativeElement.querySelector('.turns').textContent).toContain('Correction. My annual gross income is one hundred eighteen thousand Swiss francs');
    expect(microphone).toHaveBeenCalledOnce();
    expect(controls().textContent).toContain('connected');
    expect(channel.send.mock.calls.map(call => JSON.parse(call[0] as string).content).at(-1)).toContain('11800000');
    http.expectNone({ method: 'POST', url: `${caseUrl}/voice/sessions` });
    action('stop')!.click();
    expect(track.stop).toHaveBeenCalledOnce(); expect(peer.close).toHaveBeenCalledOnce();
    http.expectOne({ method: 'POST', url: `${caseUrl}/voice/sessions/${sid}/close` }).flush({});
    await settle(); fixture.detectChanges(); http.verify();
  }, 15000);
});
