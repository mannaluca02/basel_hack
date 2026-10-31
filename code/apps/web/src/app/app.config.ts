import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAdvisorDataSource } from './core/advisor/provide-advisor-data-source';
import { provideI18n } from './core/i18n/i18n.providers';
import { localeInterceptor } from './core/i18n/locale.interceptor';
import { KeepAliveRouteReuseStrategy } from './core/layout/keep-alive-route-reuse-strategy';
import { labTraceInterceptor } from './core/voice/lab-trace';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: RouteReuseStrategy, useClass: KeepAliveRouteReuseStrategy },
    provideHttpClient(withFetch(), withInterceptors(
        // The trace records only while the Voice Lab is open, and exists only in debug builds.
        environment.debugVoice ? [localeInterceptor, labTraceInterceptor] : [localeInterceptor],
      ),),
    provideI18n(),
    provideAdvisorDataSource(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
