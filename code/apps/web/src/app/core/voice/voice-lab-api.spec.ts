import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { CUSTOMER_SESSION_KEY } from '../advisor/api/customer-api';
import { provideI18nTesting } from '../i18n/i18n-testing';
import { VoiceLabApi } from './voice-lab-api';

it('routes a finalized turn with the owner CSRF cookie contract and surfaces the failure', async () => {
  sessionStorage.setItem(CUSTOMER_SESSION_KEY,JSON.stringify({caseId:'case_1',csrfToken:'private-csrf'}));
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),provideI18nTesting(),
    {provide:APP_ENVIRONMENT,useValue:{apiBaseUrl:'/api'}}]});
  const api=TestBed.inject(VoiceLabApi),http=TestBed.inject(HttpTestingController);
  const work=api.post('voice/sessions/session_1/turns',{speaker:'customer',log:{text:'My annual gross income is 119000 CHF.'}});
  const rejected=expect(work).rejects.toMatchObject({status:409});
  const req=http.expectOne('/api/cases/case_1/voice/sessions/session_1/turns');
  expect(req.request.headers.get('X-CSRF-Token')).toBe('private-csrf');
  req.flush({code:'VOICE_SESSION_NOT_ACTIVE'},{status:409,statusText:'Conflict'});
  await rejected;
  http.verify();sessionStorage.clear();
});
