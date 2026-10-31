import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface TabLink {
  readonly path: string;
  readonly label: string;
}

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly tabs: readonly TabLink[] = [
    { path: '/graphics', label: 'Graphics' },
    { path: '/risks', label: 'Risks' },
    { path: '/chat', label: 'Chat' },
    { path: '/info', label: 'Info' },
  ];
}
