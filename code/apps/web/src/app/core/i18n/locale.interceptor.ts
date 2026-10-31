import { HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT, inject } from '@angular/core';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { AppLanguage } from './language';

/**
 * Sends the active locale (`Accept-Language: fr-CH`) with every request to our own backend, so
 * agent replies, risk and info texts come back in the UI language. Other origins are left alone.
 * Message bodies that carry their own `locale` field (see interface-contracts.md) take it from
 * `AppLanguage.locale()` as well.
 */
export const localeInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.headers.has('Accept-Language')) return next(request);
  const base = inject(DOCUMENT).baseURI;
  const api = new URL(inject(APP_ENVIRONMENT).apiBaseUrl || '/', base);
  const target = new URL(request.url, base);
  // Resolved URLs, not string prefixes: `//other.host/api` or `https://api.pax.ch.evil` never match.
  const apiPath = api.pathname.replace(/\/+$/, '');
  const isApi =
    target.origin === api.origin &&
    (target.pathname === apiPath || target.pathname.startsWith(`${apiPath}/`));
  if (!isApi) return next(request);
  return next(request.clone({ setHeaders: { 'Accept-Language': inject(AppLanguage).locale() } }));
};
