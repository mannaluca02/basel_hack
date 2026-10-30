# Pax BaselHack – Teamgrundlage

Stand: 30.10.2026. Recherche, Material und Bauplan; die Advisor-App ist noch nicht implementiert.

- [Gesamtplan](plans/advisor-plan.md)
- [Aufteilung für fünf Personen](plans/team-plan.md)
- [Vollständiger Quellen- und Medienkatalog](references/README.md)
- [Öffentliche Pax/vlot-Analyse: Test und Download](reports/public-pension-analysis.md)

**Bestand:** 38 Referenz-PDFs / 417 Seiten (35 Fach-PDFs, zwei Nutzungs-/Datenschutz-PDFs, eine synthetische Testauswertung), 40 PDF-Downloadquellen,
48 Webseitenstände, 24 API-Beispiele, 16 Videos, 16 Untertiteldateien und 37 Original-Logo-Dateien.
Heruntergeladen und technisch geprüft bedeutet keine vollständige inhaltliche Prüfung.

## Verzeichnisstruktur

| Pfad | Inhalt |
|---|---|
| `plans/` | Produkt-/Umsetzungsplan und Teamaufteilung |
| `../challenge_material/` | Die zehn gemeinsamen Original-PDFs und der Challenge-Text; keine zusätzliche Kopie |
| `references/products/` | Broschüren, Produktblätter, Basisinformationen und technische Tarifunterlagen |
| `references/funds/` | Fondslisten und Fondsinformationen |
| `references/public-pension-analysis/` | AGB, Datenschutz, synthetische Originalauswertung, Eingabedaten und UI-Textstände |
| `reports/` | Testbericht mit Beobachtungen und Prüfumfang |
| `references/api/` | OpenAPI, Schemaindex, JSON-Beispiele und ursprüngliche Rechneransichten |
| `references/web/` | Webseitenstände nach Hub, Pax-Produkten, Ratgebern, Services und Design getrennt |
| `references/videos/transcripts/` | Verfügbare Untertitel; MP4-Dateien liegen unter `assets/pax/videos/` im Repo |
| `catalog/` | Herkunft, Prüfsummen, Aliase, Medienstatus, Pfadmigration und offene Punkte |
| `generated/extracted-text/` | Extrahierte PDF-Texte, nach Fachthema geordnet |
| `generated/previews/` | Gerenderte PDF-Stichproben |
| `evidence/screenshots/` | Nachweise der Recherche und synthetischer Tests |
| `scripts/` | Lokale Katalogprüfung und Erzeugung der Dokumentindizes |
| `private/` | Lokaler API-Zugang und privater Frontend-Referenzstand; nicht mit Git geteilt |
| `exports/` | Ignorierte Markdown-Downloadkopien; kein automatisch erzeugtes ZIP |

Die entpackten Logos stehen im Repo unter `assets/pax/logos/online/` und `assets/pax/logos/print/`.
Die Videodateien stehen unter `assets/pax/videos/quicksale/`, `products/` und `pension/`.
Zwei identische PDF-Paare wurden zusammengeführt; beide Herkunftslinks bleiben im PDF-Katalog erhalten.

## Katalog neu erzeugen

Mit einer lokalen Python-Umgebung in diesem Ordner:

```sh
python -m pip install -r requirements.txt
python scripts/build_catalog.py
```

Optionaler anderer Exportort: `--exports-dir /pfad/zum/export`.
Der Vorgang nutzt ausschließlich lokale Quellen, prüft deren Integrität und erzeugt kein ZIP.
Alle Katalogpfade sind relativ zur Repo-Wurzel; die Markdown-Links sind relativ zum jeweiligen Dokument.
Der geprüfte Stand verwendete Python 3.14 und die in `requirements.txt` festgehaltenen Bibliotheken.

Die Vorlage [logismata.env.example](logismata.env.example) enthält keinen echten Token.
Autorisierte Zugangsdaten gehören ausschließlich nach `private/logismata.env` und werden nie mit Git geteilt.
