import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

export const CONSENT_STORAGE_KEY = 'pax.consent';

/**
 * Version of the privacy notice the consent refers to. Raise it when the notice changes in
 * substance, so an earlier consent no longer counts.
 */
export const CONSENT_NOTICE_VERSION = '1';

/**
 * Whether the user has read the privacy notice and agreed (DSG/FADP, project rule 7). Nothing
 * from the advisor backend is processed before that, see `CaseStore`.
 *
 * Kept in sessionStorage: it survives a reload, ends with the browser tab and is never sent
 * anywhere.
 */
@Injectable({ providedIn: 'root' })
export class Consent {
  private readonly storage = sessionStorageOf(inject(DOCUMENT));
  private readonly state = signal(this.readStored() === CONSENT_NOTICE_VERSION);

  readonly granted = this.state.asReadonly();

  grant(): void {
    this.state.set(true);
    try {
      this.storage?.setItem(CONSENT_STORAGE_KEY, CONSENT_NOTICE_VERSION);
    } catch {
      // Not persisted; consent then lasts until the next reload.
    }
  }

  // Storage can throw (Safari private mode, blocked cookies); the user is then asked again.
  private readStored(): string | null {
    try {
      return this.storage?.getItem(CONSENT_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }
}

// Even reading `window.sessionStorage` throws when storage is blocked.
function sessionStorageOf(document: Document): Storage | null {
  try {
    return document.defaultView?.sessionStorage ?? null;
  } catch {
    return null;
  }
}
