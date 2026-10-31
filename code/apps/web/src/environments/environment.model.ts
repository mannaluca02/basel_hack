/** Where the advisor data comes from: scripted synthetic replay or the real backend. */
export type DataSourceMode = 'mock' | 'api';

/**
 * Build-time frontend configuration.
 * Everything here ends up in the public bundle: never put tokens or other secrets in it.
 */
export interface AppEnvironment {
  readonly production: boolean;
  /** Base URL of the advisor backend. Relative so the app talks to its own origin. */
  readonly apiBaseUrl: string;
  readonly dataSource: DataSourceMode;
  /**
   * Origin of the separate voice agent (Paxi) the customer can hand the case to; only the `paxi`
   * configuration sets it, the others talk through the live voice in the app. Must be `localhost`
   * so the browser grants the microphone.
   */
  readonly voiceAgentUrl?: string;
  /**
   * Demo start: the backend (started with PAX_DEMO_START=1) hands out a ready, calculated
   * synthetic case, so there is no sign-in and no review stand.
   */
  readonly demoStart?: boolean;
  /** Debug configuration: the Voice Lab view with trace and raw payloads is reachable. */
  readonly debugVoice?: boolean;
}
