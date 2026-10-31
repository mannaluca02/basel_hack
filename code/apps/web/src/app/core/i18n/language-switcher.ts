import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ErrorHandler,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppLanguage, LANGUAGES, LANGUAGE_NAMES, Language } from './language';

/** Flag per language, served from `public/flags`. English uses the British flag. */
const FLAGS: Readonly<Record<Language, string>> = {
  de: 'flags/de.svg',
  fr: 'flags/fr.svg',
  it: 'flags/it.svg',
  en: 'flags/gb.svg',
};

let nextId = 0;

/**
 * Flag button with a disclosure list of flag and language name. A native select cannot show
 * images. The flags are decorative: the button and every option are named in words.
 * Lives in the app header, shown once Paxi has moved to the corner (FE-28); before that the app
 * uses the stored or browser language.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'close(true)',
    '(focusout)': 'onFocusOut($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="trigger"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? menuId : null"
      (click)="open.set(!open())"
    >
      <img class="flag" [src]="flags[current()]" alt="" />
      <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m6 9 6 6 6-6" />
      </svg>
      <span class="visually-hidden">{{
        'language.current' | transloco: { language: names[current()] }
      }}</span>
    </button>

    @if (open()) {
      <ul class="menu" [id]="menuId" [attr.aria-label]="'language.label' | transloco">
        @for (language of languages; track language) {
          @let active = language === current();
          <li>
            <button
              type="button"
              class="option"
              [attr.lang]="language"
              [attr.aria-current]="active || null"
              (click)="choose(language)"
            >
              <img class="flag" [src]="flags[language]" alt="" />
              <span>{{ names[language] }}</span>
              @if (active) {
                <svg class="check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              }
            </button>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }

    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.375rem 0.375rem 0.375rem 0.5rem;
      border: var(--stroke-border) solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-default);
      background: var(--bg-default);
      font: inherit;
      cursor: pointer;
    }

    // 3:2 for all four; the hairline keeps white flag parts visible on a white background.
    .flag {
      flex: none;
      width: 1.5rem;
      height: 1rem;
      border-radius: 0.125rem;
      object-fit: cover;
      outline: var(--stroke-border) solid var(--border-soft);
      outline-offset: calc(-1 * var(--stroke-border));
    }

    .chevron,
    .check {
      flex: none;
      width: 1rem;
      height: 1rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    [aria-expanded='true'] .chevron {
      transform: rotate(180deg);
    }

    // Above the Dynamic View and Paxi.
    .menu {
      position: absolute;
      top: calc(100% + 0.25rem);
      right: 0;
      z-index: 2;
      min-width: 10rem;
      margin: 0;
      padding: 0.25rem;
      border: var(--stroke-border) solid var(--border-soft);
      border-radius: var(--radius-m);
      background: var(--bg-default);
      list-style: none;
    }

    .option {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      width: 100%;
      min-height: 2.75rem;
      padding: 0 0.75rem;
      border: 0;
      border-radius: var(--radius-sm);
      color: var(--text-default);
      background: none;
      font: inherit;
      text-align: start;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--bg-muted);
        }
      }
    }

    // Weight and check mark, not colour alone.
    .option[aria-current] {
      font-weight: 700;
    }

    .check {
      margin-left: auto;
      color: var(--icon-brand-contrast);
    }
  `,
})
export class LanguageSwitcher {
  private readonly appLanguage = inject(AppLanguage);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly languages = LANGUAGES;
  protected readonly names = LANGUAGE_NAMES;
  protected readonly flags = FLAGS;
  protected readonly current = this.appLanguage.language;
  protected readonly open = signal(false);
  protected readonly menuId = `language-menu-${nextId++}`;

  protected choose(language: Language): void {
    this.close(true);
    if (language === this.current()) return;
    // On failure (e.g. offline before the chunk was cached) the active language stays shown.
    this.appLanguage.use(language).catch((error: unknown) => this.errorHandler.handleError(error));
  }

  protected close(returnFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.trigger().nativeElement.focus();
  }

  /** Tabbing out closes the list. Safari does not focus clicked buttons, hence the null check. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.host.nativeElement.contains(next)) this.close();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
