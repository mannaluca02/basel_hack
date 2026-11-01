import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { provideI18nTesting } from './i18n-testing';
import { AppLanguage } from './language';
import { localeInterceptor } from './locale.interceptor';

describe('localeInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  function setup(apiBaseUrl: string): void {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideHttpClient(withInterceptors([localeInterceptor])),
        provideHttpClientTesting(),
        {
          provide: APP_ENVIRONMENT,
          useValue: { apiBaseUrl, dataSource: 'api' },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => setup('/api/'));

  afterEach(() => backend.verify());

  function languageHeaderOf(url: string, headers?: Record<string, string>): string | null {
    http.get(url, { headers }).subscribe();
    const request = backend.expectOne(url);
    request.flush({});
    return request.request.headers.get('Accept-Language');
  }

  it('sends the active locale to the backend and follows a switch', async () => {
    expect(languageHeaderOf('/api/cases/1')).toBe('de-CH');

    await TestBed.inject(AppLanguage).use('it');

    expect(languageHeaderOf('/api/cases/1')).toBe('it-CH');
    expect(languageHeaderOf('/api')).toBe('it-CH');
  });

  it('leaves other origins and look-alike paths alone', () => {
    expect(languageHeaderOf('https://example.com/api/cases')).toBeNull();
    expect(languageHeaderOf('//example.com/api/cases')).toBeNull();
    expect(languageHeaderOf('/apiary')).toBeNull();
    expect(languageHeaderOf('/api?x=1')).toBe('de-CH');
  });

  it('never leaks to another origin with an empty base URL', () => {
    TestBed.resetTestingModule();
    setup('');

    expect(languageHeaderOf('/cases/1')).toBe('de-CH');
    expect(languageHeaderOf('//example.com/x')).toBeNull();
  });

  it('matches an absolute base URL by origin, not by prefix', () => {
    TestBed.resetTestingModule();
    setup('https://api.pax.ch');

    expect(languageHeaderOf('https://api.pax.ch/cases')).toBe('de-CH');
    expect(languageHeaderOf('https://api.pax.ch.evil.com/cases')).toBeNull();
    expect(languageHeaderOf('/cases')).toBeNull();
  });

  it('keeps an explicit header', () => {
    expect(languageHeaderOf('/api/cases', { 'Accept-Language': 'en-CH' })).toBe('en-CH');
  });
});
