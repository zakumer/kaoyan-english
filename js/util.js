/* Small, dependency-free helpers shared by every view. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function attr(value) {
    return esc(value).replace(/`/g, "&#96;");
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function dateKey(date) {
    var d = date ? new Date(date) : new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function today() {
    return dateKey(new Date());
  }

  function parseDate(key) {
    var parts = String(key || "").split("-").map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }

  function addDays(key, days) {
    var d = key ? parseDate(key) : new Date();
    d.setDate(d.getDate() + days);
    return dateKey(d);
  }

  function daysBetween(a, b) {
    var ms = parseDate(b).getTime() - parseDate(a).getTime();
    return Math.round(ms / 86400000);
  }

  function daysLeft(target) {
    return daysBetween(today(), target);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function pct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  }

  function fmtDuration(seconds) {
    seconds = Math.max(0, Math.round(seconds || 0));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h) return h + ":" + pad(m) + ":" + pad(s);
    return m + ":" + pad(s);
  }

  function fmtMinutes(minutes) {
    minutes = Math.max(0, Math.round(minutes || 0));
    if (minutes < 60) return minutes + " 分钟";
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return h + " 小时" + (m ? " " + m + " 分" : "");
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait);
    };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === "1") return resolve();
        existing.addEventListener("load", function () { resolve(); });
        existing.addEventListener("error", function () { reject(new Error("无法加载 " + src)); });
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      script.onload = function () {
        script.dataset.loaded = "1";
        resolve();
      };
      script.onerror = function () {
        reject(new Error("无法加载 " + src));
      };
      document.head.appendChild(script);
    });
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("读取失败")); };
      reader.readAsText(file, "utf-8");
    });
  }

  function speak(text, rate) {
    if (!text || !("speechSynthesis" in window)) {
      toast("当前浏览器不支持朗读", "warn");
      return false;
    }
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = "en-US";
    utterance.rate = Number(rate) || 0.92;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function uid(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function shuffle(items) {
    var copy = items.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightWord(text, word) {
    if (!word) return esc(text);
    var safe = escapeRegExp(word);
    var re = new RegExp("(" + safe + ")", "gi");
    return esc(text).replace(re, '<mark class="hl">$1</mark>');
  }

  function chip(text, tone, attrs) {
    return '<span class="chip' + (tone ? " chip--" + tone : "") + '" ' + (attrs || "") + ">" + esc(text) + "</span>";
  }

  function icon(name) {
    var paths = {
      home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
      book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/><path d="M8 7h8"/><path d="M8 11h6"/>',
      papers: '<path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/>',
      chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      play: '<path d="m8 5 11 7-11 7z"/>',
      check: '<path d="m4 12 5 5L20 6"/>',
      x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
      arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
      back: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      flame: '<path d="M12 22c4.4 0 7-2.9 7-6.7 0-3.1-1.7-5.4-4.2-7.8-.5 2-1.4 3.2-2.8 4.1.1-2.7-1.1-5.1-3.6-7.6.1 4.2-3.4 6.4-3.4 11.3C5 19.1 7.6 22 12 22z"/>',
      volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M19 6a9 9 0 0 1 0 12"/>',
      bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      chevron: '<path d="m9 18 6-6-6-6"/>',
      chevronDown: '<path d="m6 9 6 6 6-6"/>',
      refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
      trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
      target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
      spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/>',
      list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
      grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
      flag: '<path d="M5 21V4"/><path d="M5 4h11l-1 4 1 4H5"/>'
    };
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.book) + "</svg>";
  }

  KY.util = {
    esc: esc,
    attr: attr,
    dateKey: dateKey,
    today: today,
    parseDate: parseDate,
    addDays: addDays,
    daysBetween: daysBetween,
    daysLeft: daysLeft,
    clamp: clamp,
    pct: pct,
    pad: pad,
    fmtDuration: fmtDuration,
    fmtMinutes: fmtMinutes,
    debounce: debounce,
    loadScript: loadScript,
    download: download,
    readFile: readFile,
    speak: speak,
    uid: uid,
    shuffle: shuffle,
    highlightWord: highlightWord,
    chip: chip,
    icon: icon
  };
})();
