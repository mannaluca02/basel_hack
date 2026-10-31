# Pax Digital Advisor – web

Angular 22 mobile-first web app (PWA). Standalone components, signals, strict TypeScript, SCSS.

Requires Node `^22.22.3 || ^24.15.0 || >=26.0.0` (Angular 22 engines); the repo `.nvmrc` pins 26.

```bash
npm ci
npm start          # dev server on http://localhost:4200
npm test           # unit tests (Vitest), add -- --watch=false for a single run
npm run build      # production build incl. service worker -> dist/web
```

## Structure

- `src/app/features/workspace/{graphics,risks,chat,info}` – one lazy-loaded route per tab
- `src/app/core/config/app-environment.ts` – `APP_ENVIRONMENT` token; inject it instead of importing `environment`
- `src/environments/` – `apiBaseUrl` and `dataSource` (`mock` | `api`); the development build swaps in `environment.development.ts`
- `public/` – manifest and icons rendered from `assets/pax/logos/online/colour-positive`

Environment files ship in the public bundle. Never put the Logismata token or any other secret in them.

The service worker only registers in production builds (`ng build` + a static server), not under `ng serve`.
