# Chinesisch-Lernkartei

Eine selbst gehostete Vokabelkartei für Mandarin-Chinesisch — ähnlich wie Quizlet, komplett im Browser, ohne Anmeldung, ohne externe Dienste, ohne Tracking.

> Kurs: SIP Chinesisch 1 · Universität · Dozentin Chao-Chen Sung M.A.

---

## Was ist das?

- **Vokabeltrainer** mit Multiple-Choice und Tippen-Modus
- **Spaced-Repetition** (SM-2-Algorithmus): gute Karten kommen seltener, schwache öfter
- **Lernphasen**: Neu → Lernen → Review → Sicher
- **Vorlesefunktion**: jedes Wort per Knopfdruck vorgesprochen (Browser-TTS, kein Internet nötig)
- **Grammatikreferenz** direkt auf der Startseite (Zahlen, Grundpartikel, …)
- **Fortschritt wird gespeichert** — im Browser (localStorage) und als exportierbare JSON-Datei

---

## Voraussetzungen

| Was | Wozu |
|-----|------|
| Moderner Browser | App benutzen |
| Python 3 | Lokalen Server starten (auf macOS vorinstalliert) |
| `pip install pypdf` | Nur für `check_coverage.py` |
| [Claude Code](https://claude.ai/code) | Nur für `/add-vocab`-Skill und `check_coverage.py` |

Kein Node.js, kein npm, kein Build-Schritt nötig.

---

## Schnellstart

```bash
git clone https://github.com/<dein-username>/<repo-name>
cd <repo-name>
python3 -m http.server 8765
```

Dann im Browser: **http://localhost:8765/quiz-app/**

Die App lädt `vocab/master.json` automatisch beim Start.

---

## Repo-Struktur

```
Chinese_Learning-1/
│
├── quiz-app/                ← Web-App (HTML + CSS + JS, läuft im Browser)
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── vocab/                   ← Vokabel-Datenbank als JSON
│   ├── master.json          ← ALLE Vokabeln (wird von der App geladen)
│   └── *.json               ← Einzelne Sets (per Datei-Import in der App ladbar)
│
├── scripts/
│   ├── add_vocab.py         ← Neue Vokabeln in master.json einfügen
│   └── check_coverage.py   ← Prüft ob alle Blatt-Vokabeln im Fragepool sind
│
├── .claude/skills/          ← Claude-Code-Skill für automatische Extraktion
├── notes/                   ← Lernnotizen (gitignored, nur lokal)
├── progress/                ← Lernfortschritt-Backups (gitignored, nur lokal)
└── materials/               ← Kurs-PDFs, Scans (gitignored, landen nie auf GitHub)
```

---

## Vokabeln hinzufügen

### Option A — Automatisch mit Claude Code

```
/add-vocab
```

Datei (PDF, Foto, Scan) in Claude Code öffnen, `/add-vocab` eingeben.  
Claude extrahiert alle chinesischen Wörter und schreibt sie direkt in `vocab/master.json`.

### Option B — Manuell per Skript

JSON-Datei mit neuen Vokabeln anlegen:

```json
[
  {
    "chinese": "你好",
    "pinyin": "nǐ hǎo",
    "german": "Hallo",
    "example": "你好，我叫李明。",
    "source": "lektion-01",
    "added": "2026-05-14"
  }
]
```

```bash
python3 scripts/add_vocab.py meine-vokabeln.json
python3 scripts/add_vocab.py meine-vokabeln.json --dry-run  # Vorschau
python3 scripts/add_vocab.py --stats                        # Übersicht
```

### Option C — Import in der App

In der App auf **„+ Set laden"** klicken, JSON im Format:

```json
{
  "id": "mein-set",
  "name": "Lektion 1 – Begrüßungen",
  "cards": [
    { "chinese": "你好", "pinyin": "nǐ hǎo", "german": "Hallo" }
  ]
}
```

---

## Coverage-Check

Prüft ob alle Vokabeln aus den Übungsblättern auch im Fragepool (`master.json`) stehen.  
Nutzt den lokalen `claude`-CLI (Claude Code) für intelligente Extraktion — kein API-Key nötig.

```bash
pip install pypdf
python3 scripts/check_coverage.py           # alle PDFs in materials/
python3 scripts/check_coverage.py --sheet SiP1Chin_SR1.pdf  # ein Blatt
```

Beispiel-Output:

```
Fragepool: 116 Vokabeln  ·  master.json
  🔍 SiP1Chin_SR1.pdf … 22 Vokabeln  ·  0 fehlend
  🔍 [vocab]SIP1ChinFA-L2.pdf … 24 Vokabeln  ·  0 fehlend
  ✅  Alle Vokabeln im Fragepool vorhanden
```

---

## Lernmodi

| Modus | Beschreibung |
|-------|-------------|
| **Lernen** | Erster Durchgang: Multiple Choice, dann: Tippen (empfohlen) |
| **Flashcard** | Karte umdrehen, selbst bewerten |
| **Multiple Choice** | 4 Antwortmöglichkeiten |
| **Schreiben** | Bedeutung oder Pinyin eintippen |

**Richtungen:** ZH→DE (Chinesisch sehen, Deutsch eingeben) · DE→ZH (Deutsch sehen, Pinyin eingeben)

**Session-Typen:** Alle · Fällige · Neue Karten · Schwache Wörter

---

## Aussprache

Die App nutzt die **Web Speech API** des Browsers — keine Internetverbindung nötig, keine API-Keys.

Für bessere Qualität auf macOS:  
**Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte → Systemstimme → Anpassen** → „Meijia" oder „Tingting" herunterladen.

---

## Lernfortschritt

Fortschritt wird automatisch im Browser-localStorage gespeichert.  
Backup/Sync: in der App auf **„↓ Speichern"** klicken → Datei als `progress/progress.json` ablegen.  
`progress/` ist gitignored — bleibt lokal, landet nicht auf GitHub.

---

## Auf GitHub Pages veröffentlichen

1. Repo auf GitHub pushen
2. **Settings → Pages → Source: Deploy from a branch → main / root**
3. App erreichbar unter: `https://<username>.github.io/<repo-name>/quiz-app/`

`vocab/master.json` wird automatisch mitgeladen.  
`materials/`, `notes/`, `progress/` sind gitignored — keine persönlichen Daten auf GitHub.

---

## Datenschutz / Sicherheit

| Was | Status |
|-----|--------|
| API-Keys / Passwörter im Repo | ❌ keine |
| Kurs-Materialien (PDFs) | ❌ gitignored (`materials/`) |
| Persönliche Notizen | ❌ gitignored (`notes/`) |
| Lernfortschritt | ❌ gitignored (`progress/`) |
| Vokabeln (`master.json`) | ✅ getrackt, kein sensitiver Inhalt |
| Externe Dienste / Tracking | ❌ keine |
