import { Injector, effect, untracked } from '@angular/core';
import type { LiveVoice } from '../voice/live-voice';

/** How long the signed-in case may take to become ready before the microphone button takes over. */
const START_TIMEOUT_MS = 60_000;

/**
 * Starts the call with Paxi once the case is ready, after "I agree" on the consent banner. The
 * banner names the voice transfer and the AI extraction, so agreeing there gives both voice
 * consents; `LiveVoice.start()` still records the extraction consent on the case first.
 *
 * Without a session (the api configuration, where the customer signs in on the review panel
 * after agreeing) it waits for the sign-in as long as it takes. From the sign-in on the case has a
 * minute to become ready; a sign-out pauses that minute. It stops waiting when a call already runs
 * or a human handover blocks the voice. `done` follows when the wait or the start is over. The
 * microphone button stays for every later start.
 */
export function startPaxiWhenReady(live: LiveVoice, injector: Injector, done: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watch = effect(
    () => {
      if (live.active() || live.handoverActive()) return giveUp();
      if (!live.signedIn()) return pause();
      timer ??= setTimeout(giveUp, START_TIMEOUT_MS);
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

  function pause(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  function stop(): void {
    pause();
    watch.destroy();
  }

  function giveUp(): void {
    stop();
    done();
  }
}
