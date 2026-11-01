import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { apiErrorInterceptor, errorCode } from './diagnostics';

it('logs API failures once without query strings, bodies or credentials', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([apiErrorInterceptor])), provideHttpClientTesting(),
    { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api' } }] });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    TestBed.inject(HttpClient).post('/api/cases/12345678-1234-1234-1234-123456789abc/voice?token=secret', { transcript: 'PRIVATE' }).subscribe({ error: () => {} });
    TestBed.inject(HttpTestingController).expectOne(request => request.method === 'POST').flush({ code: 'CSRF_INVALID', name: 'PRIVATE' }, { status: 403, statusText: 'Forbidden' });
    expect(warn).toHaveBeenCalledExactlyOnceWith('[paxi]', { event: 'api_error', method: 'POST', path: '/api/cases/12345678/voice', status: 403, code: 'CSRF_INVALID' });
    expect(errorCode(new HttpErrorResponse({ status: 409 }))).toBe('HTTP_409');
    TestBed.inject(HttpClient).get('https://other.example/api/private').subscribe({ error: () => {} });
    TestBed.inject(HttpTestingController).expectOne('https://other.example/api/private').flush({}, { status: 500, statusText: 'Error' });
    expect(warn).toHaveBeenCalledTimes(1);
  } finally { warn.mockRestore(); }
});
