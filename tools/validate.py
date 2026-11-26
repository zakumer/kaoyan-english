"""Validate the generated study data and local app references.

Run after:
  python tools/parse_words.py
  python tools/build_data.py --download-images

Exits non-zero when a hard requirement fails; warnings are printed for
content that is useful but not guaranteed (for example old-paper explanations).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BUILD = ROOT / "tools" / "build"
PAPERS = BUILD / "papers-full"
WORDS = BUILD / "words"

errors: list[str] = []
warnings: list[str] = []


def err(message: str) -> None:
    errors.append(message)


def warn(message: str) -> None:
    warnings.append(message)


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        err(f"cannot read {path.relative_to(ROOT)}: {exc}")
        return {}


def check_papers() -> dict:
    files = sorted(PAPERS.glob("*.json"))
    if len(files) != 29:
        err(f"expected 29 paper JSON files, found {len(files)}")
    total = 0
    explained = 0
    objective = 0
    ids: set[str] = set()
    for path in files:
        paper = load_json(path)
        pid = paper.get("id", path.stem)
        if pid in ids:
            err(f"duplicate paper id: {pid}")
        ids.add(pid)
        qs = []
        for part in paper.get("parts", []):
            if part.get("kind") in {"cloze", "reading", "ordering", "matching", "heading"}:
                qs.extend(part.get("questions", []))
        total += len(qs)
        objective += len(qs)
        if paper.get("questionCount") not in (None, len(qs)):
            warn(f"{pid}: questionCount={paper.get('questionCount')} but parsed {len(qs)}")
        if paper.get("objectiveCount") not in (None, len(qs)):
            warn(f"{pid}: objectiveCount={paper.get('objectiveCount')} but parsed {len(qs)}")
        seen = set()
        for q in qs:
            n = q.get("n")
            if not isinstance(n, int):
                err(f"{pid}: question without integer n")
                continue
            if n in seen:
                err(f"{pid}: duplicate question {n}")
            seen.add(n)
            ans = q.get("answer")
            if not (isinstance(ans, str) and re.fullmatch(r"[A-H]", ans)):
                err(f"{pid}: question {n} has invalid answer {ans!r}")
            if q.get("explanation"):
                explained += 1
        if paper.get("coverage", {}).get("missingSections"):
            warn(f"{pid}: missing section pages: {paper['coverage']['missingSections']}")
    expected = 1240
    if objective != expected:
        err(f"expected {expected} objective questions, parsed {objective}")
    return {"papers": len(files), "questions": objective, "explained": explained}


def check_words() -> dict:
    files = sorted(WORDS.glob("*.json"))
    if len(files) != 1148:
        err(f"expected 1148 cached words, found {len(files)}")
    total = 0
    with_ipa = 0
    with_examples = 0
    with_senses = 0
    missing_gloss = 0
    words: set[str] = set()
    for path in files:
        rec = load_json(path)
        w = rec.get("word")
        if not w:
            err(f"{path.name}: missing word")
            continue
        key = w.lower()
        if key in words:
            err(f"duplicate word: {w}")
        words.add(key)
        total += 1
        if rec.get("ipa"):
            with_ipa += 1
        if rec.get("examples"):
            with_examples += 1
        if rec.get("senses"):
            with_senses += 1
        if not rec.get("gloss"):
            missing_gloss += 1
    if missing_gloss:
        warn(f"{missing_gloss} words have no short gloss")
    return {
        "words": total,
        "ipa": with_ipa,
        "examples": with_examples,
        "senses": with_senses,
        "missingGloss": missing_gloss,
    }


def check_data_files() -> None:
    required = [
        DATA / "meta.js",
        DATA / "words-index.js",
        DATA / "word-order.js",
        DATA / "word-meta.js",
        DATA / "word-details.js",
    ]
    for path in required:
        if not path.exists():
            err(f"missing generated data: {path.relative_to(ROOT)}")
        elif path.stat().st_size < 10:
            err(f"generated data is empty: {path.relative_to(ROOT)}")
    for path in (DATA / "papers").glob("*.js"):
        if path.stat().st_size < 100:
            err(f"paper data is empty: {path.relative_to(ROOT)}")
    if len(list((DATA / "papers").glob("*.js"))) != 29:
        err("expected 29 data/papers/*.js files")


def check_references() -> None:
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    for ref in re.findall(r'(?:src|href)="([^"]+)"', index):
        if ref.startswith(("http://", "https://", "#", "mailto:")):
            continue
        path = (ROOT / ref.split("?", 1)[0]).resolve()
        if not path.exists():
            err(f"index.html references missing file: {ref}")
    scripts = [
        "js/util.js", "js/store.js", "js/srs.js", "js/data.js", "js/ui.js",
        "js/app.js",
    ]
    for rel in scripts:
        if not (ROOT / rel).exists():
            err(f"missing app script: {rel}")
    for view in ("dashboard", "vocab", "papers", "exam", "review", "reading", "mistakes", "stats", "settings"):
        if not (ROOT / "js" / "views" / f"{view}.js").exists():
            err(f"missing view: {view}.js")


def check_images() -> None:
    for path in sorted(PAPERS.glob("*.json")):
        paper = load_json(path)
        for part in paper.get("parts", []):
            image = part.get("image")
            if not isinstance(image, dict):
                continue
            local = image.get("local")
            if local and not (ROOT / local).exists():
                err(f"{paper.get('id')}/{part.get('id')}: missing writing image {local}")
            if not image.get("local"):
                warn(f"{paper.get('id')}/{part.get('id')}: writing image not downloaded")


def main() -> int:
    papers = check_papers()
    words = check_words()
    check_data_files()
    check_references()
    check_images()
    print("papers:", papers)
    print("words:", words)
    print("warnings:", len(warnings))
    for m in warnings[:20]:
        print("  warn:", m)
    print("errors:", len(errors))
    for m in errors[:50]:
        print("  error:", m)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
