import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { VoiceLog } from '@pax/contracts';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { provideI18nTesting } from '../../i18n/i18n-testing';
import { AdvisorDataSource } from '../advisor-data-source';
import { FakeDataSource } from '../store/case-testing';
import { CUSTOMER_SESSION_KEY } from './customer-api';
import { CustomerReview } from './customer-review';
import { BATCH_ID, CASE_ID, batchConfirmation, reviewCase, serve, settle } from './review-testing';

/** What Dario's voice client calls through the customer client. The callbacks are simulated. */
describe('CustomerReview voice mediation', () => {
  const confirmations = `/api/cases/${CASE_ID}/customer-confirmations`;
  const voiceIds = { questionTurnId: 'turn_voice', questionReplyId: 'reply_voice' };
  const target = { kind: 'accept_batch', batchId: BATCH_ID } as const;
  let http: HttpTestingController;
  let review: CustomerReview;
  const voiceQuestion = batchConfirmation({ channel: 'voice' });
  const shownQuestion = { ...voiceQuestion, status: 'awaiting_answer' } as typeof voiceQuestion;
  const shown = { profile: false, notice: false };

  function voiceLog(overrides: Partial<VoiceLog> = {}): VoiceLog {
    return {
      schemaVersion: '1.0',
      messageId: 'answer_message',
      caseId: CASE_ID,
      correlationId: voiceQuestion.questionId,
      turnId: 'answer_turn',
      source: 'voice',
      locale: 'de',
      text: 'Ja.',
      transcriptStatus: 'final',
      dataClassification: 'synthetic',
      ...overrides,
    } as VoiceLog;
  }

  async function loaded() {
    await settle();
    serve(http);
    await settle();
  }

  async function openVoice() {
    void review.open(target, voiceIds);
    await settle();
    http.expectOne(`/api/cases/${CASE_ID}`).flush(reviewCase());
    await settle();
    const create = http.expectOne({ method: 'POST', url: confirmations });
    create.flush(voiceQuestion);
    await settle();
    serve(http, { confirmation: voiceQuestion });
    await settle();
    return create.request.body;
  }

  async function presentVoice() {
    void review.reviewDisplayed(shown);
    void review.playbackEnded('playback_1');
    await settle();
    http.expectOne(`${confirmations}/${voiceQuestion.id}/presented`).flush(shownQuestion);
    await settle();
    serve(http, { confirmation: shownQuestion });
    await settle();
  }

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      CUSTOMER_SESSION_KEY,
      JSON.stringify({ csrfToken: 'csrf_1', caseId: CASE_ID }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: AdvisorDataSource, useValue: new FakeDataSource() },
        {
          provide: APP_ENVIRONMENT,
          useValue: { production: false, apiBaseUrl: '/api', dataSource: 'api' },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    review = TestBed.inject(CustomerReview);
  });

  it('creates a voice question with the IDs of the voice turn', async () => {
    await loaded();

    expect(await openVoice()).toMatchObject({ channel: 'voice', target, ...voiceIds });
    expect(review.confirmation()?.channel).toBe('voice');
  });

  it('falls back to the bound screen question for a change voice cannot render', async () => {
    await loaded();
    void review.open(target, voiceIds);
    await settle();
    http.expectOne(`/api/cases/${CASE_ID}`).flush(reviewCase());
    await settle();

    http
      .expectOne({ method: 'POST', url: confirmations })
      .flush(
        { code: 'VOICE_CONFIRMATION_REQUIRES_SCREEN', locale: 'de', message: 'Bildschirm' },
        { status: 422, statusText: 'Unprocessable' },
      );
    await settle();
    const retry = http.expectOne({ method: 'POST', url: confirmations });
    expect(retry.request.body).toMatchObject({ channel: 'screen', target, ...voiceIds });
    retry.flush(batchConfirmation());
    await settle();
    serve(http, { confirmation: batchConfirmation() });
    await settle();

    expect(review.confirmation()?.channel).toBe('screen');
    expect(review.error()).toBeNull();
  });

  it('reports a voice question only after display and the real end of playback', async () => {
    await loaded();
    await openVoice();

    void review.reviewDisplayed(shown);
    await settle();
    http.expectNone(`${confirmations}/${voiceQuestion.id}/presented`);

    void review.playbackEnded('playback_1');
    await settle();
    const presented = http.expectOne(`${confirmations}/${voiceQuestion.id}/presented`);

    expect(presented.request.body).toMatchObject({
      reviewDisplayed: true,
      playback: { playbackId: 'playback_1', event: 'ended' },
    });
  });

  it('does not report a played voice question that is not on screen', async () => {
    await loaded();
    await openVoice();

    void review.playbackEnded('playback_1');
    await settle();

    http.expectNone(`${confirmations}/${voiceQuestion.id}/presented`);
  });

  it('passes the bound final answer on unchanged', async () => {
    await loaded();
    await openVoice();
    await presentVoice();
    const log = voiceLog();

    void review.answerVoice(log);
    await settle();

    const answer = http.expectOne(`${confirmations}/${voiceQuestion.id}/answer`);
    expect(answer.request.body).toEqual({
      expectedCaseRevision: voiceQuestion.basisCaseRevision,
      questionId: voiceQuestion.questionId,
      questionHash: voiceQuestion.questionHash,
      questionTurnId: voiceQuestion.questionTurnId,
      questionReplyId: voiceQuestion.questionReplyId,
      channel: 'voice',
      voiceLog: log,
    });
  });

  it('does not attach an answer that belongs to another question', async () => {
    await loaded();
    await openVoice();
    await presentVoice();

    void review.answerVoice(voiceLog({ correlationId: 'an_older_question' }));
    await settle();

    http.expectNone(`${confirmations}/${voiceQuestion.id}/answer`);
  });

  it('tells the voice client when a question could not be withdrawn', async () => {
    await loaded();
    await openVoice();
    await presentVoice();

    const withdrawn = review.cancel('new_question');
    await settle();
    http.expectOne(`${confirmations}/${voiceQuestion.id}/cancel`).error(new ProgressEvent('error'));
    await settle();
    serve(http, { confirmation: shownQuestion });

    expect(await withdrawn).toBe(false);
    expect(review.confirmation()?.id).toBe(voiceQuestion.id);
  });

  it('withdraws the open question before a new one, so a late yes finds nothing to answer', async () => {
    await loaded();
    await openVoice();
    await presentVoice();

    const withdrawn = review.cancel('new_question');
    await settle();
    const cancel = http.expectOne(`${confirmations}/${voiceQuestion.id}/cancel`);
    expect(cancel.request.body).toEqual({
      expectedCaseRevision: voiceQuestion.basisCaseRevision,
      reason: 'new_question',
    });
    cancel.flush({ ...voiceQuestion, status: 'cancelled' });
    await settle();
    serve(http);
    expect(await withdrawn).toBe(true);

    void review.answerVoice(voiceLog());
    await settle();

    http.expectNone(`${confirmations}/${voiceQuestion.id}/answer`);
  });
});
