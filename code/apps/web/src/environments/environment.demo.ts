import { AppEnvironment } from './environment.model';

/** `npm run start:demo`: the real backend with a ready synthetic case, no sign-in. */
export const environment: AppEnvironment = {
  production: false,
  apiBaseUrl: '/api',
  dataSource: 'api',
  demoStart: true,
};
