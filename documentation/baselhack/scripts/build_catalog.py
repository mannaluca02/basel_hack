"""Validate local sources and regenerate the catalogue, links and Markdown exports."""
from pathlib import Path
from pypdf import PdfReader
import argparse
import hashlib
import json
import os
import re
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
CATALOG = ROOT / 'catalog'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--exports-dir', type=Path, default=ROOT / 'exports')
EXPORTS = parser.parse_args().exports_dir.resolve()


def load(name):
    return json.loads((CATALOG / name).read_text())


def save(name, value):
    (CATALOG / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def target(relative):
    path = (REPO / relative).resolve()
    assert REPO in path.parents and path.is_file(), relative
    return path


def link(label, relative, document):
    path = target(relative)
    return f'[{label}](<{Path(os.path.relpath(path, document.parent)).as_posix()}>)'


def clean(text):
    return str(text).replace('|', '\\|').replace('\n', ' ')


pdfs = load('pdfs.json')
for row in pdfs:
    path = target(row['path'])
    data = path.read_bytes()
    assert data.startswith(b'%PDF-')
    checksum = sha(path)
    assert all(source['original_sha256'] == checksum for source in row['sources']), row['path']
    reader = PdfReader(path)
    relative = Path(row['path'])
    if row['category'] == 'Challenge':
        suffix = Path('challenge') / relative.relative_to('documentation/challenge_material')
    else:
        suffix = relative.relative_to('documentation/baselhack/references')
    extracted = ROOT / 'generated/extracted-text' / suffix.with_suffix('.txt')
    extracted.parent.mkdir(parents=True, exist_ok=True)
    extracted_text = '\n\n'.join(f'===== SEITE {i+1} =====\n' + (page.extract_text() or '')
                                  for i, page in enumerate(reader.pages))
    if row.get('document_type') == 'synthetic_analysis_report':
        extracted_text = re.sub(r'(AnalysisId:\s*)\S+', r'\1[REDACTED_SESSION_REFERENCE]', extracted_text)
    extracted.write_text(extracted_text)
    row.update({'pages': len(reader.pages), 'bytes': len(data), 'sha256': checksum,
                'text_path': extracted.relative_to(REPO).as_posix(),
                'technical_validation': 'pdf_parsed_and_text_extracted',
                'full_content_review': False})
save('pdfs.json', pdfs)

web = []
for path in sorted((ROOT / 'references/web').rglob('*.txt')):
    text = path.read_text()
    assert not re.search(r'eyJ[\w-]+\.[\w-]+\.[\w-]+', text), path.name
    match = re.search(r'URL: "(https://[^\"]+)"', text)
    assert match, path
    source_url = match.group(1)
    if any(key in source_url for key in ['customerId=', 'requestId=', 'versionId=']):
        parts = urlsplit(source_url)
        source_url = urlunsplit((parts.scheme, parts.netloc, parts.path, '', ''))
    web.append({'path': path.relative_to(REPO).as_posix(), 'url': source_url,
                'bytes': path.stat().st_size, 'sha256': sha(path),
                'status': 'historical_404' if 'Title: "404' in text else 'captured'})
save('web.json', web)

examples = []
for path in sorted((ROOT / 'references/api/examples').glob('*.json')):
    item = json.loads(path.read_text())
    assert item['http_status'] == 200
    examples.append({'operation': item['endpoint'].rsplit('/', 1)[-1],
                     'path': path.relative_to(REPO).as_posix(), 'status': item['http_status'],
                     'source_url': item['source_url']})
assert len(examples) == 24
save('api-examples.json', examples)
operations = json.loads((ROOT / 'references/api/openapi/schema-index.json').read_text())['operations']
assert len(operations) == 24

videos = load('videos.json')
for video in videos:
    file = target(video['path'])
    assert sha(file) == video['sha256'] and file.stat().st_size == video['bytes']
    assert video['status'] == 'downloaded'
    for caption in video['caption_files']:
        path = target(caption['path'])
        assert path.read_bytes().startswith(b'WEBVTT') and sha(path) == caption['sha256']

brand = load('brand-assets.json')
for asset in brand:
    assert sha(target(asset['path'])) == asset['sha256']

public_analysis = load('public-pension-analysis.json')
insurance_pdfs = [row for row in pdfs if row.get('document_type') not in {'legal_notice', 'synthetic_analysis_report'}]
product_pdfs = [row for row in insurance_pdfs if row['category'] != 'Challenge']
pdf_pages = sum(row['pages'] for row in pdfs)
source_records = sum(len(row['sources']) for row in pdfs)
issues = {'resolved': [
    {'item': 'Öffentliche Vorsorgeanalyse', 'resolution': 'Synthetic family flow completed; original 17-page draft PDF downloaded'},
    {'item': 'FondsStar-Flyer', 'resolution': 'PDF downloaded and validated'},
    {'item': 'LifeStar-Produktseite', 'resolution': 'Current lowercase URL captured; legacy 404 snapshot preserved'},
    {'item': 'LifeStar-Produktblatt', 'resolution': 'PDF downloaded and validated'},
    {'item': 'Pax-Videoreferenzen', 'resolution': f'{len(videos)} identified clips downloaded; available German subtitles saved'},
], 'open': [
    {'item': 'Öffentliche Analyse: Risikolücken', 'detail': public_analysis['findings'][0]['observation']},
    {'item': 'Öffentliche Analyse: PDF-Status', 'detail': public_analysis['findings'][1]['observation']},
    {'item': 'Risiko-ErrorCode', 'detail': 'Risk examples return 0; Swagger declares 1 as OK. Domain clarification remains necessary.'},
    {'item': 'Inhaltliche Vollprüfung', 'detail': 'Not every PDF page or video has been fully reviewed. Download is not review.'},
    {'item': 'Produktionsintegration', 'detail': 'Actual application acceptance, signature and policy issuance not verified.'},
]}
save('issues.json', issues)
manifest = {'capture_date': '2026-10-30', 'path_base': 'repository root',
            'unique_insurance_pdfs': len(insurance_pdfs), 'pdf_download_records': source_records,
            'insurance_pdf_pages': sum(row['pages'] for row in insurance_pdfs),
            'reference_pdfs': len(pdfs), 'reference_pdf_pages': pdf_pages,
            'legal_notice_pdfs': 2, 'synthetic_analysis_reports': 1,
            'public_pension_analysis': {'visible_version': public_analysis['visible_version'],
                                       'test_cases': len(public_analysis['tests']),
                                       'pdf_report_pages': public_analysis['pdf_report_pages'],
                                       'frontend_files_local_only': public_analysis['frontend_archive']['file_count']}, 'web_snapshots': len(web), 'api_examples': len(examples),
            'downloaded_videos': len(videos), 'video_bytes': sum(row['bytes'] for row in videos),
            'subtitle_files': sum(len(row['caption_files']) for row in videos),
            'extracted_logo_assets': len(brand),
            'scope': 'Challenge hub and identified directly relevant sources, not a full Pax website crawl',
            'credentials': 'Local private/ only; excluded from catalogue and Git', 'issues': issues}
save('manifest.json', manifest)


def source_appendix(document):
    lines = ['## Quellenkatalog', '',
             f'{len(pdfs)} unterschiedliche Referenz-PDFs mit {pdf_pages} Seiten aus {source_records} Downloadquellen. '
             f'Dazu {len(web)} Webseitenstände, 24 API-Beispiele, {len(videos)} Videodateien und {len(brand)} entpackte Logo-Dateien. '
             'Darunter sind 35 Fach-PDFs, zwei Nutzungs-/Datenschutz-PDFs und eine ausschließlich synthetische Testauswertung. '
             'Logo-PDFs zählen separat zu den Markenassets.', '',
             '### PDF-Unterlagen', '', '| Kategorie | Kanonische Datei | Seiten | Herkunft |', '|---|---|---:|---|']
    for row in pdfs:
        sources = ', '.join(f"[Quelle {n+1}]({source['url']})" for n, source in enumerate(row['sources']))
        lines.append(f"| {row['category']} | {link(Path(row['path']).name, row['path'], document)} | {row['pages']} | {sources} |")
    lines += ['', '### Webseitenstände', '', '| Quelle | Lokale Aufnahme | Status |', '|---|---|---|']
    for row in web:
        lines.append(f"| [{Path(row['path']).stem}]({row['url']}) | {link('TXT', row['path'], document)} | {row['status']} |")
    lines += ['', '### API-Operationen', '',
              'Pflichtfelder unten betreffen nur die oberste Ebene; die vollständige OpenAPI enthält die verschachtelten Regeln. '
              'Die Beispielantworten sind technische Referenzen, keine fachliche Zertifizierung.', '',
              '| Operation | Zweck | Pflichtfelder | Beispiel |', '|---|---|---|---|']
    by_operation = {row['operation']: row for row in examples}
    for operation in operations:
        name = operation['operationId']
        purpose = clean(operation.get('summary') or name.removeprefix('APICalc_'))
        fields = ', '.join(operation['required']) or 'keine'
        lines.append(f"| `{name}` | {purpose} | {fields} | {link('JSON', by_operation[name]['path'], document)} |")
    lines += ['', '### Videos und Untertitel', '',
              'Alle aufgeführten Videos sind lokal gespeichert. Die verfügbare Auflösung steht im Medienkatalog. '
              'YouTube-Untertitel können automatisch erzeugt sein und sind nicht manuell korrigiert. '
              'Es wird keine vollständige inhaltliche Sichtung aller Videos behauptet.', '',
              '| Video | Datei | Untertitel | Prüfung |', '|---|---|---|---|']
    for video in videos:
        captions = ', '.join(link('/'.join(c['languages']), c['path'], document) for c in video['caption_files']) or 'nicht verfügbar'
        lines.append(f"| [{clean(video['title'])}]({video['url']}) | {link('MP4', video['path'], document)} | {captions} | technisch heruntergeladen; nicht vollständig gesichtet |")
    lines += ['', '### Öffentliche Vorsorgeanalyse', '',
              link('Testbericht, Beobachtungen und Grenzen', public_analysis['report_path'], document), '',
              link('Original-PDF mit ausschließlich Testdaten (Entwurf)', public_analysis['pdf_report_path'], document), '',
              link('Testdaten und technisches Protokoll', 'documentation/baselhack/catalog/public-pension-analysis.json', document), '']
    lines += ['', '### Maschinenlesbare Bestandsdaten', '',
              '- ' + link('Manifest', 'documentation/baselhack/catalog/manifest.json', document),
              '- ' + link('PDF-Herkunft und Prüfsummen', 'documentation/baselhack/catalog/pdfs.json', document),
              '- ' + link('Video-Metadaten und Downloadhinweise', 'documentation/baselhack/catalog/videos.json', document),
              '- ' + link('Logo-Dateien und ursprüngliche Archiv-Mitglieder', 'documentation/baselhack/catalog/brand-assets.json', document),
              '- ' + link('Zuordnung alter und neuer Pfade', 'documentation/baselhack/catalog/path-migrations.json', document),
              '- ' + link('Offene und behobene Punkte', 'documentation/baselhack/catalog/issues.json', document), '']
    return '\n'.join(lines)


index = ROOT / 'references/README.md'
index.write_text('# Quellen und Medien – Pax BaselHack 2026\n\nStand: 30.10.2026.\n\n' + source_appendix(index))
plan = ROOT / 'plans/advisor-plan.md'
body = plan.read_text().split('<!-- GENERATED SOURCE APPENDIX -->')[0].rstrip()
body = re.sub(r'6 technische Tarifunterlagen und \d+ weitere Produkt-/Fondsunterlagen, zusammen \d+ Seiten',
              f"6 technische Tarifunterlagen und {len(product_pdfs)-6} weitere Produkt-/Fondsunterlagen, zusammen {sum(row['pages'] for row in product_pdfs)} Seiten", body)
plan.write_text(body + '\n\n<!-- GENERATED SOURCE APPENDIX -->\n\n' + source_appendix(plan))

(ROOT / 'README.md').write_text(f'''# Pax BaselHack – Teamgrundlage

Stand: 30.10.2026. Recherche, Material und Bauplan; die Advisor-App ist noch nicht implementiert.

- [Gesamtplan](plans/advisor-plan.md)
- [Aufteilung für fünf Personen](plans/team-plan.md)
- [Vollständiger Quellen- und Medienkatalog](references/README.md)
- [Öffentliche Pax/vlot-Analyse: Test und Download](reports/public-pension-analysis.md)

**Bestand:** {len(pdfs)} Referenz-PDFs / {pdf_pages} Seiten (35 Fach-PDFs, zwei Nutzungs-/Datenschutz-PDFs, eine synthetische Testauswertung), {source_records} PDF-Downloadquellen,
{len(web)} Webseitenstände, 24 API-Beispiele, {len(videos)} Videos, {manifest['subtitle_files']} Untertiteldateien und {len(brand)} Original-Logo-Dateien.
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
''')

source_files = []
paths = {row['path'] for row in pdfs} | {row['path'] for row in web} | {row['path'] for row in brand} | {row['path'] for row in videos}
paths |= {c['path'] for row in videos for c in row['caption_files']}
paths |= {path.relative_to(REPO).as_posix() for path in (ROOT / 'references/api').rglob('*') if path.is_file()}
paths |= {path.relative_to(REPO).as_posix() for folder in [ROOT / 'references/public-pension-analysis', ROOT / 'evidence/screenshots/public-pension-analysis']
          for path in folder.rglob('*') if path.is_file()}
for relative in sorted(paths):
    path = target(relative)
    source_files.append({'path': relative, 'bytes': path.stat().st_size, 'sha256': sha(path)})
save('files.json', source_files)
for path in list((ROOT / 'references').rglob('*')) + list(CATALOG.rglob('*')):
    if path.is_file() and path.suffix in {'.txt', '.json', '.yaml', '.md', '.vtt'}:
        assert not re.search(rb'eyJ[\w-]+\.[\w-]+\.[\w-]+', path.read_bytes()), path.name

EXPORTS.mkdir(parents=True, exist_ok=True)
for source, name in [(plan, 'PAX_DIGITAL_ADVISOR_PLAN.md'), (ROOT / 'plans/team-plan.md', 'BASELHACK_TEAMPLAN.md'),
                     (index, 'BASELHACK_QUELLEN.md')]:
    def export_link(match):
        value = match.group(1) or match.group(2)
        if '://' in value or value.startswith('#'):
            return match.group(0)
        return '](<' + str((source.parent / value).resolve()) + '>)'
    exported = re.sub(r'\]\((?:<([^>]+)>|([^\s)]+))\)', export_link, source.read_text())
    (EXPORTS / name).write_text(exported)
print(json.dumps(manifest, ensure_ascii=False))
