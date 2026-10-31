# Live-Voice in der App und Voice Lab (Debug-Konfiguration)

Earnies Live-Voice läuft direkt in der normalen Web-App: Mikrofon-Knopf in der Tab-Leiste über dem
Avatar, beide Zustimmungen (Sprachtransfer, KI-Extraktion), dann GPT-Live über das Fall-Backend.
Was Paxi hört, kommt als Vorschlagspaket; erst die Übernahme ändert den Entwurf. Der Avatar-Ring zeigt
die Aktivität, der Chat-Tab das Transkript der Voice-Sessions.

Das frühere separate Debug-Projekt (`code/apps/web/debugging-app/`) gibt es nicht mehr. Das Voice Lab
ist jetzt eine **Build-Konfiguration** derselben App (`debug`, `debug-lab`) mit einem zusätzlichen
Tab **Voice Lab** (`/voice-lab`). Produktions-, API- und Demo-Builds enthalten weder die Route noch den
Lab-Code. **Darios Original unter `code/voice-agent/` bleibt unverändert.**

## Starten

Voraussetzung: Dependencies in `code/` und `code/apps/web/` installiert. Schlüssel und Flags kommen aus
der Root-`.env` (`OPENAI_API_KEY`, `PAX_SYNTHETIC_VOICE_ENABLED=1`); sie werden nicht ausgegeben.

```sh
# Demo-Fall mit Live-Voice in der normalen Oberfläche (Backend 3000, App 4200)
npm --prefix code run dev:demo

# Dasselbe in der Debug-Konfiguration: zusätzlich der Tab "Voice Lab" mit Payload-Trace
npm --prefix code run dev:debug
```

Ohne Demo-Start, gegen das isolierte Lab-Backend (Port 3030, Replay-Rechner, temporärer
verschlüsselter Speicher, öffentlicher Demo-Code `voice-lab-demo-customer-only-2026`):

```sh
npm --prefix code run start:voice-lab              # Backend 3030
npm --prefix code/apps/web run start:debug:lab     # App 4300, /api → 3030
```

Der Mikrofon-Knopf erscheint nur, wenn das Backend GPT-Live **und** die Modell-Extraktion anbietet.
`code/apps/api/src/main.ts` verdrahtet `model-v1` (OpenAI Responses), sobald
`PAX_SYNTHETIC_VOICE_ENABLED=1` oder `PAX_SYNTHETIC_EXTRACTION_ENABLED=1` gesetzt und ein
`OPENAI_API_KEY` vorhanden ist. Ohne Extraktion blockiert der Start, statt still auf `rules-v1`
zurückzufallen.

## Konfigurationen

| Befehl | Konfiguration | Daten | Voice Lab |
|---|---|---|---|
| `npm start` | development | Mock | nein |
| `npm run start:api` | api | Backend 3000, Anmeldung + Review | nein |
| `npm run start:demo` | demo | Backend 3000, Demo-Start | nein |
| `npm run start:debug` | debug | Backend 3000, Demo-Start | ja |
| `npm run start:debug:lab` | debug-lab | Lab-Backend 3030, Anmeldung | ja |
| `npm run start:paxi` | paxi | Backend 3000 mit Paxi (3100), Demo-Start | nein |

Live-Voice gibt es in allen Konfigurationen mit Backend ausser `paxi`: Dort spricht Darios Paxi in
einem eigenen Fenster (Gesprächsleiste oben), gestartet mit `npm --prefix code run dev:paxi`, das den
Paxi-Server im Backend-Prozess mitstartet (`PAX_VOICE_AGENT=1`). Die Übernahme-Karte der Demo gilt
für beide Wege. Im Mock-Modus steuert die Gesprächsleiste den Skript-Anruf. Die Debug-Konfigurationen ersetzen
`environment.ts` (`debugVoice: true`) und `src/app/debug-routes.ts` durch `debug-routes.voice.ts`
und kompilieren mit `tsconfig.debug.json`; nur dort ist der Trace-Interceptor aktiv.

## Wo Änderungen hingehören

| Anpassung | Datei unter `code/apps/web/src/app/` |
|---|---|
| Gesprächskern: Zustimmungen, Session, Turns, Extraktion, Steuerkontext | `core/voice/live-voice.ts` |
| Mikrofon, WebRTC und GPT-Live-Ereignisse | `core/voice/paxi-case-voice.ts` |
| Acht Gesprächsfelder und Steuerlogik | `core/voice/intake-plan.ts`, `core/voice/intake-text.ts` |
| Stopp bei menschlicher Übergabe | `core/voice/handover-control.ts` |
| Mikrofon-Knopf und Zustimmungen in der App | `features/live-voice/live-voice-control.ts` |
| Avatar-Ring | `core/voice/voice-activity.ts`, `app.ts` |
| Chat-Tab-Transkript der Voice-Sessions | `core/advisor/api/customer-api.ts` (`loadVoiceTurns`) |
| Voice-Lab-Oberfläche | `features/voice-lab/voice-lab.{ts,html,scss}` |
| Debug-API-Aufrufe und Payload-Trace | `core/voice/voice-lab-api.ts`, `core/voice/lab-trace.ts` |
| Lab-Backend starten | `code/scripts/start-voice-lab.mjs` |
| API-Ziel des Lab-Backends | `code/apps/web/proxy.lab.conf.json` |

Die serverseitigen Übergabepunkte bleiben beim gemeinsamen Backend:
`code/apps/api/src/voice/lab.ts` (Orchestrierung), `exact-income.ts` (exakte Einkommensangabe),
`service.ts` (Voice-Session/Prompt) und die authentifizierten Fallrouten.

## Testen

```sh
npm --prefix code/apps/web test -- --watch=false   # inkl. Voice-Lab- und Live-Voice-Specs
npm --prefix code/apps/web run build
npm --prefix code/apps/web run ng -- build web --configuration debug
npm --prefix code/apps/web run check:tokens
npm --prefix code/apps/web run check:i18n
npm --prefix code test
```

In der App: Demo starten → Mikrofon-Knopf → beide Häkchen → **Gespräch starten** → Mikrofon erlauben.
Im Demo-Start gibt es kein Review: Neben der Tab-Leiste erscheint dann **Übernehmen und neu berechnen**
(`POST demo-accept`), das die Vorschläge übernimmt, das Profil bestätigt und die Szenarien neu rechnet.
Im Voice Lab (Debug): sprechende Person prüfen → Gesprächs-Skills, Zeitbudget und optional ein Thema
einstellen → beide Zustimmungen → **Live-Gespräch starten**. Das Gespräch läuft beim Verlassen des
Lab-Tabs weiter und lässt sich über den Knopf in der Tab-Leiste beenden.

Session- und Transkriptdaten liegen verschlüsselt im Fallspeicher, beim Lab-Backend in einem temporären
`pax-voice-lab-*`-Verzeichnis, das beim Beenden entfernt wird. Der Browser-Trace ist speicherbegrenzt
und nur im Arbeitsspeicher. Nur erfundene Angaben verwenden.

## Ganze Konversation

Rechts zeigt **„Was aus dem Gespräch angekommen ist“** den aktuellen Backend-Stand als Fliesstext.
Quelle sind die kanonischen Feldvorschläge bzw. übernommenen Angaben, nicht die Demo-Beträge im
Ausgangsentwurf. Korrekturen aktualisieren den Text auch dann, wenn die Anzahl erfasster Felder gleich
bleibt. Dazu erscheinen offene Präzisierungen, der Auswertungsstatus und die zuletzt vom Backend
ausgewertete Kundenaussage. Die acht Felder (Jahresbrutto, Beschäftigungsgrad, Zivilstand, Pensionskasse,
Säule 3a, Wohnkosten, Wunschpensionierung, Risikobereitschaft), Revisionen und Rohdaten stehen unter
**„Technische Details und Feldübersicht“**; der Fortschritt `n/8` bleibt direkt sichtbar.
Es gibt immer nur ein kumulatives offenes Paket, das jeder neue Feldvorschlag ersetzt.
„Ich verdiene 100.000 Franken“ nennt weder Basis noch Periode: Der Wert
erscheint als **unklar**, Paxi fragt nach. Nach zwei Kundenantworten ohne exakte Angabe wird ein Feld
zurückgestellt. Ein Extraktionsfehler beendet das Gespräch nicht und zählt niemals als unbeantwortete
Frage; ebenso wenig Smalltalk. Die vorbelegten Entwurfsbeträge werden im Gesprächspanel nicht angezeigt.

Der Live-Agent bekommt den aktuellen Stand als Gesprächskontext. Die nächste offene Frage ist eine
Themenempfehlung: Paxi soll natürlich auf Anliegen, Fragen und Korrekturen eingehen und höchstens eine
Frage gleichzeitig stellen. Die GPT-Live-Logs werden vor der Extraktion mit Sprecherrollen ans Backend
übermittelt; bei Sprecherwechsel wird das vorherige Fragment sofort als `client-settled` abgeschlossen,
sonst nach 1,5 Sekunden Ruhe. So bleiben schnelle Fragen und Antworten getrennt. Das ist weiterhin kein
Nachweis von Provider-Finalität oder abgeschlossener Audiowiedergabe.

Live nutzt `model-v1` (OpenAI Responses) nur mit eigener KI-Zustimmung (`extraction/consent`, zweites
Häkchen) und nur, wenn `start:voice-lab` mit `PAX_SYNTHETIC_VOICE_ENABLED=1` und `OPENAI_API_KEY`
läuft (beim normalen Backend genügt dasselbe Flag). Der Live-Start blockiert auch dann, wenn Extraktion deaktiviert ist oder die Einstellungen fehlen:
Eine funktionierende Sprachverbindung allein darf nicht unbemerkt auf `rules-v1` zurückfallen.
Annahme und Profilbestätigung laufen über das Review (in der Demo bereits bestätigt).

## Voice-Agent-Skills und Starteinstellungen

`code/apps/api/src/voice/prompt.ts` liest `code/voice-agent/persona.md` und verwendet Darios
`skills.mjs` direkt. Nur Dateien mit `assigned: true` sind auswählbar; aktuell **Friendly conversation**
und **Proposing plans**. Es gibt keine zweite Kopie dieser Skills. Die API liefert deren Metadaten über
`GET /api/voice/settings`; die gewählten Skill-IDs, das Zeitbudget und das bevorzugte Thema gehen beim
Start als `conversationSettings` in die Voice-Session und den tatsächlichen Provider-Prompt ein.
Nicht zugewiesene Skills und nicht unterstützte Themen werden serverseitig zurückgewiesen.
Die Backend-Grenzen zu erfundenen Daten, überprüften Berechnungen, Bestätigungen und Kontaktzusagen
gelten weiterhin und stehen explizit am Ende des Prompts. Änderungen an den Markdown-Skills werden
bei der nächsten Session gelesen. Die Sprache folgt der Sprachwahl der App; ein Wechsel beendet das Gespräch und fragt die Zustimmungen neu ab.

**Neustart nötig:** Der Modellpfad wird beim Start des Backends verdrahtet (`code/apps/api/src/main.ts`
bzw. `code/scripts/start-voice-lab.mjs`). Ein bereits laufendes Backend kennt ihn nicht: stoppen und
neu starten, der Schlüssel kommt aus der Root-`.env`.
