/**
 * Build-time frontend configuration.
 * Everything here ends up in the public bundle: never put tokens or other secrets in it.
 */
export interface AppEnvironment {
  /** Base URL of the advisor backend. Relative so the app talks to its own origin. */
  readonly apiBaseUrl: string;
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
  /**
   * Live configuration: the demo start without test data. Every start is a new, empty case; the
   * conversation sets up the person and fills it (no Mueller persona, no ready calculations).
   */
  readonly liveStart?: boolean;
}
