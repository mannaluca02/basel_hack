import { AppEnvironment } from './environment.model';

/**
 * `npm run start:debug`: the demo start plus the Voice Lab view (live voice trace, intake fields,
 * raw payloads) against the normal backend. Same app, same case service, only more to see.
 */
export const environment: AppEnvironment = {
  apiBaseUrl: '/api',
  dataSource: 'api',
  demoStart: true,
  debugVoice: true,
};
