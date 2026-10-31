import { Injector, effect, untracked } from '@angular/core';
import type { LiveVoice } from '../voice/live-voice';

/** How long "I agree" waits for the case before it leaves the start to the microphone button. */
const START_TIMEOUT_MS = 60_000;

/**
 * Starts the call with Paxi once the case is ready, after "I agree" on the consent banner. The
 * banner names the voice transfer and the AI extraction, so agreeing there gives both voice
 * consents; `LiveVoice.start()` still records the extraction consent on the case first.
 *
 * Stops waiting after a minute, when a call already runs, or when a human handover blocks the
 * voice. `done` follows when the wait or the start is over. The microphone button stays for every
 * later start.
 */
export function startPaxiWhenReady(live: LiveVoice, injector: Injector, done: () => void): void {
  const watch = effect(
    () => {
      if (live.active() || live.handoverActive()) return giveUp();
      if (!live.available() || !live.validPerson() || live.busy()) return;
      untracked(() => {
        stop();
        live.consent.set(true);
        live.extractionConsent.set(true);
        // Done once the call runs or failed, not before: the shell shows its hint in between.
        live.start().catch(() => undefined).finally(done);
      });
    },
    { injector },
  );
  const timer = setTimeout(giveUp, START_TIMEOUT_MS);

  function stop(): void {
    clearTimeout(timer);
    watch.destroy();
  }

  function giveUp(): void {
    stop();
    done();
  }
}
