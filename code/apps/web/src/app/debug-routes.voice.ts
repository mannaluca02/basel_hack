import { Routes } from '@angular/router';

/** Diagnostic views, in the debug configurations only: the Voice Lab and the product insights. */
export const debugRoutes: Routes = [
  {
    path: 'voice-lab',
    title: 'lab.title',
    loadComponent: () => import('./features/voice-lab/voice-lab').then((m) => m.VoiceLab),
  },
  {
    // Product management insights (funnel, possible drop-offs, NPS); demo start only.
    path: 'insights',
    title: 'insights.title',
    loadComponent: () => import('./features/journey/insights-view').then((m) => m.InsightsView),
  },
];
