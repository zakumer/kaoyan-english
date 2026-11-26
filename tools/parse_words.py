"""Build the word index and lazy word-detail data.

Sources:
  /kaoyan/words/stats/syllabus/     931 syllabus high-frequency words
  /kaoyan/words/stats/over-syllabus/ 217 useful words outside the syllabus
  /kaoyan/words/{lemma}/            exam sentences with translations/analysis
  /exam-words/{lemma}/              IPA, senses, dictionary definitions

The crawler is sequential and rate-limited by common.fetch.  Each word is
cached under tools/build/words/{slug}.json, so an interrupted run resumes
without refetching completed words.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    BASE,
    BUILD,
    DATA,
    clean,
    ensure_dirs,
    fetch,
    js_dumps,
    line,
    write_data_js,
    write_js,
)
from lxml import html  # noqa: E402

WORD_CACHE = BUILD / "words"
LIST_URLS = {
    "syllabus": "/kaoyan/words/stats/syllabus/",
    "over": "/kaoyan/words/stats/over-syllabus/",
}
CEFR_RE = re.compile(r"^(A1|A2|B1|B2|C1|C2)$")


def text(el) -> str:
    return line(el.text_content()) if el is not None else ""


def parse_list(path: str, list_name: str) -> list[dict]:
    tree = html.fromstring(fetch(path))
    rows = tree.xpath('//li[contains(@class,"freqrow")]')
    out = []
    for row in rows:
        rank = text(row.xpath('.//*[contains(@class,"freqrow__rank")]')[0]) if row.xpath('.//*[contains(@class,"freqrow__rank")]') else ""
        link = row.xpath('.//a[contains(@class,"freqrow__link")]')
        if not link:
            continue
        a = link[0]
        word = text(a)
        href = a.get("href", "")
        slug = href.rstrip("/").rsplit("/", 1)[-1] if href else word
        cefr = text(row.xpath('.//*[contains(@class,"cefr")]')[0]) if row.xpath('.//*[contains(@class,"cefr")]') else ""
        gloss = text(row.xpath('.//*[contains(@class,"freqrow__def")]')[0]) if row.xpath('.//*[contains(@class,"freqrow__def")]') else ""
        freq = text(row.xpath('.//*[contains(@class,"freqrow__c")]')[0]) if row.xpath('.//*[contains(@class,"freqrow__c")]') else ""
        out.append({
            "word": word,
            "slug": slug,
            "href": href,
            "rank": int(rank) if rank.isdigit() else None,
            "list": list_name,
            "cefr": cefr if CEFR_RE.match(cefr) else "",
            "gloss": gloss,
            "freq": int(freq) if freq.isdigit() else 0,
        })
    return out


def merge_lists(groups: dict[str, list[dict]]) -> list[dict]:
    by_word: dict[str, dict] = {}
    for list_name in ("syllabus", "over"):
        for item in groups.get(list_name, []):
            key = item["word"].lower()
            if not key:
                continue
            if key not in by_word:
                by_word[key] = {
                    "word": item["word"],
                    "slug": item["slug"],
                    "href": item["href"],
                    "cefr": item["cefr"],
                    "gloss": item["gloss"],
                    "freq": item["freq"],
                    "lists": [list_name],
                    "rank": item["rank"] if list_name == "syllabus" else None,
                    "overRank": item["rank"] if list_name == "over" else None,
                }
            else:
                cur = by_word[key]
                if list_name not in cur["lists"]:
                    cur["lists"].append(list_name)
                if list_name == "syllabus":
                    cur["rank"] = item["rank"]
                    cur["cefr"] = item["cefr"] or cur["cefr"]
                    cur["gloss"] = item["gloss"] or cur["gloss"]
                    cur["freq"] = item["freq"] or cur["freq"]
                else:
                    cur["overRank"] = item["rank"]
                    cur["freq"] = cur["freq"] or item["freq"]
    return sorted(by_word.values(), key=lambda w: (w["rank"] is None, w["rank"] or 9999, w["overRank"] or 9999, w["word"].lower()))


def parse_examples(tree, word: str) -> list[dict]:
    cards = tree.xpath('//li[contains(@class,"sentence-card")]')
    examples = []
    seen = set()
    for card in cards:
        card_id = card.get("id", "")
        if card_id and card_id in seen:
            continue
        seen.add(card_id)
        def one(cls: str) -> str:
            els = card.xpath(f'.//*[contains(@class,"{cls}")]')
            return text(els[0]) if els else ""
        body = card.xpath('.//*[contains(@class,"sentence-card__text")]')
        if not body:
            continue
        # Remove <mark> wrappers but keep their text.
        for mark in body[0].xpath(".//mark"):
            mark.drop_tag()
        en = text(body[0])
        if not en:
            continue
        links = {}
        for a in card.xpath('.//a[contains(@class,"sentence-card__link")]'):
            label = text(a)
            href = a.get("href", "")
            if "整卷" in label:
                links["paper"] = href
            elif "本题" in label:
                links["section"] = href
            elif "本句" in label:
                links["sentence"] = href
        examples.append({
            "id": card_id.replace("sent-", "")[:8],
            "year": one("sentence-card__year"),
            "exam": one("sentence-card__exam"),
            "badge": one("sentence-card__badge"),
            "module": one("sentence-card__module"),
            "position": one("sentence-card__position"),
            "cefr": one("sentence-card__cefr").replace("CEFR", "").strip(),
            "text": en,
            "translation": one("sentence-card__translation"),
            "analysis": one("sentence-card__analysis-text"),
            "links": links,
        })
    return examples


def parse_dict(tree) -> dict:
    ipa_el = tree.xpath('.//*[contains(@class,"word-hero__ipa")]')
    ipa = text(ipa_el[0]) if ipa_el else ""
    senses = []
    for card in tree.xpath('//section[@id="definitions"]//li[contains(@class,"def-card")]'):
        def one(cls: str) -> str:
            els = card.xpath(f'.//*[contains(@class,"{cls}")]')
            return text(els[0]) if els else ""
        senses.append({
            "zh": one("def-card__zh"),
            "pos": one("def-card__pos"),
            "cefr": one("def-card__cefr"),
            "pct": one("def-card__per"),
            "en": one("def-card__en"),
            "note": one("def-card__anal"),
        })
    return {"ipa": ipa, "senses": senses}


def parse_word_page(tree, word: str) -> dict:
    lemma_el = tree.xpath('//h1[contains(@class,"word-hero__lemma")]')
    lemma = text(lemma_el[0]) if lemma_el else word
    lemma = lemma.split(" · ")[0].strip() or word
    pos_el = tree.xpath('.//*[contains(@class,"word-hero__pos")]')
    gloss_el = tree.xpath('.//*[contains(@class,"word-hero__gloss")]')
    return {
        "lemma": lemma,
        "pos": text(pos_el[0]) if pos_el else "",
        "gloss": text(gloss_el[0]) if gloss_el else "",
        "examples": parse_examples(tree, word),
    }


def scrape_one(item: dict, use_dict: bool = True, refresh: bool = False) -> dict:
    word = item["word"]
    slug = item["slug"]
    cache_file = WORD_CACHE / f"{slug}.json"
    if cache_file.exists() and not refresh:
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    record = dict(item)
    record["sourceUrl"] = BASE + item["href"]
    try:
        page = html.fromstring(fetch(item["href"], refresh=refresh))
        parsed = parse_word_page(page, word)
    except Exception as exc:  # noqa: BLE001
        print(f"  ! word page failed {word}: {exc}")
        parsed = {"lemma": word, "pos": "", "gloss": "", "examples": []}

    record.update({
        "lemma": parsed["lemma"],
        "pos": parsed["pos"] or "",
        "gloss": parsed["gloss"] or record.get("gloss", ""),
        "examples": parsed["examples"],
    })

    if use_dict:
        try:
            dpage = html.fromstring(fetch(f"/exam-words/{slug}/", refresh=refresh))
            record.update(parse_dict(dpage))
        except Exception as exc:  # noqa: BLE001
            print(f"  ! dict page failed {word}: {exc}")
            record.setdefault("ipa", "")
            record.setdefault("senses", [])
    else:
        record.setdefault("ipa", "")
        record.setdefault("senses", [])

    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    return record


def english_one_examples(rec: dict) -> list[dict]:
    """Keep the study corpus focused on English One; old papers stay included."""
    out = []
    for ex in rec.get("examples", []):
        badge = ex.get("badge") or ""
        paper = (ex.get("links") or {}).get("paper") or ""
        if "英语二" in badge or "english-two" in paper:
            continue
        out.append(ex)
    return out


def build_outputs(records: list[dict]) -> None:
    ensure_dirs()
    index = {}
    details = {}
    for rec in records:
        word = rec["word"]
        examples = english_one_examples(rec)
        index[word] = {
            "word": word,
            "lemma": rec.get("lemma", word),
            "slug": rec["slug"],
            "rank": rec.get("rank"),
            "overRank": rec.get("overRank"),
            "cefr": rec.get("cefr", ""),
            "pos": rec.get("pos", ""),
            "gloss": rec.get("gloss", ""),
            "freq": rec.get("freq", 0),
            "lists": rec.get("lists", []),
            "ipa": rec.get("ipa", ""),
            "exampleCount": len(examples),
            "sourceUrl": rec.get("sourceUrl", ""),
        }
        details[word] = {
            "examples": examples,
            "senses": rec.get("senses", []),
        }

    meta = {
        "total": len(records),
        "syllabus": sum(1 for r in records if "syllabus" in r.get("lists", [])),
        "over": sum(1 for r in records if "over" in r.get("lists", [])),
        "withExamples": sum(1 for r in records if english_one_examples(r)),
        "withIpa": sum(1 for r in records if r.get("ipa")),
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    keywords = sorted(index.keys(), key=lambda w: (index[w]["rank"] is None, index[w]["rank"] or 9999, index[w]["overRank"] or 9999, w))
    write_data_js("words-index.js", "EXAM_DATA.words", index)
    write_data_js("word-details.js", "EXAM_DATA.wordDetails", details)
    write_data_js("word-meta.js", "EXAM_DATA.wordMeta", meta)
    # A tiny manifest makes the app's search order stable without sorting 1k keys.
    write_js(DATA / "word-order.js", "EXAM_DATA.wordOrder = " + js_dumps(keywords) + ";")
    print(f"wrote {len(index)} words; examples={meta['withExamples']} ipa={meta['withIpa']}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-dict", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--list-only", action="store_true")
    args = ap.parse_args()

    ensure_dirs()
    WORD_CACHE.mkdir(parents=True, exist_ok=True)
    groups = {name: parse_list(path, name) for name, path in LIST_URLS.items()}
    print("lists:", {k: len(v) for k, v in groups.items()})
    merged = merge_lists(groups)
    print("merged unique:", len(merged))
    if args.list_only:
        return 0
    if args.limit:
        merged = merged[: args.limit]
        print("limited to", len(merged))

    records = []
    for i, item in enumerate(merged, 1):
        rec = scrape_one(item, use_dict=not args.no_dict, refresh=args.refresh)
        records.append(rec)
        if i % 25 == 0 or i == len(merged):
            print(f"[{i}/{len(merged)}] {item['word']} examples={len(rec.get('examples', []))} ipa={bool(rec.get('ipa'))}", flush=True)

    if not args.no_write:
        build_outputs(records)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
