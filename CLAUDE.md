# Chinesisch-Lernrepo – Navigationsguide für Claude

## Repo-Übersicht

Dieses Repo begleitet einen Chinesisch-Kurs. Kurs-Materialien (PDFs, Scans) liegen lokal in `materials/` und sind **gitignored** – Claude kann diese Dateien nicht lesen. Alle für Claude relevanten Infos sind in `vocab/` und `notes/` als Text aufbereitet.

```
Chinese_Learning-1/
├── vocab/          ← Vokabel-Sets als JSON (Claude-generiert aus Materialien)
├── notes/          ← Markdown-Notizen zu Lektionen, Grammatik, Fehlern
├── quiz-app/       ← Web-App für Vokabelabfrage (wie Quizlet)
└── materials/      ← GITIGNORED – nur lokal (PDFs, Scans, Audio)
```

## Navigationsanweisung

**Fragen zu Vokabeln:** → Zuerst `vocab/*.json` lesen  
**Fragen zu Grammatik/Lektionsinhalten:** → `notes/` lesen  
**Allgemeine Fortschrittsfragen:** → alle `notes/*.md` überfliegen  
**`materials/` nie versuchen zu lesen** – Dateien sind lokal nicht abrufbar über Claude-Tools

## Vokabeln aus Materialien extrahieren (`/add-vocab`)

**Skill:** `/add-vocab` — extrahiert Vokabeln aus einer Datei und schreibt neue Einträge direkt in `vocab/master.json`.

**Master-Datenbank:** `vocab/master.json` enthält ALLE Vokabeln aus dem gesamten Kurs.  
Die Quiz-App lädt diese Datei automatisch beim Start (über HTTP-Server).

**Schema für neue Einträge:**
```json
{
  "chinese": "你好",
  "pinyin": "nǐ hǎo",
  "german": "Hallo",
  "example": "你好，我叫李明。",
  "source": "SIP1ChinFA-L2",
  "added": "2026-05-13"
}
```

**Ablauf wenn User Materialien gibt:**
1. Datei lesen, alle chinesischen Wörter mit deutscher Bedeutung extrahieren
2. `vocab/master.json` lesen → existierende `chinese`-Felder prüfen
3. Nur neue Einträge hinzufügen → `master.json` speichern
4. Bericht: X neu, Y bereits vorhanden, Z gesamt

**Script für manuelle Nutzung:**
```bash
python3 scripts/add_vocab.py <datei.json>          # merzt in master.json
python3 scripts/add_vocab.py <datei.json> --dry-run # nur Vorschau
python3 scripts/add_vocab.py --stats               # Übersicht
```

**Quiz-App starten:**
```bash
cd quiz-app && python3 -m http.server 8765
# → http://localhost:8765
# Lädt master.json automatisch
```

## Notizen-Format (`notes/`)

Jede Lektion bekommt eine Datei `notes/week-NN.md` mit:
- Datum und Thema
- Wichtigste Grammatikpunkte
- Schwierige Punkte / eigene Fehler
- Hausaufgaben
