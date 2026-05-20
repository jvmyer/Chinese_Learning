#!/usr/bin/env python3
"""
check_coverage.py — Agent: Scannt alle Übungsblätter in materials/ und
prüft ob alle Vokabeln im Fragepool (vocab/master.json) vorhanden sind.

Verwendet den lokalen `claude` CLI (Claude Code) für intelligente Extraktion —
kein separater API-Key nötig.

Verwendung:
  python3 scripts/check_coverage.py                  # alle PDFs
  python3 scripts/check_coverage.py --sheet SR1.pdf  # nur ein Blatt

Benötigt: pip install pypdf
"""

import argparse
import json
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Optional

import pypdf

REPO = Path(__file__).parent.parent
MATERIALS = REPO / "materials"
MASTER_PATH = REPO / "vocab" / "master.json"

EXTRACT_PROMPT = """\
Du analysierst ein Chinesisch-Übungsblatt. Extrahiere alle Vokabeln.

Regeln:
- Nur eigenständige Lernvokabeln, KEINE reinen Grammatikpartikel (的/吗/吧/呢/了)
- KEINE Eigennamen (Wang, Zhang, Chao-Chen, Gāng usw.)
- KEINE deutschen Wörter, KEINE phonetischen Bezeichnungen (韵母/声母)
- Pinyin normalisiert mit Standard-Tondiakritica (nǐ hǎo)
- Chinese als vereinfachte Schriftzeichen
- Falls das Blatt keine lernbaren Vokabeln enthält: gib [] zurück
- Antworte NUR mit einem JSON-Array, kein Text drumherum

Blattname: {name}

Inhalt:
{content}

Format: [{{"pinyin": "nǐ hǎo", "chinese": "你好", "german": "Hallo"}}]"""


# ── PDF-Extraktion ─────────────────────────────────────────────────────────

def pdf_to_text(path: Path) -> str:
    reader = pypdf.PdfReader(str(path))
    return "\n".join(p.extract_text() or "" for p in reader.pages).strip()


# ── Claude CLI ─────────────────────────────────────────────────────────────

def ask_claude(name: str, text: str) -> list:
    prompt = EXTRACT_PROMPT.format(name=name, content=text[:4000])
    try:
        result = subprocess.run(
            ["claude", "-p", prompt],
            capture_output=True, text=True, timeout=60
        )
        return _parse_vocab_json(result.stdout)
    except subprocess.TimeoutExpired:
        print(f"    Timeout bei {name}", file=sys.stderr)
        return []
    except FileNotFoundError:
        print("Fehler: `claude` CLI nicht gefunden.", file=sys.stderr)
        sys.exit(1)


def _parse_vocab_json(raw: str) -> list:
    match = re.search(r"\[.*?\]", raw, re.DOTALL)
    if not match:
        return []
    try:
        entries = json.loads(match.group())
        return [e for e in entries if isinstance(e, dict) and e.get("chinese")]
    except json.JSONDecodeError:
        return []


# ── Vergleich gegen master.json ────────────────────────────────────────────

def strip_tones(pinyin: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", pinyin.lower().strip())
        if unicodedata.category(c) != "Mn"
    )


def load_master() -> dict:
    with open(MASTER_PATH, encoding="utf-8") as f:
        return json.load(f)


def build_index(vocab: list) -> tuple:
    pinyin_set  = {strip_tones(v["pinyin"]) for v in vocab if v.get("pinyin")}
    chinese_set = {v["chinese"].strip()     for v in vocab if v.get("chinese")}
    return pinyin_set, chinese_set


def find_missing(sheet_vocab: list, pinyin_idx: set, chinese_idx: set) -> list:
    missing = []
    for word in sheet_vocab:
        bare = strip_tones(word.get("pinyin", ""))
        chin = word.get("chinese", "").strip()
        if not ((bare and bare in pinyin_idx) or (chin and chin in chinese_idx)):
            missing.append(word)
    return missing


# ── Haupt-Loop ─────────────────────────────────────────────────────────────

def collect_sheets(target: Optional[str]) -> list:
    if target:
        p = MATERIALS / target
        return [p] if p.exists() else []
    return sorted(p for p in MATERIALS.iterdir()
                  if p.is_file() and p.suffix.lower() == ".pdf")


def print_report(results: list) -> int:
    total_checked = sum(len(found) + len(missing) for _, found, missing in results)
    total_missing = sum(len(missing) for _, _, missing in results)

    print(f"\n{'═' * 60}")
    print(f"  Coverage-Bericht  ·  {total_checked} Vokabeln geprüft")
    print(f"{'═' * 60}")

    for name, found, missing in results:
        icon = "✓" if not missing else "✗"
        print(f"\n{icon} {name}")
        print(f"  {len(found)} vorhanden  ·  {len(missing)} fehlend")
        for w in missing:
            print(f"    ❌  {w.get('chinese','?')}  ({w.get('pinyin','?')})  –  {w.get('german','?')}")

    print(f"\n{'═' * 60}")
    if total_missing:
        print(f"  ⚠️  {total_missing} Vokabeln fehlen im Fragepool")
        print(f"  → python3 scripts/add_vocab.py <datei.json>  zum Nachtragen")
    else:
        print(f"  ✅  Alle Vokabeln im Fragepool vorhanden")
    print(f"{'═' * 60}\n")
    return total_missing


def main() -> None:
    parser = argparse.ArgumentParser(description="Coverage-Check für Vokabelblätter")
    parser.add_argument("--sheet", metavar="DATEI", help="Nur ein bestimmtes Blatt prüfen")
    args = parser.parse_args()

    master = load_master()
    pinyin_idx, chinese_idx = build_index(master["vocab"])

    print(f"\nFragepool: {len(master['vocab'])} Vokabeln  ·  {MASTER_PATH.name}")

    sheets = collect_sheets(args.sheet)
    if not sheets:
        print("Keine Blätter gefunden.")
        sys.exit(0)

    results = []
    for path in sheets:
        text = pdf_to_text(path)
        if not text:
            print(f"  ⏭  {path.name}  (Bild-PDF, kein Text)")
            continue

        print(f"  🔍 {path.name} …", end=" ", flush=True)
        vocab = ask_claude(path.name, text)

        if not vocab:
            print("keine Vokabeln erkannt")
            continue

        missing = find_missing(vocab, pinyin_idx, chinese_idx)
        found   = [w for w in vocab if w not in missing]
        results.append((path.name, found, missing))
        print(f"{len(vocab)} Vokabeln  ·  {len(missing)} fehlend")

    if results:
        n = print_report(results)
        sys.exit(1 if n else 0)
    else:
        print("\nKeine verarbeitbaren Blätter.")


if __name__ == "__main__":
    main()
