import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcher } from './core/i18n/language-switcher';

interface TabLink {
  readonly path: string;
  /** Translation key. */
  readonly label: string;
}

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, LanguageSwitcher],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly tabs: readonly TabLink[] = [
    { path: '/graphics', label: 'nav.graphics' },
    { path: '/risks', label: 'nav.risks' },
    { path: '/chat', label: 'nav.chat' },
    { path: '/info', label: 'nav.info' },
  ];
}
