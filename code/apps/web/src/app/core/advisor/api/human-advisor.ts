import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { HumanHandoverView } from '@pax/contracts';
import { filter } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { AdvisorDataSource } from '../advisor-data-source';
import { CustomerApi } from './customer-api';

/** Pax's public general contact, as the backend sends it (`PAX_HUMAN_ADVISOR_CONTACT`). */
const PAX_CONTACT = { organization: 'Pax', displayPhone: '+41 61 277 66 66', phone: '+41612776666' } as const;

/**
 * The always reachable way to a human advisor (FE-10, rule 5). A request is stored in the case;
 * the backend stops voice, AI and graphics work and every channel sees the stop signal. It shows
 * Pax's public contact; nothing dials or books by itself. A button only needs `request()`,
 * `resume()` and `requested()`. Without the case service (mock mode) the request stays in the
 * tab and only shows the contact.
 */
@Injectable({ providedIn: 'root' })
export class HumanAdvisor {
  private readonly api = inject(CustomerApi);
  private readonly viewState = signal<HumanHandoverView | null>(null);
  private readonly busyState = signal(false);
  private readonly failedState = signal(false);
  private readonly local = inject(APP_ENVIRONMENT).dataSource !== 'api';
  private readonly localRequested = signal(false);

  readonly view = this.viewState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly failed = this.failedState.asReadonly();
  readonly requested = computed(() =>
    this.local ? this.localRequested() : this.viewState()?.handover.wantsHumanAdvisor === true,
  );
  readonly contact = computed(() => this.viewState()?.contact ?? PAX_CONTACT);

  constructor() {
    // Another channel (voice) may ask for a human too: follow the case.
    inject(AdvisorDataSource)
      .events.pipe(
        filter((event) => event.type === 'context'),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    const caseId = this.api.session()?.caseId;
    if (!caseId) return;
    try {
      this.viewState.set(await this.api.loadHandover(caseId));
    } catch {
      // The next context event loads again.
    }
  }

  request(): Promise<void> {
    return this.command('request');
  }

  resume(): Promise<void> {
    return this.command('resume');
  }

  private async command(action: 'request' | 'resume'): Promise<void> {
    if (this.local) {
      this.localRequested.set(action === 'request');
      return;
    }
    const caseId = this.api.session()?.caseId;
    if (!caseId || this.busyState()) return;
    this.busyState.set(true);
    this.failedState.set(false);
    try {
      this.viewState.set(await this.api.handover(caseId, action));
    } catch {
      this.failedState.set(true);
      await this.load();
    } finally {
      this.busyState.set(false);
    }
  }
}
