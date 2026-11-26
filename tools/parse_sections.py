"""Parse explanation pages and merge them into the paper JSON files."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from lxml import html

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BASE, BUILD, clean, element_text, fetch, line  # noqa: E402


def text(el) -> str:
    return line(element_text(el)) if el is not None else ""


def class_has(el, value: str) -> bool:
    return value in (el.get("class") or "").split()


def parse_letters(text_value: str) -> dict[str, str]:
    """Parse 'A) foo B) bar' or a <ul> of <li> into {A: foo}."""
    out = {}
    for m in re.finditer(r"([A-H])\)\s*(.*?)(?=\s*[A-H]\)|$)", text_value, re.S):
        out[m.group(1)] = line(m.group(2))
    return out


def answer_letter(value: str) -> str:
    m = re.search(r"\b([A-H])\b", value or "")
    return m.group(1) if m else ""


def parse_reading_unit(unit) -> tuple[int, dict] | None:
    uid = unit.get("id") or ""
    m = re.fullmatch(r"q-(\d+)", uid)
    if not m:
        return None
    n = int(m.group(1))
    stem_zh = text(unit.xpath('.//p[contains(@class,"lqp-stem")]')[0] if unit.xpath('.//p[contains(@class,"lqp-stem")]') else None)
    choices_zh = {}
    ul = unit.xpath('.//ul[contains(@class,"lqp-trans-choices")]')
    if ul:
        choices_zh = parse_letters(element_text(ul[0]))
    ans_el = unit.xpath('.//strong[contains(@class,"rp-ans")]')
    qtype_el = unit.xpath('.//span[contains(@class,"rp-qtype")]')
    answer = answer_letter(text(ans_el[0])) if ans_el else ""
    qtype = re.sub(r"^[（(]|[）)]$", "", text(qtype_el[0])).strip() if qtype_el else ""

    analysis = {"type": "", "parse": "", "locateEn": "", "locateZh": "", "options": {}}
    for row in unit.xpath('.//div[contains(@class,"rp-row")]'):
        tag_el = row.xpath('./span[contains(@class,"rp-tag")]')
        tag = text(tag_el[0]) if tag_el else ""
        tag = tag.strip("【】 ")
        if not tag:
            continue
        if tag == "答案":
            continue
        if tag in ("判型", "拆句", "调序", "主旨", "来源", "指代"):
            body = row.xpath('.//p[contains(@class,"rp-text")]')
            if body:
                analysis["type" if tag == "判型" else "parse"] += text(body[0]) + "\n"
        elif tag == "定位":
            en = row.xpath('.//p[contains(@class,"rp-locate-en")]')
            zh = row.xpath('.//p[contains(@class,"rp-locate-zh")]')
            analysis["locateEn"] = text(en[0]) if en else ""
            analysis["locateZh"] = text(zh[0]) if zh else ""
        elif tag == "选项":
            for li in row.xpath('.//li[contains(@class,"rp-verdict")]'):
                letter = answer_letter(text(li.xpath('./div[contains(@class,"rp-verdict-head")]')[0] if li.xpath('./div[contains(@class,"rp-verdict-head")]') else None))
                if not letter:
                    lm = li.xpath('./span[contains(@class,"rp-verdict-letter")]')
                    letter = answer_letter(text(lm[0])) if lm else ""
                flag = li.xpath('./span[contains(@class,"rp-flag")]')
                note = li.xpath('./p[contains(@class,"rp-verdict-note")]')
                pairs = []
                for pair in li.xpath('.//li[contains(@class,"rp-pair")]'):
                    orig = pair.xpath('./span[contains(@class,"rp-pair-orig")]')
                    opt = pair.xpath('./span[contains(@class,"rp-pair-opt")]')
                    pairs.append({"orig": text(orig[0]) if orig else "", "opt": text(opt[0]) if opt else ""})
                analysis["options"][letter] = {
                    "flag": text(flag[0]) if flag else "",
                    "note": text(note[0]) if note else "",
                    "pairs": pairs,
                }
    analysis["type"] = analysis["type"].strip()
    analysis["parse"] = analysis["parse"].strip()
    return n, {
        "answer": answer,
        "type": qtype,
        "stemZh": stem_zh,
        "choicesZh": choices_zh,
        "analysis": analysis,
    }


def parse_cloze_or_blank_unit(unit) -> tuple[int, dict] | None:
    uid = unit.get("id") or ""
    qm = re.search(r"q-(\d+)", uid)
    no = unit.xpath('.//span[contains(@class,"rp-cloze-no")]')
    if qm:
        n = int(qm.group(1))
    elif no:
        nm = re.search(r"(\d+)", text(no[0]))
        n = int(nm.group(1)) if nm else None
    else:
        n = None
    if n is None:
        return None
    stem = unit.xpath('.//p[contains(@class,"rp-cloze-stem")]')
    ans = unit.xpath('.//strong[contains(@class,"rp-ans")]')
    qtype = unit.xpath('.//span[contains(@class,"rp-qtype")]')
    answer = answer_letter(text(ans[0])) if ans else ""
    reason_parts = []
    for reason in unit.xpath('.//div[contains(@class,"rp-reason")]'):
        t = text(reason)
        if t:
            reason_parts.append(t)
    opts = {}
    for opt in unit.xpath('.//li[contains(@class,"rp-opt")]'):
        letter = answer_letter(text(opt.xpath('./p[contains(@class,"rp-opt-head")]')[0] if opt.xpath('./p[contains(@class,"rp-opt-head")]') else None))
        if not letter:
            lm = opt.xpath('./span[contains(@class,"rp-opt-letter")]')
            letter = answer_letter(text(lm[0])) if lm else ""
        mark = opt.xpath('./span[contains(@class,"rp-opt-mark")]')
        detail = opt.xpath('./p[contains(@class,"rp-opt-detail")]')
        opts[letter] = {
            "mark": text(mark[0]) if mark else "",
            "note": text(detail[0]) if detail else "",
        }
    choice_en = unit.xpath('.//p[contains(@class,"rp-choice-en")]')
    clues = []
    for clue in unit.xpath('.//li[contains(@class,"rp-clue")]'):
        clues.append(text(clue))
    return n, {
        "answer": answer,
        "type": re.sub(r"^[（(]|[）)]$", "", text(qtype[0])).strip() if qtype else "",
        "stemZh": text(stem[0]) if stem else "",
        "reason": "\n".join(dict.fromkeys(reason_parts)),
        "options": opts,
        "choiceEn": text(choice_en[0]) if choice_en else "",
        "clues": clues,
    }


def merge_paper(paper: dict, section_pages: dict[str, str], missing: list[str]) -> dict:
    by_n: dict[int, dict] = {}
    for part in paper["parts"]:
        kind = part["kind"]
        if kind in ("reading", "cloze", "ordering", "matching", "heading"):
            page = section_pages.get(part["id"])
            if not page:
                missing.append(part["id"])
                continue
            tree = html.fromstring(page)
            if kind == "reading":
                for unit in tree.xpath('//*[contains(@class,"lqp-unit")]'):
                    parsed = parse_reading_unit(unit)
                    if parsed:
                        by_n[parsed[0]] = parsed[1]
            elif kind == "cloze":
                for unit in tree.xpath('//*[contains(@class,"rp-unit")]'):
                    parsed = parse_cloze_or_blank_unit(unit)
                    if parsed:
                        by_n[parsed[0]] = parsed[1]
            elif kind in ("matching", "heading"):
                for unit in tree.xpath('//*[contains(@class,"rp-unit")]'):
                    parsed = parse_cloze_or_blank_unit(unit)
                    if parsed:
                        by_n[parsed[0]] = parsed[1]
            elif kind == "ordering":
                order_el = tree.xpath('//*[contains(@class,"rp-order__chain")]')
                if order_el:
                    chain = text(order_el[0])
                    part["orderChain"] = chain
                    tokens = [t.strip() for t in re.split(r"→", chain) if t.strip()]
                    order, fixed = [], {}
                    for token in tokens:
                        fm = re.search(r"预给\s*([A-H])", token)
                        if fm:
                            order.append(fm.group(1))
                            fixed[str(len(order) - 1)] = fm.group(1)
                            continue
                        nm = re.search(r"(\d{1,2})\s*([A-H])", token)
                        if nm:
                            order.append(nm.group(2))
                    if order:
                        part["order"] = order
                        part["fixed"] = fixed
                    for unit in tree.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " rp-seam ")]'):
                        head_el = unit.xpath('./p[contains(@class,"rp-seam-head")]')
                        note_el = unit.xpath('./p[contains(@class,"rp-seam-explain")]')
                        head = text(head_el[0]) if head_el else ""
                        note = text(note_el[0]) if note_el else ""
                        if head and note:
                            part.setdefault("seams", []).append(
                                (head + "：" + note).strip()
                            )

        elif kind == "translation":
            page = section_pages.get(part["id"])
            if not page:
                missing.append(part["id"])
                continue
            tree = html.fromstring(page)
            for unit in tree.xpath('//*[contains(@class,"tqp-unit")]'):
                uid = unit.get("id") or ""
                m = re.search(r"s-(\d+)", uid)
                if not m:
                    continue
                n = int(m.group(1))
                ref = unit.xpath('.//p[contains(@class,"tqp-final")]')
                stem = unit.xpath('.//p[contains(@class,"tqp-stem")]')
                chunks = []
                for li in unit.xpath('.//li[contains(@class,"tqp-chunk")]'):
                    en = li.xpath('./p[contains(@class,"tqp-chunk-line")]/span[contains(@class,"tqp-chunk-en")]')
                    lit = li.xpath('./p[contains(@class,"tqp-chunk-line")]/span[contains(@class,"tqp-chunk-lit")]')
                    role = li.xpath('./p[contains(@class,"tqp-chunk-line")]/span[contains(@class,"tqp-chunk-role")]')
                    diff = li.xpath('./p[contains(@class,"tqp-chunk-diff")]')
                    chunks.append({
                        "en": text(en[0]) if en else "",
                        "lit": text(lit[0]) if lit else "",
                        "role": text(role[0]) if role else "",
                        "note": text(diff[0]) if diff else "",
                    })
                by_n[n] = {
                    "refZh": text(ref[0]) if ref else "",
                    "stem": text(stem[0]) if stem else "",
                    "chunks": chunks,
                }

        elif kind == "writing":
            page = section_pages.get(part["id"])
            if not page:
                missing.append(part["id"])
                continue
            tree = html.fromstring(page)
            essay = tree.xpath('//*[contains(@class,"wp-essay__body")]')
            exam = tree.xpath('//*[contains(@class,"wp-essay__head")]')
            trans = tree.xpath('//*[contains(@class,"wp-trans__para")]')
            breakdown = []
            for item in tree.xpath('//*[contains(@class,"wp-breakdown__item")]'):
                tag = item.xpath('./span[contains(@class,"wp-tag")]')
                core = item.xpath('./span[contains(@class,"wp-breakdown__core")]')
                breakdown.append({
                    "tag": text(tag[0]) if tag else "",
                    "core": text(core[0]) if core else "",
                    "text": text(item),
                })
            wc = re.search(r"(\d+)\s*词", text(exam[0])) if exam else None
            part["model"] = {
                "essay": text(essay[0]) if essay else "",
                "translation": "\n".join(text(x) for x in trans if text(x)),
                "breakdown": breakdown,
                "wordCount": int(wc.group(1)) if wc else None,
            }

    # Attach per-question explanations.
    for part in paper["parts"]:
        for q in part.get("questions", []):
            exp = by_n.get(q["n"])
            if exp:
                q["explanation"] = exp
                if not q.get("answer") and exp.get("answer"):
                    q["answer"] = exp["answer"]
        for s in part.get("sentences", []):
            exp = by_n.get(s["n"])
            if exp:
                s["refZh"] = exp.get("refZh", "")
                s["chunks"] = exp.get("chunks", [])

    # Coverage report.
    exp_count = sum(1 for p in paper["parts"] for q in p.get("questions", []) if q.get("answer"))
    with_exp = sum(1 for p in paper["parts"] for q in p.get("questions", []) if q.get("explanation"))
    paper["coverage"] = {
        "objective": exp_count,
        "explained": with_exp,
        "missingSections": missing,
    }
    return paper


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--paper", help="paper id")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--input", default=str(BUILD / "papers"))
    parser.add_argument("--out", default=str(BUILD / "papers-full"))
    args = parser.parse_args()

    in_dir = Path(args.input)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    ids = [args.paper] if args.paper else [p.stem for p in sorted(in_dir.glob("*.json"))]
    for paper_id in ids:
        src = in_dir / f"{paper_id}.json"
        if not src.exists():
            print("skip missing", src)
            continue
        paper = json.loads(src.read_text(encoding="utf-8"))
        pages = {}
        missing = []
        for part in paper["parts"]:
            if part["kind"] in ("reading", "cloze", "ordering", "matching", "heading", "translation", "writing"):
                url = f"{BASE}/kaoyan/sections/{paper_id}/{part['id']}/"
                try:
                    pages[part["id"]] = fetch(url)
                except Exception as exc:  # noqa: BLE001
                    missing.append(part["id"])
                    print("  missing", part["id"], exc)
        merge_paper(paper, pages, missing)
        (out_dir / f"{paper_id}.json").write_text(
            json.dumps(paper, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        c = paper["coverage"]
        print(f"{paper_id}: explained {c['explained']}/{c['objective']} missing={len(c['missingSections'])}")


if __name__ == "__main__":
    main()
