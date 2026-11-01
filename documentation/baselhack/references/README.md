# Referenzen, die die Anwendung benutzt

Stand: 01.11.2026. Nur was Code, Build oder Tests lesen; alles übrige Quellenmaterial der Workshop-Phase (Webseitenstände, Videos, Fondslisten, extrahierte Texte, Quellenkatalog) ist in der Git-Historie.

## Produktunterlagen (`products/`)

Die App liefert diese Dokumente im Abschlussweg aus (`DOCUMENTS` in `code/apps/api/src/insurance/products.ts`, mit SHA-256 geprüft; auf dem Worker über `code/apps/worker/scripts/assets.mjs`). Archivstand 30.10.2026, nur Deutsch; für einen echten Abschluss sind die aktuellen Unterlagen nötig.

| Datei | Seiten | Herkunft |
|---|---:|---|
| [products/brochures/child-insurance.pdf](products/brochures/child-insurance.pdf) | 6 | [Quelle 1](https://assets.pax.ch/x/ac3e265c3a/private-vorsorge-produktbroschuere-pax-kinderversicherung.pdf) |
| [products/brochures/disability.pdf](products/brochures/disability.pdf) | 6 | [Quelle 1](https://assets.pax.ch/x/e27a00826e/private-vorsorge-produktbroschuere-pax-erwerbsunfaehigkeitsversicherung.pdf) |
| [products/brochures/term-life.pdf](products/brochures/term-life.pdf) | 6 | [Quelle 1](https://assets.pax.ch/x/aaf56255b9/private-vorsorge-produktbroschuere-pax-todesfallversicherung.pdf) |
| [products/key-information/fondsstar.pdf](products/key-information/fondsstar.pdf) | 3 | [Quelle 1](https://assets.pax.ch/x/9c26c5ee3e/private-vorsorge-information-basisinformationsblatt-fondsstar-terzafondsstar-fondsstarinvest.pdf) |
| [products/key-information/lifestar.pdf](products/key-information/lifestar.pdf) | 3 | [Quelle 1](https://assets.pax.ch/x/0adfa6348a/private-vorsorge-information-basisinformationsblatt-lifestar-terzalifestar-lifestarinvest-terzalifestarinvest.pdf) |
| [products/key-information/pax-3a.pdf](products/key-information/pax-3a.pdf) | 3 | [Quelle 1](https://assets.pax.ch/x/a21ab764b2/private-vorsorge-information-basisinformationsblatt-pax-3a.pdf) |
| [products/key-information/payout-plan.pdf](products/key-information/payout-plan.pdf) | 3 | [Quelle 1](https://assets.pax.ch/x/6449970f9e/private-vorsorge-information-basisinformationsblatt-auszahlungsplan.pdf) |
| [products/technical-terms/child-insurance-firststep.pdf](products/technical-terms/child-insurance-firststep.pdf) | 2 | [Quelle 1](https://assets.pax.ch/x/8db67e7c5f/private-vorsorge-technische-tarifbestimmungen-firststep.pdf) |
| [products/technical-terms/disability.pdf](products/technical-terms/disability.pdf) | 2 | [Quelle 1](https://assets.pax.ch/x/12fee4331c/private-vorsorge-technische-tarifbestimmungen-sirjl-sir.pdf) |
| [products/technical-terms/fondsstar.pdf](products/technical-terms/fondsstar.pdf) | 3 | [Quelle 1](https://assets.pax.ch/x/cf132b49cc/private-vorsorge-technische-tarifbestimmungen-fondsstar.pdf) |
| [products/technical-terms/payout-plan.pdf](products/technical-terms/payout-plan.pdf) | 1 | [Quelle 1](https://assets.pax.ch/x/348092e417/private-vorsorge-technische-tarifbestimmungen-auszahlungsplan.pdf) |
| [products/technical-terms/term-life.pdf](products/technical-terms/term-life.pdf) | 3 | [Quelle 1](https://assets.pax.ch/x/7eb5852589/private-vorsorge-technische-tarifbestimmungen-fk-fkf-fk2-fkf2-fr.pdf) |

## Logismata-Beispiele (`api/`)

`api/examples/*.json` sind echte Antworten der 24 Logismata-Operationen mit erfundenen Daten. Der Replay-Rechner der Tests antwortet damit (`code/apps/api/src/logismata/client.ts`, `code/tests/helpers/life-fixture.mjs`). `api/openapi/schema-index.json` ist der Index der OpenAPI-Schemas für `code/tests/localization-tools.test.mjs`; die vollständige Spezifikation ist [APICalc-swagger.yaml](../../challenge_material/APICalc-swagger.yaml).
