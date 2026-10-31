import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../src/app/core/config/app-environment';
import { provideAdvisorDataSource } from '../../../src/app/core/advisor/provide-advisor-data-source';
import { provideI18n } from '../../../src/app/core/i18n/i18n.providers';
import { localeInterceptor } from '../../../src/app/core/i18n/locale.interceptor';
import { labTraceInterceptor } from './lab-trace';
import { VoiceLab } from './voice-lab';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: APP_ENVIRONMENT, useValue: { production: false, apiBaseUrl: '/api', dataSource: 'api' } },
    provideRouter([
      { path: '', title: 'lab.title', component: VoiceLab },
      { path: 'voice-lab', pathMatch: 'full', redirectTo: '' },
      { path: '**', redirectTo: '' },
    ]),
    provideHttpClient(withFetch(), withInterceptors([localeInterceptor, labTraceInterceptor])),
    provideI18n(),
    provideAdvisorDataSource(),
  ],
};
