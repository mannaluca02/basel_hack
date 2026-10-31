import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'graphics' },
  {
    path: 'graphics',
    title: 'nav.graphics',
    loadComponent: () =>
      import('./features/workspace/graphics/graphics-tab').then((m) => m.GraphicsTab),
  },
  {
    path: 'risks',
    title: 'nav.risks',
    loadComponent: () => import('./features/workspace/risks/risks-tab').then((m) => m.RisksTab),
  },
  {
    path: 'chat',
    title: 'nav.chat',
    loadComponent: () => import('./features/workspace/chat/chat-tab').then((m) => m.ChatTab),
  },
  {
    path: 'info',
    title: 'nav.info',
    loadComponent: () => import('./features/workspace/info/info-tab').then((m) => m.InfoTab),
  },
  { path: '**', redirectTo: 'graphics' },
];
