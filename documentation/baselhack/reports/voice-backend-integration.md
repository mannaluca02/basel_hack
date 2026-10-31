# Nachweis: Valentins Voice-Backend-Integration

Datum: 31.10.2026. Branch: `feat/voice-case-integration`, aus `main` bei `2ae587c`.

Implementiert: authentifizierte Nest-Voice-Routen, gemeinsame Zod-/TypeScript-Verträge und neun zusätzliche JSON-Schemas, serverseitige OpenAI-/ElevenLabs-REST-Adapter, separate synthetische Voice-Zustimmung, verschlüsselte finale Transkripte, Quellen-/Versionsprüfung, atomare Vorschläge samt Korrekturen/Unklarheiten und Abbruch bei Schließen/Logout/Löschen/Handover. Alle 37 Intake-Felder haben eine explizite Behandlung; 13 erlauben direkte Vorschläge, die übrigen erfordern Lookup, strukturierte Erfassung, menschliche Prüfung oder werden nicht erhoben. Übersetzungen für Hinweise, Mapping-Folgeaufgaben und Voice-Meldungen sind in DE/FR/IT/EN vorhanden.

Validierung:

| Prüfung | Ergebnis |
|---|---|
| `npm --prefix code test` | 184 Tests erfolgreich, keine Fehler; inklusive Build, browsergeeigneter Client-Typprüfung und 34 JSON-Schema-Abgleichen |
| Neue Voice-Integrationstests | 21 erfolgreich; Provider-Fetch-Verträge, Rollen/CSRF, Geld-/Personenzuordnung, Replay, Korrekturen, Quellen, Unklarheiten, Bestätigungen und Lifecycle |
| `npm --prefix code run demo:voice-integration` | Erfolgreicher synthetischer Gesamtdurchlauf |
| `git diff --check` | Keine Whitespace-Fehler |

Demo: Jahresbrutto CHF 119'000 → `11900000` Cent; Budget-Netto und zusätzliche Sparrate unverändert. Das erste gesonderte „Ja“ nimmt das Vorschlagspaket in den Entwurf auf (Profilversion 1 bleibt). Das zweite bestätigt das Gesamtprofil als Version 2. Die folgende Berechnung verwendet Profilversion 2. Die Beraterübergabe markiert die Sprachsession als unterbrochen und löst den Remote-Stoppversuch aus. Auch ein erst laufender Verbindungsaufbau wird bei Schließen/Logout/Falllöschung abgebrochen; verspäteter Provider-Erfolg wird bereinigt.

Die Tests verwenden Fake-Voice-/Rechenprovider und lokale HTTP-Ports, keine echten Mikrofone, ausgehenden Telefonate oder kostenpflichtigen Voice-Aufrufe. Die realen REST-Adapter sind anhand offizieller Providerdokumentation und simuliertem Fetch geprüft. Ein tatsächlicher Browser-/Provider-Gesprächsdurchlauf bleibt der anschließende gemeinsame Integrationstest.

[Anleitung, Grenzen und Zuständigkeiten für Dario/Erni/Luca/Lukas](../plans/voice-backend-integration.md). [Ausführbare JSON-Beispiele](../../../code/fixtures/voice-integration/). Der Voice-Branch selbst ist noch nicht gemergt; dessen Browser-Client, Angular-Anbindung, Extraktionsmodell und Avatar müssen die dokumentierten Schnittstellen verwenden.
