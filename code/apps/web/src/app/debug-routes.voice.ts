import { Routes } from '@angular/router';

/** The Voice Lab around the app's live voice, in the debug configurations only. */
export const debugRoutes: Routes = [
  {
    path: 'voice-lab',
    title: 'lab.title',
    loadComponent: () => import('./features/voice-lab/voice-lab').then((m) => m.VoiceLab),
  },
];
