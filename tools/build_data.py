"""Turn the parsed paper JSON into browser data files.

Outputs:
  data/meta.js             paper index + build metadata
  data/papers/{id}.js      one lazy-loaded paper per file
  assets/writing/*.jpg     writing figures (optional, --download-images)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    ASSETS,
    BUILD,
    DATA,
    ROOT,
    ensure_dirs,
    fetch_bytes,
    js_dumps,
    write_js,
)

PAPERS = BUILD / "papers-full"


def image_extension(url: str) -> str:
    suffix = Path(url.split("?", 1)[0]).suffix.lower()
    return suffix if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"} else ".jpg"


def download_image(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        raw = fetch_bytes(url)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  ! image failed {url}: {exc}")
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download-images", action="store_true")
    args = ap.parse_args()
    ensure_dirs()

    files = sorted(PAPERS.glob("*.json"))
    if len(files) != 29:
        print(f"expected 29 papers, found {len(files)}", file=sys.stderr)
        return 1

    papers = []
    for path in files:
        paper = json.loads(path.read_text(encoding="utf-8"))
        if args.download_images:
            for part in paper.get("parts", []):
                image = part.get("image")
                if not isinstance(image, dict) or not image.get("src"):
                    continue
                src = image["src"]
                if src.startswith("/"):
                    src = "https://english-exam.lazynote.cn" + src
                dest = ASSETS / "writing" / f"{paper['id']}-{part['id']}{image_extension(src)}"
                if download_image(src, dest):
                    image["local"] = str(dest.relative_to(ROOT)).replace("\\", "/")
                    image["src"] = image["local"]
            path.write_text(json.dumps(paper, ensure_ascii=False, indent=1), encoding="utf-8")
        papers.append(paper)

    papers.sort(key=lambda p: p["year"], reverse=True)
    for paper in papers:
        expr = f'EXAM_DATA.papers[{json.dumps(paper["id"])}]'
        write_js(DATA / "papers" / f'{paper["id"]}.js', f"{expr} = {js_dumps(paper)};")

    index = []
    for paper in papers:
        index.append({
            "id": paper["id"],
            "year": paper["year"],
            "label": paper["label"],
            "era": paper["era"],
            "sourceUrl": paper["sourceUrl"],
            "timeLimitMin": paper.get("timeLimitMin", 180),
            "questionCount": paper.get("questionCount", 0),
            "objectiveCount": paper.get("objectiveCount", 0),
            "partCount": len(paper.get("parts", [])),
            "scoreMode": paper.get("scoreMode", "raw"),
            "coverage": paper.get("coverage", {}),
            "partKinds": sorted({p.get("kind", "") for p in paper.get("parts", [])}),
        })

    meta = {
        "version": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "source": "https://english-exam.lazynote.cn/",
        "sourceLabel": "懒笔记 · 考研英语真题",
        "examDate": "2026-12-19",
        "papers": index,
        "counts": {
            "papers": len(index),
            "modern": sum(1 for p in index if p["era"] == "modern"),
            "old": sum(1 for p in index if p["era"] == "old"),
            "questions": sum(p["objectiveCount"] for p in index),
        },
    }
    write_js(DATA / "meta.js", "EXAM_DATA.meta = " + js_dumps(meta) + ";\nEXAM_DATA.papers = {};")
    print(f"wrote {len(index)} paper files; questions={meta['counts']['questions']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
