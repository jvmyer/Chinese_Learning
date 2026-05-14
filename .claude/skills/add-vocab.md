# Skill: /add-vocab

Liest eine Datei vollständig aus und fügt ALLE chinesischen Wörter die noch nicht in `vocab/master.json` stehen direkt hinzu. Kein Review-Schritt, kein Filtern.

## Ablauf

1. **Datei vollständig lesen** – PDF, Foto, Scan, Text. Jeden Satz, jede Zeile, jede Tabelle, jede Fußnote.

2. **Alle chinesischen Wörter extrahieren** – Keine Ausnahmen, keine Wertung:
   - Jedes Wort aus Vokabellisten
   - Jedes Wort aus Beispielsätzen
   - Jedes Wort aus Übungen und Fragen
   - Grammatikpartikel (是, 的, 吗, 了, 呢 …)
   - Einzelne Zeichen UND Mehrwortausdrücke
   - Wenn die Datei nur Pinyin enthält: chinesische Zeichen aus eigenem Wissen ergänzen
   - Wenn ein Wort unklar ist: trotzdem aufnehmen, Bedeutung nach bestem Wissen

3. **Gegen master.json prüfen** – Lese `vocab/master.json`. Vergleiche jeden extrahierten Eintrag mit den vorhandenen `chinese`-Feldern (exakter String-Match). Nur neue Einträge weitergeben.

4. **Direkt in master.json schreiben** – Neue Einträge über `scripts/add_vocab.py` einfügen:
   ```bash
   python3 scripts/add_vocab.py <temp-datei.json>
   ```
   Temporäre Datei danach löschen.

5. **Bericht** – Ausgabe:
   - Wie viele Wörter aus der Datei extrahiert
   - Wie viele neu hinzugefügt
   - Wie viele bereits vorhanden (übersprungen)
   - Neue Gesamtzahl in master.json

## Format für neue Einträge

```json
[
  {
    "chinese": "你好",
    "pinyin": "nǐ hǎo",
    "german": "Hallo",
    "example": "你好，我叫李明。",
    "source": "<dateiname-ohne-extension>",
    "added": "<heute-YYYY-MM-DD>"
  }
]
```

## Regeln

- **Vollständigkeit vor Perfektion** – Lieber ein Wort zu viel als eines zu wenig.
- **Pinyin**: immer mit Tonzeichen (ā á ǎ à), nie nummerisch.
- **German**: Deutsch, nicht Englisch. Mehrere Bedeutungen mit ` / ` trennen.
- **Kein Filtern** – Nicht entscheiden ob ein Wort "wichtig genug" ist. Alles rein.
- **Source**: Dateiname ohne Endung (z.B. `SIP1ChinFA-L2`).
