import { Routes } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { KEEP_ALIVE } from './core/layout/keep-alive-route-reuse-strategy';
import { debugRoutes } from './debug-routes';

/** Workspace tabs keep their state across tab switches (FE-07). */
const keepAlive = { [KEEP_ALIVE]: true };

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'graphics' },
  {
    path: 'graphics',
    title: 'nav.graphics',
    data: keepAlive,
    // ECharts loads with the first chart, in its own chunk (FE-11).
    providers: [
      provideEchartsCore({ echarts: () => import('./features/workspace/graphics/echarts-setup') }),
    ],
    loadComponent: () =>
      import('./features/workspace/graphics/graphics-tab').then((m) => m.GraphicsTab),
  },
  {
    path: 'risks',
    title: 'nav.risks',
    data: keepAlive,
    loadComponent: () => import('./features/workspace/risks/risks-tab').then((m) => m.RisksTab),
  },
  {
    path: 'chat',
    title: 'nav.chat',
    data: keepAlive,
    loadComponent: () => import('./features/workspace/chat/chat-tab').then((m) => m.ChatTab),
  },
  {
    path: 'info',
    title: 'nav.info',
    data: keepAlive,
    loadComponent: () => import('./features/workspace/info/info-tab').then((m) => m.InfoTab),
  },
  ...debugRoutes,
  { path: '**', redirectTo: 'graphics' },
];
