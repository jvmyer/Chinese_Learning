#!/usr/bin/env python3
"""
add_vocab.py – Merzt neue Vokabeln in vocab/master.json

Verwendung:
  python3 scripts/add_vocab.py <eingabe.json>
  python3 scripts/add_vocab.py <eingabe.json> --dry-run   # zeigt nur was hinzugefügt würde
  python3 scripts/add_vocab.py --stats                    # zeigt nur aktuelle Statistik

Eingabe-Formate (werden automatisch erkannt):
  1. Quiz-Set-Format:  { "id": "...", "cards": [{ "chinese": ..., "german"/"english": ... }] }
  2. Master-Format:    { "vocab": [{ "chinese": ..., "german": ... }] }
  3. Einfache Liste:   [{ "chinese": ..., "german": ... }]
"""

import json
import sys
import os
from datetime import date

MASTER_PATH = os.path.join(os.path.dirname(__file__), '..', 'vocab', 'master.json')


def load_master():
    path = os.path.abspath(MASTER_PATH)
    if not os.path.exists(path):
        return {"updated": str(date.today()), "total": 0, "vocab": []}
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_master(data):
    data['updated'] = str(date.today())
    data['total'] = len(data['vocab'])
    path = os.path.abspath(MASTER_PATH)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_entry(raw, source=''):
    """Normalisiert einen Roheintrag auf das master.json-Schema."""
    chinese = raw.get('chinese', '').strip()
    german  = (raw.get('german') or raw.get('english') or '').strip()
    pinyin  = raw.get('pinyin', '').strip()
    example = raw.get('example', '').strip()
    src     = raw.get('source', source).strip()

    if not chinese or not german:
        return None

    return {
        'chinese': chinese,
        'pinyin':  pinyin,
        'german':  german,
        'example': example,
        'source':  src,
        'added':   raw.get('added', str(date.today())),
    }


def parse_input(raw, source_hint=''):
    """Erkennt automatisch das Eingabeformat und gibt eine Liste normalisierter Einträge zurück."""
    entries = []

    # Format 1: Quiz-Set { "cards": [...] }
    if isinstance(raw, dict) and 'cards' in raw:
        src = raw.get('id', source_hint)
        for c in raw['cards']:
            e = normalize_entry(c, src)
            if e:
                entries.append(e)

    # Format 2: Master { "vocab": [...] }
    elif isinstance(raw, dict) and 'vocab' in raw:
        for c in raw['vocab']:
            e = normalize_entry(c, source_hint)
            if e:
                entries.append(e)

    # Format 3: Direkte Liste [...]
    elif isinstance(raw, list):
        for c in raw:
            e = normalize_entry(c, source_hint)
            if e:
                entries.append(e)

    else:
        print('⚠️  Unbekanntes Format. Erwartet: { "cards": [...] } oder { "vocab": [...] } oder [...]')

    return entries


def main():
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    stats_only = '--stats' in args
    files = [a for a in args if not a.startswith('--')]

    master = load_master()
    existing = {e['chinese'] for e in master['vocab']}

    if stats_only:
        print(f'\n📚 master.json · Stand {master.get("updated", "?")}')
        print(f'   {len(master["vocab"])} Vokabeln gesamt')
        sources = {}
        for v in master['vocab']:
            s = v.get('source', '–')
            sources[s] = sources.get(s, 0) + 1
        for s, n in sorted(sources.items(), key=lambda x: -x[1]):
            print(f'   · {s}: {n}')
        print()
        return

    if not files:
        print('Verwendung: python3 scripts/add_vocab.py <datei.json> [--dry-run]')
        print('            python3 scripts/add_vocab.py --stats')
        sys.exit(1)

    all_new = []

    for filepath in files:
        if not os.path.exists(filepath):
            print(f'❌ Datei nicht gefunden: {filepath}')
            continue

        with open(filepath, encoding='utf-8') as f:
            raw = json.load(f)

        source_hint = os.path.splitext(os.path.basename(filepath))[0]
        candidates = parse_input(raw, source_hint)

        new     = [e for e in candidates if e['chinese'] not in existing]
        skipped = [e for e in candidates if e['chinese'] in existing]

        print(f'\n📄 {filepath}')
        print(f'   {len(candidates)} Einträge gelesen · {len(new)} neu · {len(skipped)} bereits vorhanden')

        if skipped:
            for e in skipped:
                print(f'   ↩  {e["chinese"]} ({e["german"]}) – übersprungen')

        if new:
            for e in new:
                print(f'   ✅ {e["chinese"]} ({e["pinyin"]}) – {e["german"]}')
            all_new.extend(new)
            existing.update(e['chinese'] for e in new)

    if not all_new:
        print('\n✓ Keine neuen Vokabeln – master.json unverändert.')
        return

    if dry_run:
        print(f'\n🔍 Dry-Run: {len(all_new)} neue Vokabeln würden hinzugefügt (nicht gespeichert).')
        return

    master['vocab'].extend(all_new)
    save_master(master)
    print(f'\n💾 master.json aktualisiert: +{len(all_new)} neue Vokabeln → {len(master["vocab"])} gesamt')


if __name__ == '__main__':
    main()
