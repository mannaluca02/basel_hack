import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from './app-environment';

describe('APP_ENVIRONMENT', () => {
  it('provides a same-origin API base URL and a known data source mode', () => {
    const env = TestBed.inject(APP_ENVIRONMENT);

    expect(env.apiBaseUrl.startsWith('/')).toBe(true);
    expect(['mock', 'api']).toContain(env.dataSource);
  });
});
