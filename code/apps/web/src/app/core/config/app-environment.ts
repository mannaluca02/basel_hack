import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AppEnvironment } from '../../../environments/environment.model';

/** Inject this instead of importing `environment` directly, so tests can override it. */
export const APP_ENVIRONMENT = new InjectionToken<AppEnvironment>('APP_ENVIRONMENT', {
  providedIn: 'root',
  factory: () => environment,
});
