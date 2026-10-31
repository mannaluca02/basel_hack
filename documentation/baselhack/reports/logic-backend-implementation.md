# Logik-Backend – Implementierungsstand Valentin

Stand: 31.10.2026. Erster lauffähiger Teil des Workshop-Plans; die Gesamtjourney wird vom Team integriert.

## Vorhandener Code

Die [Start- und Integrationsanleitung](../../../code/README.md) beschreibt den lokalen NestJS-Server, gemeinsame TypeScript-/Zod-Verträge und konkrete API-Aufrufe. Der Code liegt unter `code/`, die bestehenden Quellen bleiben unter `documentation/`.

| Bereich | Tatsächlicher Stand |
|---|---|
| LOG-01 | Finanzsnapshot, Geld/Herkunft/Bestätigung/Review, I03/I04 und GraphContext zur Laufzeit validiert; sechs definierte Aufnahmengruppen |
| LOG-02 | Sechs Provideroperationen, exakter Replay, feste Live-Zieladresse, begrenzte Fehler-/Retry-/Parallelitätsregeln, Normalisierung |
| LOG-03 | Budget mit Steuer-/Ausgabendopplungsprüfung, verfügbare/gebundene Mittel, Zuordnungsledger, getrennte Säulen/Personen/Ereignisse |
| LOG-04 | Erster Familien-Cashflow und monatliche endliche Kapitalrechnung; vollständige Pensionierungsphasen noch offen |
| LOG-05 | Illustrativer Eigenheimvergleich mit Reserve, Finanzierungslücke und tatsächlich reservierten verfügbaren Mitteln |
| LOG-06 | Weiterhin offen: State Machine auf gespeicherten Offerten/Anträgen/Policen und passende Reviewrollen |
| LOG-07 | Automatisierte Fach-/Adapter-/HTTP-Prüfungen; Fachklärung mit Pax und Gesamtjourney-Abnahme offen |

## Integrationsgrenzen

Earnie übernimmt Authentifizierung, Fallberechtigung, autorisierten gemeinsamen JSON-Fallstore, Bestätigungen, Persistenz und I10-/SSE-Veröffentlichung. `CalculationModule` liefert Rechnung und Fakten, ohne einen zweiten Fallstore anzulegen. Eine finanzielle Änderung erzeugt einen anderen Eingabehash; eine rein technische Fallrevision tut das nicht.

Luca kann die drei festen Demo-Varianten schon über HTTP abrufen. Dario erhält später Earnies Antwort auf die referenzierten Ergebnisfakten, Lukas die getrennten Progress-/Playbackdaten. Gesundheits-/Kundendaten oder Modellaufrufe werden durch den lokalen Demo-Server nicht eingerichtet.

Die Demo ist an Loopback gebunden und nimmt ausschließlich Fixture-/Varianten-IDs an. Allgemeine Kundenendpunkte sind Aufgabe der geschützten gemeinsamen Anwendung. Die Vorlage enthält ein erfundenes Paar, aktuelle annualisierte Cashflows und ausdrücklich illustrative Szenarien; sie ist keine verifizierte gesetzliche Pensionsprognose.

## Prüfung

Im tatsächlichen Repo ausgeführt: `npm ci --ignore-scripts`, TypeScript-Build und `npm test`: **57 automatisierte Tests bestanden, 0 fehlgeschlagen**. Geprüft wurden Fachinvarianten, I03/I04, GraphContext/Versionsschutz, synthetischer Replay, Providerfehler/Timeout/Parallelität und lokale HTTP-Endpunkte. Die HTTP-Tests haben kurz einen Loopback-Port geöffnet; Providerzugriffe waren dabei synthetisch injiziert.

Ein expliziter Live-Smoke hat ausschließlich die 3a-Metadaten mit leerer Anfrage `{}` abgerufen: Status `valid`, Modus `live`, zwei normalisierte Kennzahlen. Es wurden keine Kunden-/Gesundheitsdaten übertragen. Der vorhandene Token wurde aus der geschützten lokalen Serverumgebung gelesen und nicht kopiert oder ausgegeben.

`npm audit --omit=dev --audit-level=high` meldete am 31.10.2026 keine bekannten Laufzeit-Abhängigkeitslücken. Die vollständige geplante Abnahmematrix, insbesondere Vertrag/Portal und menschliche Prüfung, bleibt offen.

Der bestehende Quellenkatalog lässt sich im aktuellen Checkout nicht vollständig neu bauen: Commit `6bf72c6` hat die 16 Videodateien entfernt, während die bisherigen Medienreferenzen weiterhin darauf verweisen. Die Quellen-/Medieninventare bleiben daher auf ihrem bisherigen Stand. Die Implementierung benötigt ausschließlich die vorhandenen synthetischen API-Beispiele; Videos werden durch diese Arbeit nicht wiederhergestellt.

## Nächste Fach- und Integrationsschritte

1. Mit Earnie den hier implementierten finanziellen Snapshot in das umfassendere gemeinsame Fallmodell aufnehmen; Besitz und Kundenbestätigung serverseitig nachweisen.
2. Request/Result nur an den passenden aktuellen Profil-/Szenariostand speichern und I10 aus dem Fallservice veröffentlichen; veraltete Rückläufe nicht übernehmen.
3. Risiko-Code 0 mit Pax/Logismata klären. Bis dahin bleibt er `requires_review`; unbekannter Bedarf bleibt von einer Null-Lücke getrennt.
4. Zwei-Personen-Prozentbedarf der Pensionierungsoperation fachlich bestätigen; aktuell prüfpflichtig. Budget-/Steuer-/Einkommenskonvertierungsmapping ergänzen.
5. Echte Leistungs-/Erwerbs-/Überbrückungsphasen, Preisbasis und personenbezogene PK-Folgen für LOG-04 ergänzen; keine lineare Fortschreibung von PK-Leistungen.
6. LOG-06 erst mit gespeichertem Empfehlungs-/Review-/Vertragsmodell anbinden.
