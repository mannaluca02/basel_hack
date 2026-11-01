import { AppEnvironment } from './environment.model';

/**
 * `npm run start:debug:lab`: the Voice Lab view against the isolated lab backend
 * (`npm --prefix code run start:voice-lab`, port 3030, temporary synthetic cases).
 */
export const environment: AppEnvironment = {
  apiBaseUrl: '/api',
  dataSource: 'api',
  debugVoice: true,
};
