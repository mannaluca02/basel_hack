import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'graphics' },
  {
    path: 'graphics',
    title: 'Graphics',
    loadComponent: () =>
      import('./features/workspace/graphics/graphics-tab').then((m) => m.GraphicsTab),
  },
  {
    path: 'risks',
    title: 'Risks',
    loadComponent: () => import('./features/workspace/risks/risks-tab').then((m) => m.RisksTab),
  },
  {
    path: 'chat',
    title: 'Chat',
    loadComponent: () => import('./features/workspace/chat/chat-tab').then((m) => m.ChatTab),
  },
  {
    path: 'info',
    title: 'Info',
    loadComponent: () => import('./features/workspace/info/info-tab').then((m) => m.InfoTab),
  },
  { path: '**', redirectTo: 'graphics' },
];
