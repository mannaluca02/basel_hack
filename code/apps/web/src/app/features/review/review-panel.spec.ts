import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdvisorDataSource } from '../../core/advisor/advisor-data-source';
import { CUSTOMER_SESSION_KEY } from '../../core/advisor/api/customer-api';
import { CustomerReview } from '../../core/advisor/api/customer-review';
import {
  BATCH_ID,
  CASE_ID,
  QUESTION_TEXT,
  acceptedCase,
  acceptedContext,
  batchConfirmation,
  profileConfirmation,
  reviewCase,
  reviewContext,
  serve,
  settle,
} from '../../core/advisor/api/review-testing';
import { FakeDataSource, contextUpdate, event } from '../../core/advisor/store/case-testing';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { CONSENT_NOTICE_VERSION, CONSENT_STORAGE_KEY } from '../../core/consent/consent';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { AppLanguage } from '../../core/i18n/language';
import { ReviewPanel } from './review-panel';

describe('ReviewPanel', () => {
  let source: FakeDataSource;
  let http: HttpTestingController;
  let fixture: ComponentFixture<ReviewPanel>;
  let root: HTMLElement;

  const stable = () => settle(() => fixture.whenStable());
  const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');

  function setup(session: boolean, environment: Record<string, unknown> = {}) {
    sessionStorage.clear();
    sessionStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_NOTICE_VERSION);
    if (session) {
      sessionStorage.setItem(
        CUSTOMER_SESSION_KEY,
        JSON.stringify({ csrfToken: 'csrf_1', caseId: CASE_ID }),
      );
    }
    source = new FakeDataSource();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: AdvisorDataSource, useValue: source },
        {
          provide: APP_ENVIRONMENT,
          useValue: { production: false, apiBaseUrl: '/api', dataSource: 'api', ...environment },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReviewPanel);
    root = fixture.nativeElement as HTMLElement;
  }

  const confirmations = `/api/cases/${CASE_ID}/customer-confirmations`;
  const button = (name: string) =>
    Array.from(root.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === name,
    ) as HTMLButtonElement | undefined;

  /** Opens the question: the fresh case read, then the create request, answered with `question`. */
  async function open(name: string, question: ReturnType<typeof batchConfirmation>) {
    button(name)?.click();
    await stable();
    http.expectOne(`/api/cases/${CASE_ID}`).flush(reviewCase());
    await stable();
    const create = http.expectOne({ method: 'POST', url: confirmations });
    create.flush(question);
    await stable();
    return create.request.body;
  }

  /** Presents an opened batch question; the backend then awaits the answer. */
  async function present(question = batchConfirmation()) {
    serve(http, { confirmation: question });
    await stable();
    const presented = http.expectOne(`${confirmations}/${question.id}/presented`);
    const shown = { ...question, status: 'awaiting_answer', presentedAt: question.createdAt };
    presented.flush(shown);
    await stable();
    serve(http, { confirmation: shown as typeof question });
    await stable();
    return presented.request.body;
  }

  async function render(state: Parameters<typeof serve>[1] = {}, environment: Record<string, unknown> = {}) {
    setup(true, environment);
    await fixture.whenStable();
    serve(http, state);
    await stable();
  }

  describe('package display', () => {
    it('shows the server package with person, gross annual basis, amount and status', async () => {
      await render();

      const batch = root.querySelector('.batch');
      expect(root.querySelectorAll('.batch')).toHaveLength(1);
      expect(batch?.textContent).toContain('Person 1');
      expect(batch?.textContent).toContain('Bruttojahreseinkommen');
      expect(batch?.textContent).toContain('pro Jahr');
      expect(batch?.textContent).toMatch(/119.000/);
      expect(batch?.textContent).toContain('Zur Annahme offen');
    });

    it('names a budget net change with its own basis and period', async () => {
      const dto = reviewCase();
      const batch = {
        ...dto.proposalBatches[1],
        changes: [
          { path: 'financial.persons.0.income.value', personId: 'person_demo_1', value: 8300000 },
        ],
      };
      await render({ dto: { ...dto, proposalBatches: [batch] } });

      const shown = root.querySelector('.batch')?.textContent ?? '';
      expect(shown).toContain('Netto nach Einkommenssteuer');
      expect(shown).toMatch(/83.000/);
      expect(shown).toContain('pro Jahr');
    });

    it('shows a change without a customer wording with its person and a formatted amount', async () => {
      const dto = reviewCase();
      const path = 'insurance.persons.0.deathNeedAnnualCents';
      const batch = {
        ...dto.proposalBatches[1],
        changes: [{ path, personId: 'person_demo_1', value: 10000000 }],
      };
      await render({ dto: { ...dto, proposalBatches: [batch] } });

      const shown = root.querySelector('.batch')?.textContent ?? '';
      expect(shown).toContain('Person 1');
      expect(shown).toContain(path);
      expect(shown).toMatch(/100.000/);
    });

    it('shows a structured change by its path and value', async () => {
      const dto = reviewCase();
      const batch = {
        ...dto.proposalBatches[1],
        changes: [{ path: 'goals.0.priority', value: 2 }],
      };
      await render({ dto: { ...dto, proposalBatches: [batch] } });

      expect(root.querySelector('.batch')?.textContent).toContain('goals.0.priority: 2');
    });

    it('keeps budget net apart from the proposed gross', async () => {
      await render();

      const person = root.querySelector('.draft')?.textContent ?? '';
      expect(person).toMatch(/120.000/);
      expect(person).toContain('Netto nach Einkommenssteuer');
      expect(person).toMatch(/84.000/);
    });

    it('offers an answered clarification for acceptance instead of asking it again', async () => {
      await render();

      expect(text()).toContain('Wie hoch ist Ihr Bruttojahreseinkommen?');
      expect(text()).toContain('Die Antwort liegt zur Übernahme bereit');
    });

    it('does not read a missing next question as a confirmed profile', async () => {
      await render({ context: reviewContext({ nextQuestion: null }) });

      expect(text()).toContain('Zuerst offene Änderungen entscheiden');
      expect(text()).not.toContain('Bestätigt in Version');
    });
  });

  describe('current state', () => {
    it('loads the current case again after a context event', async () => {
      await render();

      source.emit(event('context', contextUpdate(6)));
      await stable();
      serve(http, { dto: acceptedCase(), context: acceptedContext() });
      await stable();

      expect(root.querySelector('.batch')?.textContent).toContain('Angenommen');
    });

    it('loads the current case again after a reconnect', async () => {
      await render();
      source.connectionState.next('disconnected');

      source.connectionState.next('connected');
      await stable();
      serve(http, { dto: acceptedCase(), context: acceptedContext() });
      await stable();

      expect(root.querySelector('.batch')?.textContent).toContain('Angenommen');
    });

    it('notices a stream the browser gave up and says that the view is not live', async () => {
      await render();
      source.connectionState.next('connecting');
      source.connectionState.next('connected');
      await stable();
      serve(http);
      await stable();

      source.connectionState.next('disconnected');
      await stable();
      serve(http, { dto: acceptedCase(), context: acceptedContext() });
      await stable();

      expect(root.querySelector('.batch')?.textContent).toContain('Angenommen');
      expect(text()).toContain('Keine Live-Verbindung');
    });

    it('asks the backend to follow the language, so its questions stay in the language shown', async () => {
      await render();

      await TestBed.inject(AppLanguage).use('fr');
      await stable();
      const patch = http.expectOne(`/api/cases/${CASE_ID}/preferences`);
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.headers.get('X-CSRF-Token')).toBe('csrf_1');
      expect(patch.request.body).toEqual({ locale: 'fr' });
      patch.flush({ caseRevision: 6, contextRevision: 6, locale: 'fr' });
      await stable();
      serve(http, { dto: reviewCase({ locale: 'fr' }) });
      await stable();

      http.expectNone(`/api/cases/${CASE_ID}/preferences`);
    });

    it('drops an older reload that answers after a newer one', async () => {
      await render();

      source.emit(event('context', contextUpdate(6)));
      const late = http.expectOne(`/api/cases/${CASE_ID}`);
      const lateContext = http.expectOne(`/api/cases/${CASE_ID}/advisor/context`);
      const lateCurrent = http.expectOne(`/api/cases/${CASE_ID}/customer-confirmations/current`);
      source.emit(event('context', contextUpdate(7)));
      serve(http, { dto: acceptedCase(), context: acceptedContext() });
      await stable();

      late.flush(reviewCase());
      lateContext.flush(reviewContext());
      lateCurrent.flush({ confirmation: null });
      await stable();

      expect(root.querySelector('.batch')?.textContent).toContain('Angenommen');
    });
  });

  describe('package decision', () => {
    it('binds the question to the current revision and only reports what was really shown', async () => {
      await render();

      const body = await open('Änderung prüfen', batchConfirmation());

      expect(body).toMatchObject({
        target: { kind: 'accept_batch', batchId: BATCH_ID },
        channel: 'screen',
        expectedCaseRevision: reviewCase().caseRevision,
      });
      expect(body.questionTurnId).not.toBe(body.questionReplyId);
      expect(root.querySelector('.question')?.textContent).toContain(QUESTION_TEXT);
      expect(button('Änderung übernehmen')?.disabled).toBe(true);

      const presented = await present();

      expect(presented).toEqual({
        expectedCaseRevision: 6,
        questionId: batchConfirmation().questionId,
        questionHash: batchConfirmation().questionHash,
        questionTurnId: batchConfirmation().questionTurnId,
        questionReplyId: batchConfirmation().questionReplyId,
        reviewDisplayed: true,
        profileAndAssumptionsDisplayed: false,
        privacyNoticeDisplayed: false,
      });
      expect(button('Änderung übernehmen')?.disabled).toBe(false);
    });

    it('moves keyboard focus to the question', async () => {
      await render();

      await open('Änderung prüfen', batchConfirmation());

      expect(document.activeElement).toBe(root.querySelector('.question h3'));
    });

    it('returns keyboard focus to the review stand once the question is decided', async () => {
      await render();
      await open('Änderung prüfen', batchConfirmation());
      await present();

      button('Änderung ablehnen')?.click();
      await stable();
      http
        .expectOne(`${confirmations}/${batchConfirmation().id}/answer`)
        .flush({ accepted: false, confirmationStillRequired: false, profileVersion: 1 });
      await stable();
      serve(http);
      await stable();

      expect(document.activeElement).toBe(root.querySelector('h2'));
    });

    it('accepting takes over this package and leaves the profile unconfirmed', async () => {
      await render();
      await open('Änderung prüfen', batchConfirmation());
      await present();

      button('Änderung übernehmen')?.click();
      await stable();
      const answer = http.expectOne(`${confirmations}/${batchConfirmation().id}/answer`);
      expect(answer.request.body).toMatchObject({
        channel: 'screen',
        decision: 'accept',
        expectedCaseRevision: 6,
      });
      answer.flush({ accepted: true, confirmationStillRequired: true, profileVersion: 1 });
      await stable();
      serve(http, { dto: acceptedCase(), context: acceptedContext() });
      await stable();

      expect(root.querySelector('.batch')?.textContent).toContain('Angenommen');
      const draft = root.querySelector('.draft')?.textContent ?? '';
      expect(draft).toMatch(/119.000/);
      expect(draft).toMatch(/84.000/);
      expect(text()).toContain('Das Gesamtprofil ist noch nicht bestätigt.');
      expect(root.querySelector('.question')).toBeNull();
      http.expectNone({ method: 'POST', url: confirmations });
    });

    it('rejecting takes over nothing and leaves the clarification open', async () => {
      await render();
      await open('Änderung prüfen', batchConfirmation());
      await present();

      button('Änderung ablehnen')?.click();
      await stable();
      const answer = http.expectOne(`${confirmations}/${batchConfirmation().id}/answer`);
      expect(answer.request.body.decision).toBe('reject');
      answer.flush({ accepted: false, confirmationStillRequired: false, profileVersion: 1 });
      await stable();
      const dto = reviewCase();
      serve(http, {
        dto: {
          ...dto,
          proposalBatches: dto.proposalBatches.map((batch) => ({
            ...batch,
            status: batch.id === BATCH_ID ? 'rejected' : batch.status,
          })),
        },
        context: reviewContext({
          ambiguities: reviewContext().ambiguities.map((item) => ({
            ...item,
            dialogueStatus: 'needs_answer',
            answerBatchId: null,
          })),
          pendingAcceptanceBatchIds: [],
        }),
      });
      await stable();

      expect(root.querySelector('.batch')?.textContent).toContain('Abgelehnt');
      expect(root.querySelector('.draft')?.textContent).toMatch(/120.000/);
      expect(text()).toContain('Die Antwort steht noch aus.');
    });

    it('cancelling leaves the package open, unlike a rejection', async () => {
      await render();
      await open('Änderung prüfen', batchConfirmation());
      await present();

      button('Abbrechen')?.click();
      await stable();
      const cancel = http.expectOne(`${confirmations}/${batchConfirmation().id}/cancel`);
      expect(cancel.request.body).toEqual({
        expectedCaseRevision: 6,
        reason: 'cancelled_by_customer',
      });
      cancel.flush({});
      await stable();
      serve(http);
      await stable();

      expect(root.querySelector('.question')).toBeNull();
      expect(root.querySelector('.batch')?.textContent).toContain('Zur Annahme offen');
    });
  });

  describe('profile confirmation', () => {
    const notice = {
      version: 'lifemap-synthetic-v2',
      display: {
        title: 'Datennutzung vor dem Start',
        purpose: 'Erfundene Angaben',
        recipients: 'Logismata und getrennt davon OpenAI',
        storage: 'Verschlüsselt',
        release: 'Keine Freigabe',
      },
    };
    const messages = {
      'assumption.synthetic': 'Ausschliesslich erfundene Daten.',
      'assumption.separate': 'Getrennte Grössen.',
      'assumption.snapshot': 'Eine Momentaufnahme.',
      'assumption.rounding': 'Ganze Rappen.',
    };

    async function openProfile() {
      await render({ dto: acceptedCase(), context: acceptedContext() });
      const body = await open('Gesamtprofil prüfen', profileConfirmation());
      serve(http, {
        dto: acceptedCase(),
        context: acceptedContext(),
        confirmation: profileConfirmation(),
      });
      await stable();
      http.expectOne('/api/privacy').flush(notice);
      http.expectOne('/api/translations').flush({ messages });
      await stable();
      return body;
    }

    it('is only offered once packages and clarifications are decided', async () => {
      await render();

      expect(button('Gesamtprofil prüfen')?.disabled).toBe(true);
    });

    it('blocks the profile while a clarification is open, even without a package', async () => {
      const dto = reviewCase();
      await render({
        dto: {
          ...dto,
          proposalBatches: dto.proposalBatches.filter((batch) => batch.id !== BATCH_ID),
        },
      });

      expect(button('Gesamtprofil prüfen')?.disabled).toBe(true);
      expect(text()).toContain('Offene Rückfragen verhindern');
    });

    it('shows the profile, the assumptions and the notice before reporting them as shown', async () => {
      const body = await openProfile();

      expect(body.target).toEqual({ kind: 'confirm_profile' });
      const question = root.querySelector('.question')?.textContent ?? '';
      expect(question).toContain(profileConfirmation().questionText);
      expect(question).toMatch(/119.000/);
      expect(question).toContain('insurance.relationship');
      expect(question).toContain('Ausschliesslich erfundene Daten.');
      expect(question).toContain('Logismata und getrennt davon OpenAI');
      expect(button('Gesamtprofil bestätigen')?.disabled).toBe(true);

      const presented = http.expectOne(`${confirmations}/${profileConfirmation().id}/presented`);
      expect(presented.request.body).toMatchObject({
        reviewDisplayed: true,
        profileAndAssumptionsDisplayed: true,
        privacyNoticeDisplayed: true,
      });
      expect(presented.request.body).not.toHaveProperty('playback');
    });

    it('reports nothing while the notice could not be loaded', async () => {
      await render({ dto: acceptedCase(), context: acceptedContext() });
      await open('Gesamtprofil prüfen', profileConfirmation());
      serve(http, {
        dto: acceptedCase(),
        context: acceptedContext(),
        confirmation: profileConfirmation(),
      });
      await stable();

      http
        .expectOne('/api/privacy')
        .flush({ code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'x' });
      http.expectOne('/api/translations').flush({ messages });
      await stable();

      http.expectNone(`${confirmations}/${profileConfirmation().id}/presented`);
      expect(root.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('offers no confirmation after a reload until the profile is on screen again', async () => {
      const question = profileConfirmation();
      const shown = { ...question, status: 'awaiting_answer', presentedAt: question.createdAt };
      await render({
        dto: acceptedCase(),
        context: acceptedContext(),
        confirmation: shown as typeof question,
      });

      expect(button('Gesamtprofil bestätigen')?.disabled).toBe(true);

      http.expectOne('/api/privacy').flush(notice);
      http.expectOne('/api/translations').flush({ messages });
      await stable();

      expect(button('Gesamtprofil bestätigen')?.disabled).toBe(false);
    });

    it('confirming the shown profile is the action that creates the new version', async () => {
      await openProfile();
      const question = profileConfirmation();
      const shown = { ...question, status: 'awaiting_answer', presentedAt: question.createdAt };
      http.expectOne(`${confirmations}/${question.id}/presented`).flush(shown);
      await stable();
      serve(http, {
        dto: acceptedCase(),
        context: acceptedContext(),
        confirmation: shown as typeof question,
      });
      await stable();

      button('Gesamtprofil bestätigen')?.click();
      await stable();
      const answer = http.expectOne(`${confirmations}/${question.id}/answer`);
      expect(answer.request.body).toMatchObject({ channel: 'screen', decision: 'accept' });
      answer.flush({ accepted: true, confirmationStillRequired: false, profileVersion: 2 });
      await stable();
      const confirmed = acceptedCase();
      serve(http, {
        dto: {
          ...confirmed,
          draftDirty: false,
          confirmedVersions: [
            ...confirmed.confirmedVersions,
            { ...confirmed.confirmedVersions[0], version: 2 },
          ],
        },
        context: acceptedContext(),
      });
      await stable();

      expect(text()).toContain('Bestätigt in Version 2.');
    });
  });

  describe('failures', () => {
    const refused = (code: string, status = 409) => ({
      body: { code, locale: 'de', message: `Server: ${code}` },
      options: { status, statusText: code },
    });

    it('shows a conflict and falls back to the central state', async () => {
      await render();
      button('Änderung prüfen')?.click();
      await stable();
      http.expectOne(`/api/cases/${CASE_ID}`).flush(reviewCase());
      await stable();

      const { body, options } = refused('VERSION_CONFLICT');
      http.expectOne({ method: 'POST', url: confirmations }).flush(body, options);
      await stable();
      serve(http, { dto: acceptedCase(), context: acceptedContext() });
      await stable();

      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        'Server: VERSION_CONFLICT',
      );
      expect(root.querySelector('.batch')?.textContent).toContain('Angenommen');
    });

    it('marks a package the backend calls stale and stops offering it', async () => {
      await render();
      button('Änderung prüfen')?.click();
      await stable();
      http.expectOne(`/api/cases/${CASE_ID}`).flush(reviewCase());
      await stable();

      const { body, options } = refused('STALE_PROPOSAL');
      http.expectOne({ method: 'POST', url: confirmations }).flush(body, options);
      await stable();
      serve(http, {
        dto: reviewCase({ draftDirty: true }),
        context: reviewContext({ ambiguities: [], missingFields: [] }),
      });
      await stable();

      expect(root.querySelector('.batch')?.textContent).toContain('Veraltet');
      expect(button('Änderung prüfen')).toBeUndefined();
      expect(button('Gesamtprofil prüfen')?.disabled).toBe(false);
    });

    it('never repeats an answer whose outcome is unknown and shows the central state', async () => {
      await render();
      await open('Änderung prüfen', batchConfirmation());
      await present();

      button('Änderung übernehmen')?.click();
      await stable();
      http
        .expectOne(`${confirmations}/${batchConfirmation().id}/answer`)
        .error(new ProgressEvent('error'));
      await stable();
      serve(http, { dto: acceptedCase(), context: acceptedContext() });
      await stable();

      expect(root.querySelector('[role="alert"]')?.textContent).toContain('nicht erreichbar');
      expect(root.querySelector('.batch')?.textContent).toContain('Angenommen');
      http.expectNone(`${confirmations}/${batchConfirmation().id}/answer`);
    });

    it('replaces an invalidated question by the notice to review again', async () => {
      await render();
      await open('Änderung prüfen', batchConfirmation());
      await present();

      source.emit(event('context', contextUpdate(9)));
      await stable();
      serve(http, {
        confirmation: batchConfirmation({
          status: 'invalidated',
          invalidationReason: 'case_changed',
        }),
      });
      await stable();

      expect(root.querySelector('.question')).toBeNull();
      expect(text()).toContain('Diese Frage gilt nicht mehr');
      expect(button('Änderung prüfen')?.disabled).toBe(false);
    });

    it('asks to sign in again when the session is gone', async () => {
      setup(true);
      await fixture.whenStable();
      source.connect();

      const { body, options } = refused('UNAUTHORIZED', 401);
      for (const url of [
        `/api/cases/${CASE_ID}`,
        `/api/cases/${CASE_ID}/advisor/context`,
        `${confirmations}/current`,
      ]) {
        for (const request of http.match(url)) request.flush(body, options);
      }
      await stable();

      expect(root.querySelector('form')).not.toBeNull();
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('Server: UNAUTHORIZED');
      expect(sessionStorage.getItem(CUSTOMER_SESSION_KEY)).toBeNull();
      expect(source.connectionState.value).toBe('disconnected');
    });

    it('asks to sign in again when the CSRF token is refused', async () => {
      await render();
      await open('Änderung prüfen', batchConfirmation());
      await present();

      button('Änderung übernehmen')?.click();
      await stable();
      const { body, options } = refused('CSRF_INVALID', 403);
      http.expectOne(`${confirmations}/${batchConfirmation().id}/answer`).flush(body, options);
      await stable();

      expect(root.querySelector('form')).not.toBeNull();
      expect(root.querySelector('.question')).toBeNull();
    });
  });

  describe('voice question', () => {
    it('leaves the answer to the voice and offers no screen decision', async () => {
      await render();
      const question = batchConfirmation({ channel: 'voice' });

      void TestBed.inject(CustomerReview).open(
        { kind: 'accept_batch', batchId: BATCH_ID },
        { questionTurnId: 'turn_voice', questionReplyId: 'reply_voice' },
      );
      await stable();
      http.expectOne(`/api/cases/${CASE_ID}`).flush(reviewCase());
      await stable();
      http.expectOne({ method: 'POST', url: confirmations }).flush(question);
      await stable();
      serve(http, { confirmation: question });
      await stable();

      expect(root.querySelector('.question')?.textContent).toContain(
        'Bitte antworten Sie per Sprache.',
      );
      expect(button('Änderung übernehmen')).toBeUndefined();
      expect(button('Abbrechen')).toBeDefined();
    });
  });

  describe('sign-in', () => {
    it('asks for the demo access code and connects after signing in', async () => {
      setup(false);
      await fixture.whenStable();

      const input = root.querySelector('input') as HTMLInputElement;
      expect(root.querySelector(`label[for="${input.id}"]`)?.textContent).toContain(
        'Demo-Zugangscode',
      );
      input.value = 'synthetic-access-code';
      input.dispatchEvent(new Event('input'));
      (root.querySelector('form') as HTMLFormElement).requestSubmit();
      await stable();
      http
        .expectOne('/api/sessions')
        .flush({ sessionToken: 'secret', csrfToken: 'csrf_new', role: 'customer' });
      await stable();
      http.expectOne({ method: 'POST', url: '/api/cases' }).flush({ id: CASE_ID });
      await stable();
      serve(http);
      await stable();

      expect(source.connectionState.value).toBe('connected');
      expect(root.querySelector('form')).toBeNull();
      expect(root.querySelectorAll('.batch')).toHaveLength(1);
    });
  });

  describe('demo shortcuts', () => {
    it('loads the Mueller persona into an empty case at the current revision', async () => {
      await render({
        dto: reviewCase({
          draft: { financial: null, insurance: null, goals: [], reviewFlags: [] } as never,
          proposalBatches: [],
          ambiguities: [],
          confirmedVersions: [],
        }),
      });
      expect(text()).toContain('Der Fall ist noch leer');
      button('Familie Müller laden (Pax-Persona, erfunden)')!.click();
      await stable();
      http.expectOne(`/api/cases/${CASE_ID}`).flush(reviewCase({ caseRevision: 9 } as never));
      await stable();
      const load = http.expectOne(`/api/cases/${CASE_ID}/demo-profile`);
      expect(load.request.body).toEqual({ persona: 'mueller', expectedCaseRevision: 9 });
      expect(load.request.headers.get('X-CSRF-Token')).toBe('csrf_1');
      load.flush(reviewCase());
    });

    it('calculates the standard scenarios of a confirmed profile without analyses', async () => {
      const confirmed = reviewCase({ proposalBatches: [], ambiguities: [], draftDirty: false, runs: [] });
      await render({
        dto: confirmed,
        context: reviewContext({ ambiguities: [], pendingAcceptanceBatchIds: [], missingFields: [] } as never),
      });
      button('Szenarien berechnen')!.click();
      await stable();
      http.expectOne(`/api/cases/${CASE_ID}`).flush(confirmed);
      await stable();
      const run = http.expectOne(`/api/cases/${CASE_ID}/standard-analyses`);
      expect(run.request.body).toEqual({ expectedProfileVersion: 1 });
      run.flush({ runs: [] });
    });

    it('shows Paxi\'s voice notice and closes it again without opening a window', async () => {
      await render({}, { voiceAgentUrl: 'http://localhost:3100' });
      button('Mit Paxi sprechen')!.click();
      await stable();
      http
        .expectOne((r) => r.url === '/api/voice/privacy')
        .flush({ version: 'voice-synthetic-v1', text: 'Synthetic voice notice', enabled: false, providers: [] });
      await stable();
      expect(text()).toContain('Synthetic voice notice');
      expect(text()).toContain('Sprachverarbeitung ausgeschaltet');
      button('Abbrechen')!.click();
      await stable();
      expect(text()).not.toContain('Synthetic voice notice');
      expect(button('Mit Paxi sprechen')).toBeDefined();
    });
  });
});

