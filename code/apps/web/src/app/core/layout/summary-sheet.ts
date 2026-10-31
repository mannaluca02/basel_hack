import { Injectable, signal } from '@angular/core';

/**
 * Open state of the summary sheet. The avatar in the agent dock opens it (FE-09); the sheet
 * itself (FE-19) renders while `isOpen` is true and calls `close()`, which returns focus to the
 * control that opened it.
 */
@Injectable({ providedIn: 'root' })
export class SummarySheet {
  private readonly openState = signal(false);
  private opener: HTMLElement | null = null;

  readonly isOpen = this.openState.asReadonly();

  open(opener?: HTMLElement): void {
    this.opener = opener ?? null;
    this.openState.set(true);
  }

  close(): void {
    if (!this.openState()) return;
    this.openState.set(false);
    this.opener?.focus();
    this.opener = null;
  }
}
