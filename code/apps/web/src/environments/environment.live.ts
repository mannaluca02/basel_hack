import { AppEnvironment } from './environment.model';

/**
 * `npm run start:live` (code: `npm run dev:live`): end to end without test data. No sign-in, a new
 * empty case per start; after the intro and the consent Paxi starts talking, sets up the person
 * from the conversation and proposes what it hears. Needs the backend with PAX_DEMO_START=1,
 * PAX_SYNTHETIC_VOICE_ENABLED=1 and OPENAI_API_KEY.
 */
export const environment: AppEnvironment = {
  production: false,
  apiBaseUrl: '/api',
  dataSource: 'api',
  demoStart: true,
  liveStart: true,
};
