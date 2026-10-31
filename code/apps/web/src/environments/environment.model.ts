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
   * Origin of the separate voice agent (Paxi) the customer can hand the case to; absent when the
   * build has no voice agent. Must be `localhost` so the browser grants the microphone.
   */
  readonly voiceAgentUrl?: string;
}
