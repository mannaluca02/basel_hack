import { AppEnvironment } from './environment.model';

/**
 * `npm run start:paxi`: the demo start with Dario's voice agent (Paxi) in its own window instead
 * of the live voice in the app. The backend serves Paxi with PAX_VOICE_AGENT=1 (`dev:paxi`).
 */
export const environment: AppEnvironment = {
  apiBaseUrl: '/api',
  demoStart: true,
  voiceAgentUrl: 'http://localhost:3100',
};
