# Debugging App — Voice → Backend

Eigenes Angular-Projekt für das Zusammenspiel von Live-Voice, Avatar, Transkript,
Extraktion, API-Payloads und gemeinsamem Fallzustand. Einstieg: **http://localhost:4300/**.
Der bisherige Link `/voice-lab` wird hier zur Startseite weitergeleitet.

**Darios Original bleibt unter `code/voice-agent/` unverändert.** Diese App enthält einen
eigenen Browser-Adapter (`src/app/paxi-case-voice.ts`). Die normale Web-App hat weder die
Debug-Route noch den Debug-HTTP-Interceptor. Angular-Abhängigkeiten, Design-Tokens,
Übersetzungen und die bestehenden Fall-/Review-Dienste werden aus dem übergeordneten
Web-Workspace wiederverwendet. Es gibt keinen zweiten schreibenden Fallstore.

## Starten

Voraussetzung: Die bestehenden Dependencies in `code/` und `code/apps/web/` sind installiert.
Die Angular-CLI wird aus `../node_modules` genutzt; hier ist kein zusätzliches `npm install`
und keine zweite Dependency-Kopie erforderlich. Node-Version: siehe Web-README.

Aus der Repository-Wurzel in zwei Terminals:

```sh
# Backend: Port 3030, temporärer verschlüsselter synthetischer Fallspeicher.
# Liest den bestehenden OPENAI_API_KEY aus der Root-.env; gibt ihn nicht aus.
PAX_SYNTHETIC_VOICE_ENABLED=1 npm --prefix code/apps/web/debugging-app run start:backend
```

```sh
# Nur die Debug-Oberfläche: Port 4300 mit eigenem API-Proxy.
npm --prefix code/apps/web/debugging-app start
```

Alternativ direkt in diesem Ordner: `npm run start:backend` und `npm start`.
Live-Voice benötigt zusätzlich das Enable-Flag und die bestehende Provider-Konfiguration.
`npm --prefix code run start:voice-lab` bleibt als Alias für denselben Debug-Backend-Launcher erhalten.

Der lokale Entwicklungsproxy leitet `/api/**` an `127.0.0.1:3030` weiter und setzt den
bereits vom Backend erlaubten lokalen Origin `http://localhost:4200`. Das ist nur der
lokale Debug-Proxy; am Backend werden keine Authentisierungs-/CSRF-Prüfungen geändert.

## Wo Änderungen hingehören

| Anpassung | Datei in diesem Ordner |
|---|---|
| UI-Aufbau und Buttons | `src/app/voice-lab.html` |
| UI-Steuerung, Vorbereitung, Routing der Turns | `src/app/voice-lab.ts` |
| Styling | `src/app/voice-lab.scss` |
| Mikrofon, WebRTC und GPT-Live-Ereignisse | `src/app/paxi-case-voice.ts` |
| Debug-API-Aufrufe und Payload-Trace | `src/app/voice-lab-api.ts`, `src/app/lab-trace.ts` |
| Eigener App-Einstieg, Provider und Routen | `src/main.ts`, `src/app/app.config.ts` |
| Lokales Backend starten | `scripts/start-api.mjs` |
| API-Ziel/Port | `proxy.conf.json` |

Die serverseitigen öffentlichen Übergabepunkte bleiben bewusst beim gemeinsamen Backend:
`code/apps/api/src/voice/lab.ts` (Orchestrierung), `exact-income.ts` (exakte Einkommensangabe),
`service.ts` (Voice-Session/Prompt) und die vorhandenen authentifizierten Fallrouten.
Änderungen am Backend benötigen einen Build/Neustart; Frontend-Änderungen laden automatisch.

## Testen

```sh
npm --prefix code/apps/web/debugging-app test
npm --prefix code/apps/web/debugging-app run build
npm --prefix code/apps/web test -- --watch=false
npm --prefix code/apps/web run check:tokens
npm --prefix code/apps/web run check:i18n
node --test code/tests/voice-lab.test.mjs code/tests/voice-lab-income.test.mjs
```

In der UI: Hinweis akzeptieren → **Demo-Fall vorbereiten** → sprechende Person prüfen →
Gesprächs-Skills, Zeitbudget und optional bevorzugtes Thema einstellen → beide Zustimmungen →
**Live-Gespräch starten** und Mikrofon erlauben. Die Oberfläche ist ausschliesslich Live;
Replay- und Beispielbuttons sind entfernt.
Tests und Nachweise des tatsächlichen Live-Durchlaufs stehen in
[`documentation/baselhack/plans/voice-lab-mvp.md`](../../../../documentation/baselhack/plans/voice-lab-mvp.md).

Session-/Transkriptdaten liegen beim dedizierten Backend verschlüsselt in einem temporären
`pax-voice-lab-*`-Verzeichnis und werden bei dessen Beenden entfernt. Der Browser-Trace ist
speicherbegrenzt und nur im Arbeitsspeicher. Nur erfundene Angaben verwenden.

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
läuft. Der Live-Start blockiert auch dann, wenn Extraktion deaktiviert ist oder die Einstellungen fehlen:
Eine funktionierende Sprachverbindung allein darf nicht unbemerkt auf `rules-v1` zurückfallen.
Annahme und Profilbestätigung bleiben im aufklappbaren Review.

## Voice-Agent-Skills und Starteinstellungen

`code/apps/api/src/voice/prompt.ts` liest `code/voice-agent/persona.md` und verwendet Darios
`skills.mjs` direkt. Nur Dateien mit `assigned: true` sind auswählbar; aktuell **Friendly conversation**
und **Proposing plans**. Es gibt keine zweite Kopie dieser Skills. Die API liefert deren Metadaten über
`GET /api/voice/settings`; die gewählten Skill-IDs, das Zeitbudget und das bevorzugte Thema gehen beim
Start als `conversationSettings` in die Voice-Session und den tatsächlichen Provider-Prompt ein.
Nicht zugewiesene Skills und nicht unterstützte Themen werden serverseitig zurückgewiesen.
Die Backend-Grenzen zu erfundenen Daten, überprüften Berechnungen, Bestätigungen und Kontaktzusagen
gelten weiterhin und stehen explizit am Ende des Prompts. Änderungen an den Markdown-Skills werden
bei der nächsten Session gelesen. Sprache wird wie bisher oben in der Debug-App ausgewählt.

**Neustart nötig:** Der Modellpfad wird beim Start des Backends verdrahtet (`scripts/start-api.mjs`).
Ein bereits laufendes Backend kennt ihn nicht. Backend stoppen und aus der Repository-Wurzel neu starten;
der Schlüssel kommt aus der Root-`.env`:

```sh
PAX_SYNTHETIC_VOICE_ENABLED=1 npm --prefix code/apps/web/debugging-app run start:backend
```

## Prüfung der Auslagerung

Am 31.10.2026 geprüft: eigener Produktionsbuild und **34/34 Debug-App-Tests**, normaler
Web-Build und **183/183 Web-Tests**, gemeinsame Token-/i18n-Prüfungen und Diff-Check bestehen.
Der verschobene Backend-Launcher wurde separat auf Port 3032 gestartet und über `/api/status`
geprüft; der Smoke-Prozess ist danach beendet worden. Das bestehende Backend auf 3030 läuft weiter.
Browserprüfung auf 4300: eigener `debugging-root`, keine normale App-Shell, Avatar geladen,
Replay mit Korrektur bis zum echten pending Backend-Vorschlag und freigegebener Live-Start
nach Zustimmung. Die bereits getestete WebRTC-Implementierung wurde nur verschoben.

`git diff --exit-code -- code/voice-agent` ist leer. Auch `app.ts`, `app.html`,
`app.routes.ts` und `app.config.ts` der normalen Web-App entsprechen wieder dem Git-Stand.
