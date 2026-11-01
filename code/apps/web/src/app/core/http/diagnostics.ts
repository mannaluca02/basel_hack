import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT, inject } from '@angular/core';
import { tap } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';

export const diagnosticText = (value: string): string => value.replace(/Bearer\s+\S+|(?:sk-|ek_)[A-Za-z0-9_-]+|(?:token|secret|password|authorization|cookie|csrf)[\w-]*["']?\s*[:=]\s*["']?[^\s,;"']+|[A-Za-z0-9_-]{32,}/gi, '[REDACTED]').slice(0, 300);
export const errorCode = (error: unknown): string | null => error instanceof HttpErrorResponse
  ? (typeof error.error?.code === 'string' ? diagnosticText(error.error.code) : `HTTP_${error.status}`) : null;
export const httpFailure = (error: unknown) => error instanceof HttpErrorResponse
  ? { status: error.status, code: errorCode(error) } : {};
export const diagnosticPath = (path: string): string => path.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, id => id.slice(0, 8));

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const base = inject(DOCUMENT).baseURI;
  const api = new URL(inject(APP_ENVIRONMENT).apiBaseUrl || '/api', base);
  const target = new URL(request.url, base);
  const path = api.pathname.replace(/\/+$/, '');
  const own = target.origin === api.origin && (target.pathname === path || target.pathname.startsWith(`${path}/`));
  return next(request).pipe(tap({ error: (error: unknown) => {
    if (own && error instanceof HttpErrorResponse && error.status >= 400)
      console.warn('[paxi]', { event: 'api_error', method: request.method, path: diagnosticPath(target.pathname), ...httpFailure(error) });
  } }));
};
