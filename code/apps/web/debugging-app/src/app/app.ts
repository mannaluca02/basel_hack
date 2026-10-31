import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CaseStore } from '../../../src/app/core/advisor/store/case-store';
import { Consent } from '../../../src/app/core/consent/consent';
import { LanguageSwitcher } from '../../../src/app/core/i18n/language-switcher';
import { ConsentScreen } from '../../../src/app/features/consent/consent-screen';

@Component({
  selector: 'debugging-root',
  imports: [RouterOutlet, LanguageSwitcher, ConsentScreen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header><strong>Pax · Debugging App</strong><span>Voice → Backend</span><app-language-switcher /></header>
    <main>
      @if (consent.granted()) {
        <router-outlet />
      } @else {
        <app-consent-screen (started)="start()" />
      }
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; }
    header { display: flex; align-items: center; flex-wrap: wrap; gap: 1rem; padding: .7rem 1rem; border-bottom: 1px solid var(--border-default); }
    header > span { color: var(--text-muted); }
    app-language-switcher { margin-inline-start: auto; }
  `,
})
export class DebuggingApp {
  protected readonly consent = inject(Consent);
  private readonly store = inject(CaseStore);

  constructor() {
    if (this.consent.granted()) this.store.connect();
  }

  protected start(): void {
    this.consent.grant();
    this.store.connect();
  }
}
