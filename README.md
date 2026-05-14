# Chinesisch-Lernkartei

Eine einfache, selbst gehostete Vokabelkartei für Chinesisch (Mandarin), ähnlich wie Quizlet — komplett im Browser, ohne Anmeldung, ohne externe Dienste.

---

## Was ist das?

- **Vokabeltrainer** mit Multiple-Choice und Tippen-Modus
- **Spaced-Repetition-Algorithmus** (SM-2): Karten die du gut kannst, kommen seltener. Schwache Karten kommen öfter.
- **Lernphasen**: Neu → Lernen → Review → Sicher
- **Vorlesefunktion**: Jedes Wort per Knopfdruck vorgesprochen (Browser-TTS, kein Internet nötig)
- **Grammatikreferenz** direkt auf der Startseite (Zahlen 1–30, Grundsätze, Partikel, …)
- **Fortschritt wird gespeichert** — im Browser (localStorage) und als exportierbare JSON-Datei

---

## Voraussetzungen

- Ein moderner Browser (Chrome, Safari, Firefox, Edge)
- Python 3 — nur zum lokalen Starten des Servers (ist auf macOS vorinstalliert)
- Kein Node.js, kein npm, kein Build-Schritt

---

## Repo-Struktur

```
Chinese_Learning-1/
│
├── quiz-app/               ← Die Web-App (HTML + CSS + JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── vocab/                  ← Vokabel-Datenbank als JSON
│   ├── master.json         ← ALLE Vokabeln (wird von der App geladen)
│   └── *.json              ← Einzelne Sets (optional, per Datei-Import ladbar)
│
├── scripts/
│   └── add_vocab.py        ← Hilfsskript: neue Vokabeln in master.json einfügen
│
├── notes/                  ← Lernnotizen (Markdown, optional)
├── progress/               ← Gespeicherter Lernfortschritt (JSON, optional)
└── materials/              ← Kurs-PDFs, Scans (gitignored, nur lokal)
```

---

## App lokal starten

```bash
# Im Hauptordner des Repos:
python3 -m http.server 8765
```

Dann im Browser öffnen: **http://localhost:8765/quiz-app/**

> Die App lädt `vocab/master.json` automatisch beim Start.  
> Ohne laufenden Server (z.B. per Doppelklick auf die HTML-Datei) funktioniert das automatische Laden nicht — dann stattdessen die JSON-Datei manuell über „+ Set laden" importieren.

---

## Vokabeln hinzufügen

### Option A — Mit Claude (empfohlen)

Kurs-PDF oder Scan in Claude öffnen und den Befehl `/add-vocab` eingeben.  
Claude extrahiert alle chinesischen Wörter und schreibt sie automatisch in `vocab/master.json`.

### Option B — Manuell per Skript

Eine JSON-Datei mit neuen Vokabeln anlegen:

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

Dann ins Terminal:

```bash
python3 scripts/add_vocab.py meine-vokabeln.json
```

Das Skript prüft automatisch auf Duplikate und fügt nur neue Einträge ein.

```bash
# Vorschau ohne Änderungen:
python3 scripts/add_vocab.py meine-vokabeln.json --dry-run

# Übersicht über alle gespeicherten Vokabeln:
python3 scripts/add_vocab.py --stats
```

### Option C — Eigenes JSON-Set importieren

In der App auf **„+ Set laden"** klicken und eine JSON-Datei im folgenden Format importieren:

```json
{
  "id": "mein-set",
  "name": "Lektion 1 – Begrüßungen",
  "cards": [
    {
      "chinese": "你好",
      "pinyin": "nǐ hǎo",
      "german": "Hallo",
      "example": "你好，我叫李明。"
    }
  ]
}
```

---

## Lernmodi

| Modus | Beschreibung |
|---|---|
| **Lernen** | Erster Durchgang: Multiple Choice. Danach: Tippen. (Empfohlen) |
| **Flashcard** | Karte umdrehen, selbst bewerten |
| **Multiple Choice** | 4 Antwortmöglichkeiten |
| **Schreiben** | Bedeutung oder Pinyin eintippen |

**Richtungen:** ZH→DE (Chinesisch sehen, Deutsch eingeben) oder DE→ZH (Deutsch sehen, Pinyin eingeben)

**Session-Typen:**
- **Alle lernen** — alle Karten des Sets
- **Fällige** — nur Karten die laut Spaced Repetition jetzt dran sind
- **Neue Karten** — noch nie gesehene Karten
- **Schwache Wörter** — Karten mit unter 60 % Trefferquote

---

## Aussprache

Die App nutzt die **Web Speech API** des Browsers — keine Internetverbindung nötig, keine API-Keys.

Für bessere Qualität auf macOS: **Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte → Systemstimme → Anpassen** → „Meijia" oder „Tingting" herunterladen.

---

## Lernfortschritt speichern

Der Fortschritt wird automatisch im Browser gespeichert (localStorage).  
Für ein Backup oder Sync zwischen Geräten: in der App auf **„↓ Speichern"** klicken und die Datei als `progress/progress.json` im Repo ablegen. Beim nächsten Start wird sie automatisch geladen und mit dem lokalen Stand zusammengeführt.

---

## Auf GitHub Pages veröffentlichen

1. Repo auf GitHub pushen
2. In den Repo-Einstellungen: **Settings → Pages → Source: Deploy from a branch → main / root**
3. Die App ist dann erreichbar unter: `https://<dein-username>.github.io/<repo-name>/quiz-app/`

> `vocab/master.json` wird automatisch mitgeladen, da es im Repo getrackt ist.  
> Der Ordner `materials/` ist in `.gitignore` — Kurs-PDFs landen nie auf GitHub.
