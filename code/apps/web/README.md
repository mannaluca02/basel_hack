# Pax Digital Advisor – web

Angular 22 mobile-first web app (PWA). Standalone components, signals, strict TypeScript, SCSS.

Requires Node `^22.22.3 || ^24.15.0 || >=26.0.0` (Angular 22 engines); the repo `.nvmrc` pins 26.

```bash
npm ci
npm start          # dev server on http://localhost:4200
npm test           # unit tests (Vitest), add -- --watch=false for a single run
npm run build      # production build incl. service worker -> dist/web
npm run check:tokens  # no colour literals outside tokens.css, WCAG AA text contrast in both themes
npm run check:i18n    # missing/empty/extra keys per language, unknown keys used in src/app
```

## Structure

- `src/app/features/workspace/{graphics,risks,chat,info}` – one lazy-loaded route per tab
- `src/styles/tokens.css` – Pax colours, radius and stroke; the theme follows the OS (`prefers-color-scheme`), there is no manual toggle. Components use only the semantic tokens (`--bg-*`, `--text-*`, `--icon-*`, `--border-*`, `--chart-1..8`)
- `src/app/core/theme/color-scheme.ts` – `ColorScheme.scheme` signal and `token()` for canvas charts that cannot read `var()`
- `src/i18n/{de,fr,it,en}.json` – UI texts; German is the source language, add every key there first. Missing keys fall back to German at runtime
- `src/app/core/i18n/` – runtime i18n with [Transloco](https://jsverse.gitbook.io/transloco/) (switches without reload; `@angular/localize` would need one build per locale):
  - templates: `{{ 'nav.risks' | transloco }}`; code/charts: `translateSignal('nav.risks')` or `TranslocoService.selectTranslate()`. Write keys out in full so `check:i18n` sees them
  - `AppLanguage` – `language()` / `locale()` signals and `use(lang)`. Initial language from `localStorage['pax.language']`, then `navigator.languages`, then German
  - `LocaleFormat` and the `chf`, `localeNumber`, `localePercent`, `localeDate` pipes – `Intl` formatting for `de-CH`, `fr-CH`, `it-CH`, `en-CH`; re-format on a language switch (also inside `computed`, e.g. chart axes)
  - `localeInterceptor` – sends `Accept-Language: <locale>` to `apiBaseUrl` so backend texts come back in the UI language
  - route `title`s are translation keys; specs use `provideI18nTesting()`
- `src/app/core/config/app-environment.ts` – `APP_ENVIRONMENT` token; inject it instead of importing `environment`
- `src/environments/` – `apiBaseUrl` and `dataSource` (`mock` | `api`); the development build swaps in `environment.development.ts`
- `src/app/core/advisor/` – the only seam to the advisor backend:
  - `contracts.ts` mirrors the planned contracts I04, I05, I08, I09, I10; `ui-models.ts` holds the UI types without a contract yet (`RiskItem`, `TranscriptEntry`, `InfoItem`, `ChartResult`, agent state), to be aligned in FE-06
  - inject `AdvisorDataSource`: `events` (live upserts), `snapshot()`, `connection`, `connect()` / `disconnect()`. `dataSource: 'mock'` binds `MockDataSource`, which replays a ~3 min synthetic call (`mock/mock-call-script.ts`, DE/EN texts, FR/IT fall back to DE). All amounts are in Rappen and come from the source; the UI never calculates them
- `public/` – manifest and icons rendered from `assets/pax/logos/online/colour-positive`

Environment files ship in the public bundle. Never put the Logismata token or any other secret in them.

The service worker only registers in production builds (`ng build` + a static server), not under `ng serve`.
