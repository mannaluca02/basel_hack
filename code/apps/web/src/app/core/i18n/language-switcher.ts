import { ChangeDetectionStrategy, Component, ErrorHandler, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppLanguage, LANGUAGES, LANGUAGE_NAMES, isLanguage } from './language';

/**
 * Compact native select: smallest footprint at 360 px and the platform picker on mobile.
 * Lives in the app shell, so it is reachable from every screen including consent.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      class="switcher"
      [attr.aria-label]="'language.label' | transloco"
      (change)="select($event)"
    >
      @for (language of languages; track language) {
        <option [value]="language" [attr.lang]="language" [selected]="language === current()">
          {{ names[language] }}
        </option>
      }
    </select>
  `,
  styles: `
    .switcher {
      max-width: 100%;
      padding: 0.375rem 0.5rem;
      border: var(--stroke-border) solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-default);
      background: var(--bg-default);
      font: inherit;
    }
  `,
})
export class LanguageSwitcher {
  private readonly appLanguage = inject(AppLanguage);
  private readonly errorHandler = inject(ErrorHandler);

  protected readonly languages = LANGUAGES;
  protected readonly names = LANGUAGE_NAMES;
  protected readonly current = this.appLanguage.language;

  protected select(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!isLanguage(select.value)) return;
    this.appLanguage.use(select.value).catch((error: unknown) => {
      // Loading failed (e.g. offline before the chunk was cached): show the language still active.
      select.value = this.appLanguage.language();
      this.errorHandler.handleError(error);
    });
  }
}
