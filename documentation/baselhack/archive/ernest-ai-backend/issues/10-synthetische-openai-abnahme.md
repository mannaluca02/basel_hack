# 10: Synthetische Extraktionsqualität mit echtem OpenAI separat abnehmen

Status: ready-for-agent
Type: task
Owner: Earnie
Blocked by: 02 — Prüfstand und getrennte Kundenaktionen im Angular-Client anschließen; 09 — Vollständige Dialog-Turn-Abnahme ohne externe Dienste nachweisen

## What to build

Ein gesondert und ausdrücklich gestarteter Abnahmelauf verwendet den echten synthetischen Responses-Adapter und weist fachlich korrekte Extraktion mit tatsächlichen Modellantworten nach. Dieser Nachweis bleibt vom automatisierten Lauf mit vorgegebenen Modellantworten getrennt.

## Umfang und Zuständigkeit

Earnie ergänzt den kleinsten expliziten Abnahme-Einstieg und dokumentiert dessen tatsächlichen Lauf. Den in 01 erstellten Adapter verwenden; keine zweite Modellpipeline, kein Decisions-Pflichtgate, kein automatischer Anbieter-Fallback. Schlüssel und Modellkonfiguration bleiben serverseitig.

## Voraussetzungen

- 09 hat die Modul-, Fehler- und Payload-Grenze automatisiert belegt; 02 hat die Hinweise des aktivierten Wegs konsistent gemacht. Damit kann der reale Adapter nicht vor der Prüfung seiner Daten- und Hinweisgrenze als abgenommen gelten.
- Verfügbarer serverseitiger API-Zugang; Modell und gültige Responses-Schnittstelle bei Ausführung prüfen. Fehlender Zugang wird als fehlender Laufnachweis festgehalten, nicht als erfolgreicher Test.
- Eigens erfundene Dialoge und vorbereitete synthetische Fälle. Keine echten oder nur pseudonymisierten Kunden-/Voice-Beispiellogs.

## Abnahmekriterien

- [ ] Der Lauf ist ausdrücklich auszulösen und gehört nicht zur normalen automatisierten Suite. Anbieter, synthetischer Inhalt und Zweck sind vor dem externen Aufruf ausgewiesen; es gibt keinen stillen Aufruf beim Testen oder App-Start.
- [ ] Der echte Pflichtsatz liefert genau einen unbestätigten Vorschlag über 11’900’000 Rappen für `person_demo_1` im Versicherungs-Jahresbrutto. Budget-Netto, Entwurf und bestätigtes Profil bleiben vor Annahme unverändert.
- [ ] Echte Modellantworten bestehen offene Korrektur auf 125’000 CHF Jahresbrutto, Partner-/Basisunklarheit und vollständige Klärung mit ausdrücklich 13 Monatslöhnen à 6’000 CHF. Unvollständige Klärung oder KI-Beispiel ohne Nutzerangabe erzeugt keinen erfundenen Jahresbetrag.
- [ ] Geprüft werden Zielperson, Werte, Feldsemantik, notwendige Rückfrage und ausbleibende unzulässige Änderungen; natürlicher Wortlaut muss nicht exakt übereinstimmen. Beantwortete Unklarheiten folgen dem vorhandenen Annahmeworkflow.
- [ ] Für den tatsächlich verwendeten Adapter gilt dieselbe automatisiert geprüfte minimale Payload-Grenze. `noExternalAiTransferAuthorized=true` wird nicht als allgemeine Freigabe umgedeutet; Modell erhält weder Rechte noch Bestätigungsmöglichkeiten.
- [ ] Modellbezeichnung, geprüfter Commit, fachliche Ergebnisse, Fehler und beobachtete Laufzeit werden ohne Schlüssel oder reale Inhalte dokumentiert. Kein zusätzliches numerisches Latenzziel und keine Behauptung erfolgreicher Abnahme ohne tatsächlichen externen Lauf.
- [ ] Es erfolgen keine Live-Rechneraufrufe. Erfolgreiche Extraktion wird nicht als Beleg für echte STT/TTS, Kundenanzeige oder funktionierende zweistufige Voice-Bestätigung ausgewiesen.

## Tests

Das Corpus der automatisierten Modulabnahme für die genannten fachlichen Fälle am echten Adapter verwenden. Fachliche Resultate am zentralen Fallservice beobachten; keine manuell vorgefertigten Toolantworten für diesen Nachweis. Zugangsausfall/Providerfehler als sichtbaren Fehler ausweisen. Die normale Suite muss weiterhin ohne externen Zugriff und ohne Schlüssel laufen.

## Comments
