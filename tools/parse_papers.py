"""Parse one whole-paper HTML page into the app's paper schema.

Usage:
    python tools/parse_papers.py --fixture 2026-english-one
    python tools/parse_papers.py --all
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from lxml import html

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BASE, BUILD, FIXTURES, clean, element_text, fetch, line  # noqa: E402


def owned_by(el, module_id: str) -> bool:
    for ancestor in el.iterancestors():
        aid = ancestor.get("id") or ""
        if aid.startswith("mod-section"):
            return aid == module_id
    return False


def nodes_owned(tree, module_id: str, xpath: str):
    return [el for el in tree.xpath(xpath) if owned_by(el, module_id)]


def first_owned(tree, module_id: str, xpath: str):
    nodes = nodes_owned(tree, module_id, xpath)
    return nodes[0] if nodes else None


def module_directions(tree, module_id: str) -> str:
    suffix = module_id.replace("mod-", "", 1)
    candidates = [f"directions-{suffix}"]
    # Reading Text 2/3/4 share the Part A directions.
    if re.match(r"section2-part-a-\d+$", suffix):
        candidates.append("directions-section2-part-a")
    if suffix == "section3":
        candidates.append("directions-section3")
    for candidate in candidates:
        el = tree.xpath(f'//*[@id="{candidate}"]')
        if el:
            return element_text(el[0])
    return ""


def answer_map(tree) -> tuple[dict[int, str], dict[str, str]]:
    """Return {question number: letter} and the raw table texts."""
    answers: dict[int, str] = {}
    raw: dict[str, str] = {}
    for row in tree.xpath('//tr[starts-with(@id,"ans-")]'):
        rid = row.get("id") or ""
        text = element_text(row)
        raw[rid] = text
        # Matches "1 A Still", "21 C", "41=B", "预给 F → 41 B".
        for match in re.finditer(r"(?<!\d)(\d{1,2})\s*[=:：]?\s*([A-H])(?![A-Za-z])", text):
            n = int(match.group(1))
            letter = match.group(2)
            if 1 <= n <= 60:
                answers[n] = letter
    return answers, raw


def parse_question(qel, answers: dict[int, str]) -> dict | None:
    qid = qel.get("id") or ""
    m = re.fullmatch(r"qp-(\d+)", qid)
    if not m:
        return None
    n = int(m.group(1))
    stem_el = qel.xpath('.//*[@data-pdh-stem]')
    stem = line(element_text(stem_el[0])) if stem_el else ""
    options = []
    for opt in qel.xpath('.//span[@data-pdh-letter]'):
        key = (opt.get("data-pdh-letter") or "").strip().upper()
        text = line(element_text(opt))
        if key and text:
            options.append({"key": key, "text": text})
    if not options:
        # Some older layouts use plain A-D text inside the question.
        text = element_text(qel)
        for key, val in re.findall(r"\[\s*([A-D])\s*\]\s*([^[]+?)(?=\s*\[\s*[A-D]\s*\]|$)", text):
            options.append({"key": key.upper(), "text": line(val)})
    if not options:
        return None
    return {
        "n": n,
        "stem": stem,
        "options": options,
        "answer": answers.get(n),
    }


def replace_blanks(paragraph, keep_label: bool = False) -> str:
    """Turn <u>n</u> cloze blanks into {{n}} before extracting text."""
    for u in paragraph.xpath(".//u"):
        raw = element_text(u)
        m = re.search(r"\d{1,2}", raw)
        if m:
            u.text = "{{" + m.group(0) + "}}"
            for child in list(u):
                u.remove(child)
    return line(element_text(paragraph))


def parse_cloze(tree, module_id: str, answers: dict[int, str]) -> dict:
    paragraphs = []
    for p in nodes_owned(tree, module_id, './/div[starts-with(@id,"p-section1-")]'):
        text = replace_blanks(p)
        if text:
            paragraphs.append({"id": p.get("id"), "text": text})
    questions = []
    for q in nodes_owned(tree, module_id, './/div[starts-with(@id,"qp-")]'):
        parsed = parse_question(q, answers)
        if parsed:
            questions.append(parsed)
    return {
        "id": "section1",
        "kind": "cloze",
        "title": "Section I 完形填空",
        "directions": module_directions(tree, module_id),
        "points": 10,
        "passage": {"paragraphs": paragraphs},
        "questions": sorted(questions, key=lambda x: x["n"]),
    }


def parse_reading(tree, module_id: str, answers: dict[int, str]) -> dict | None:
    suffix = module_id.replace("mod-section2-part-a", "").strip("-")
    text_no = int(suffix) if suffix.isdigit() else 1
    paragraphs = []
    for p in nodes_owned(tree, module_id, './/div[starts-with(@id,"p-section2-part-a-")]'):
        text = line(element_text(p))
        if text:
            paragraphs.append({"id": p.get("id"), "text": text})
    questions = []
    for q in nodes_owned(tree, module_id, './/div[starts-with(@id,"qp-")]'):
        parsed = parse_question(q, answers)
        if parsed:
            questions.append(parsed)
    if not paragraphs and not questions:
        return None
    return {
        "id": module_id.replace("mod-", ""),
        "kind": "reading",
        "title": f"Text {text_no}",
        "textNo": text_no,
        "directions": module_directions(tree, module_id),
        "points": 10,
        "passage": {"title": f"Text {text_no}", "paragraphs": paragraphs},
        "questions": sorted(questions, key=lambda x: x["n"]),
    }


def parse_choices(tree, module_id: str) -> list[dict]:
    out = []
    for choice in nodes_owned(tree, module_id, './/*[starts-with(@id,"choice-section2-part-b-")]'):
        key = (choice.get("id") or "").rsplit("-", 1)[-1].upper()
        text = line(element_text(choice))
        text = re.sub(r"^\s*\[\s*[A-H]\s*\]\s*", "", text)
        if key and text:
            out.append({"key": key, "text": text})
    return out


def parse_part_b(tree, module_id: str, answers: dict[int, str], raw_answers: dict[str, str]) -> dict:
    choices = parse_choices(tree, module_id)
    paragraphs = []
    for p in nodes_owned(tree, module_id, './/div[starts-with(@id,"p-section2-part-b-")]'):
        text = line(element_text(p))
        label = ""
        m = re.match(r"^\s*\[\s*([A-H])\s*\]\s*", text)
        if m:
            label = m.group(1)
            text = text[m.end():].strip()
        if text:
            paragraphs.append({"id": p.get("id"), "label": label, "text": text})

    qp_chain = first_owned(tree, module_id, './/*[@id="qp-chain"]')
    chain_text = element_text(qp_chain) if qp_chain is not None else ""
    ans_text = " ".join(raw_answers.values())
    ordering = bool(choices) is False and ("顺序" in ans_text or "→" in chain_text or "wrong order" in module_directions(tree, module_id).lower())

    if ordering:
        kind = "ordering"
    elif "subheading" in module_directions(tree, module_id).lower():
        kind = "heading"
    else:
        kind = "matching"

    if kind == "ordering":
        # Paragraph labels are the A-H options; the chain contains the fixed slots.
        tokens = [t.strip() for t in re.split(r"→", ans_text) if t.strip()]
        order = []
        fixed: dict[int, str] = {}
        for token in tokens:
            fm = re.search(r"预给\s*([A-H])", token)
            if fm:
                order.append(fm.group(1))
                fixed[len(order) - 1] = fm.group(1)
                continue
            nm = re.search(r"(\d{1,2})\s*[=:]?\s*([A-H])", token)
            if nm:
                order.append(nm.group(2))
        # Fallback: parse the paper's blank chain, which has no letters.
        if not order:
            for q in nodes_owned(tree, module_id, './/div[starts-with(@id,"qp-")]'):
                parsed = parse_question(q, answers)
                if parsed:
                    order.append(parsed.get("answer") or "?")
        questions = []
        for q in nodes_owned(tree, module_id, './/div[starts-with(@id,"qp-")]'):
            parsed = parse_question(q, answers)
            if parsed:
                questions.append(parsed)
        for n, letter in answers.items():
            if 41 <= n <= 45 and not any(q["n"] == n for q in questions):
                questions.append({"n": n, "stem": "", "options": [], "answer": letter})
        return {
            "id": "section2-part-b",
            "kind": "ordering",
            "title": "Section II Part B 段落排序",
            "directions": module_directions(tree, module_id),
            "points": 10,
            "paragraphs": paragraphs,
            "choices": [{"key": p["label"], "text": p["text"]} for p in paragraphs if p["label"]],
            "questions": sorted(questions, key=lambda x: x["n"]),
            "order": order,
            "fixed": {str(k): v for k, v in fixed.items()},
            "chain": chain_text,
        }

    # Matching / heading: replace (41) and the placeholder sentence with {{41}}.
    for p in paragraphs:
        p["text"] = re.sub(
            r"\((\d{1,2})\)\s*(?:占位符这是等待完型填空的句子位置)?", r"{{\1}}", p["text"]
        )
        p["text"] = p["text"].replace("占位符这是等待完型填空的句子位置", "")
    questions = []
    for n in range(41, 46):
        questions.append({"n": n, "stem": "", "options": choices, "answer": answers.get(n)})
    return {
        "id": "section2-part-b",
        "kind": kind,
        "title": "Section II Part B 选句填空" if kind == "matching" else "Section II Part B 小标题匹配",
        "directions": module_directions(tree, module_id),
        "points": 10,
        "passage": {"paragraphs": paragraphs},
        "choices": choices,
        "questions": questions,
    }


def parse_translation(tree, module_id: str) -> dict:
    paragraphs = []
    sentences = []
    for p in nodes_owned(tree, module_id, './/div[starts-with(@id,"p-section2-part-c-") or starts-with(@id,"p-section2-part-b-")]'):
        text = line(element_text(p))
        if text:
            paragraphs.append({"id": p.get("id"), "text": text})
        # Each underlined sentence is wrapped in span.relative with a preceding (46) marker.
        for rel in p.xpath('.//span[contains(@class,"relative")]'):
            u = rel.xpath(".//u")
            if not u:
                continue
            sentence = line(element_text(u[0]))
            marker = line(element_text(rel))
            m = re.search(r"\((\d{1,2})\)", marker)
            n = int(m.group(1)) if m else None
            if sentence:
                sentences.append({"n": n, "en": sentence, "refZh": "", "analysis": ""})
    # Fallback: paragraphs with (46) markers but no <u>.
    if not sentences:
        for p in paragraphs:
            text = p["text"]
            for m in re.finditer(r"\((\d{1,2})\)\s*(.+?)(?=\(\d{1,2}\)|$)", text):
                sentences.append({"n": int(m.group(1)), "en": line(m.group(2)), "refZh": "", "analysis": ""})
    sentences.sort(key=lambda x: (x["n"] is None, x["n"] or 0))
    return {
        "id": module_id.replace("mod-", ""),
        "kind": "translation",
        "title": "Section II Part C 英译汉",
        "directions": module_directions(tree, module_id),
        "points": 10,
        "passage": {"paragraphs": paragraphs},
        "sentences": sentences,
    }


def parse_writing(tree, module_id: str) -> dict | None:
    directions_el = first_owned(tree, module_id, './/*[starts-with(@id,"directions-section3")]')
    if directions_el is None:
        return None
    prompt = element_text(directions_el)
    points = 10
    pm = re.search(r"\((\d{1,2})\s*points?\)", prompt, re.I)
    if pm:
        points = int(pm.group(1))
    imgs = nodes_owned(tree, module_id, ".//img")
    image = None
    if imgs:
        image = {
            "src": imgs[0].get("src"),
            "alt": imgs[0].get("alt") or "",
            "width": imgs[0].get("width"),
            "height": imgs[0].get("height"),
        }
    part = "b" if module_id.endswith("part-b") else ("a" if module_id.endswith("part-a") else "")
    title = f"Section III Part {part.upper()} 写作" if part else "Section III 写作"
    return {
        "id": module_id.replace("mod-", ""),
        "kind": "writing",
        "title": title,
        "directions": prompt,
        "prompt": prompt,
        "points": points,
        "image": image,
        "model": {"essay": "", "translation": "", "breakdown": []},
    }


def parse_paper(paper_id: str, html_text: str) -> dict:
    tree = html.fromstring(html_text)
    answers, raw_answers = answer_map(tree)
    modules = []
    seen = set()
    for el in tree.xpath('//*[starts-with(@id,"mod-section")]'):
        mid = el.get("id") or ""
        if mid in seen:
            continue
        seen.add(mid)
        modules.append(mid)

    parts = []
    for mid in modules:
        if mid == "mod-section1":
            parts.append(parse_cloze(tree, mid, answers))
        elif mid.startswith("mod-section2-part-a"):
            parsed = parse_reading(tree, mid, answers)
            if parsed:
                parts.append(parsed)
        elif mid == "mod-section2-part-b":
            parsed = parse_part_b(tree, mid, answers, raw_answers)
            # Old papers use Part B for translation.
            directions = module_directions(tree, mid).lower()
            if "translate" in directions or "translation" in directions:
                parts.append(parse_translation(tree, mid))
            else:
                parts.append(parsed)
        elif mid == "mod-section2-part-c":
            parts.append(parse_translation(tree, mid))
        elif mid.startswith("mod-section3"):
            parsed = parse_writing(tree, mid)
            if parsed:
                parts.append(parsed)

    parts.sort(key=lambda p: (p["kind"] not in ("cloze", "reading", "ordering", "matching", "heading", "translation", "writing"), p.get("textNo", 0), p["id"]))
    # Reading parts need natural Text order, not string order.
    reading = sorted([p for p in parts if p["kind"] == "reading"], key=lambda p: p.get("textNo", 0))
    others = [p for p in parts if p["kind"] != "reading"]
    ordered = []
    inserted = False
    for p in others:
        if not inserted and p["kind"] == "ordering" or (not inserted and p["kind"] in ("matching", "heading")):
            ordered.extend(reading)
            inserted = True
        ordered.append(p)
    if not inserted:
        ordered.extend(reading)
    # Keep writing last and translation after reading.
    ordered.sort(key=lambda p: (
        0 if p["kind"] in ("cloze", "reading") else 1 if p["kind"] in ("ordering", "matching", "heading") else 2 if p["kind"] == "translation" else 3,
        p.get("textNo", 0),
    ))

    all_q = [q for p in ordered for q in p.get("questions", [])]
    objective = [q for q in all_q if q.get("options") or p.get("kind") in ("ordering", "matching", "heading")]
    year_match = re.search(r"(\d{4})", paper_id)
    year = int(year_match.group(1)) if year_match else 0
    return {
        "id": paper_id,
        "year": year,
        "label": f"{year} 英语一" if year >= 2010 else f"{year} 旧卷",
        "era": "modern" if year >= 2010 else "old",
        "sourceUrl": f"{BASE}/kaoyan/paper/{paper_id}/",
        "timeLimitMin": 180,
        "scoreMode": "estimated" if year >= 2010 else "raw",
        "parts": ordered,
        "questionCount": len(all_q),
        "objectiveCount": sum(1 for q in all_q if q.get("answer")),
        "answerTable": raw_answers,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", help="paper id to read from tools/fixtures/paper-{id}.html")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--out", default=str(BUILD / "papers"))
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    ids = []
    if args.fixture:
        ids = [args.fixture]
    elif args.all:
        # The paper index is generated separately; this is a reminder.
        ids = [p.stem.replace("paper-", "") for p in FIXTURES.glob("paper-*.html")]
    if not ids:
        raise SystemExit("pass --fixture ID or --all")

    for paper_id in ids:
        fixture = FIXTURES / f"paper-{paper_id}.html"
        text = fixture.read_text(encoding="utf-8") if fixture.exists() else fetch(f"/kaoyan/paper/{paper_id}/")
        data = parse_paper(paper_id, text)
        path = out_dir / f"{paper_id}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{paper_id}: parts={len(data['parts'])} q={data['questionCount']} answers={data['objectiveCount']} -> {path}")


if __name__ == "__main__":
    main()
