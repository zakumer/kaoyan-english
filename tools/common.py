"""Shared utilities for the kaoyan English data build.

Only uses the Python standard library plus lxml, which is available in the
bundled runtime.  Network access is deliberately small and polite.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
CACHE = TOOLS / ".cache"
BUILD = TOOLS / "build"
FIXTURES = TOOLS / "fixtures"
DATA = ROOT / "data"
ASSETS = ROOT / "assets"

BASE = "https://english-exam.lazynote.cn"
HOST = "english-exam.lazynote.cn"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KaoyanEnglishStudy/1.0 (personal study)"
DELAY = float(os.environ.get("KAOYAN_DELAY", "0.35"))
TIMEOUT = 30
RETRIES = 3

_CACHE_INDEX = CACHE / "index.json"
_last_request = 0.0
_cache = None


def ensure_dirs() -> None:
    for path in (CACHE, BUILD, FIXTURES, DATA / "papers", DATA / "word-details",
                 ASSETS / "writing"):
        path.mkdir(parents=True, exist_ok=True)


def _load_cache() -> dict:
    global _cache
    if _cache is None:
        if _CACHE_INDEX.exists():
            try:
                _cache = json.loads(_CACHE_INDEX.read_text(encoding="utf-8"))
            except Exception:
                _cache = {}
        else:
            _cache = {}
    return _cache


def _save_cache() -> None:
    _CACHE_INDEX.parent.mkdir(parents=True, exist_ok=True)
    _CACHE_INDEX.write_text(
        json.dumps(_load_cache(), ensure_ascii=False, indent=1), encoding="utf-8"
    )


def cache_key(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def fetch(url: str, refresh: bool = False, use_cache: bool = True) -> str:
    """Fetch a URL as UTF-8 text, caching successful responses on disk.

    The site is a static Astro site and returns normal HTML.  A cache hit means
    builds can be repeated without touching the network.
    """
    global _last_request
    ensure_dirs()
    if not url.startswith("http"):
        url = BASE + url

    key = cache_key(url)
    path = CACHE / (key + ".html")
    index = _load_cache()
    if use_cache and not refresh and path.exists():
        return path.read_text(encoding="utf-8")

    last_error = None
    for attempt in range(RETRIES):
        wait = DELAY - (time.time() - _last_request)
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                raw = response.read()
                charset = response.headers.get_content_charset() or "utf-8"
                text = raw.decode(charset, errors="replace")
            path.write_text(text, encoding="utf-8")
            index[url] = {
                "key": key,
                "bytes": len(raw),
                "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            }
            _save_cache()
            _last_request = time.time()
            return text
        except Exception as exc:  # noqa: BLE001 - retrying is intentional
            last_error = exc
            time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {url}: {last_error}")


def fetch_bytes(url: str, refresh: bool = False) -> bytes:
    """Download binary content (images).  Cached by URL hash with a .bin suffix."""
    ensure_dirs()
    key = cache_key(url)
    path = CACHE / (key + ".bin")
    if not refresh and path.exists():
        return path.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
        raw = response.read()
    path.write_bytes(raw)
    return raw


def clean(text: str | None) -> str:
    if not text:
        return ""
    text = text.replace("\u00a0", " ").replace("\u3000", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


def line(text: str | None) -> str:
    return clean(text).replace("\n", " ")


def element_text(el, sep: str = " ") -> str:
    if el is None:
        return ""
    return clean(sep.join(el.itertext()))


def first_xpath(tree, expr: str, default=None):
    result = tree.xpath(expr)
    return result[0] if result else default


def js_dumps(value) -> str:
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return text.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def write_js(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "window.EXAM_DATA = window.EXAM_DATA || {};\n" + body + "\n",
        encoding="utf-8",
    )


def write_data_js(name: str, expr: str, value) -> None:
    write_js(DATA / name, f"{expr} = {js_dumps(value)};")


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value)
    return value.strip("-") or "item"


def ensure_ascii_name(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in name)
