/* Lazy loading for the large paper and word-detail payloads. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var data = window.EXAM_DATA || {};
  var paperPromises = {};
  var detailsPromise = null;

  function meta() {
    return data.meta || { papers: [], counts: {}, source: "", sourceLabel: "" };
  }

  function words() {
    return data.words || {};
  }

  function wordOrder() {
    return data.wordOrder || Object.keys(words());
  }

  function wordMeta() {
    return data.wordMeta || { total: wordOrder().length, syllabus: 0, over: 0 };
  }

  function paper(id) {
    return (data.papers || {})[id] || null;
  }

  function loadPaper(id) {
    if (paper(id)) return Promise.resolve(paper(id));
    if (paperPromises[id]) return paperPromises[id];
    paperPromises[id] = KY.util.loadScript("data/papers/" + encodeURIComponent(id) + ".js").then(function () {
      var p = paper(id);
      if (!p) throw new Error("试卷数据不完整：" + id);
      return p;
    }).catch(function (err) {
      delete paperPromises[id];
      throw err;
    });
    return paperPromises[id];
  }

  function loadWordDetails() {
    if (data.wordDetails) return Promise.resolve(data.wordDetails);
    if (detailsPromise) return detailsPromise;
    detailsPromise = KY.util.loadScript("data/word-details.js").then(function () {
      return data.wordDetails || {};
    }).catch(function (err) {
      detailsPromise = null;
      throw err;
    });
    return detailsPromise;
  }

  function detailsFor(word) {
    return (data.wordDetails || {})[word] || null;
  }

  function allPapers() {
    return (meta().papers || []).slice().sort(function (a, b) { return b.year - a.year; });
  }

  function findWord(word) {
    return words()[word] || null;
  }

  function searchWords(query, limit) {
    var q = String(query || "").trim().toLowerCase();
    var order = wordOrder();
    if (!q) return order.slice(0, limit || 120);
    var exact = [];
    var prefix = [];
    var contains = [];
    order.forEach(function (w) {
      var item = words()[w];
      if (!item) return;
      var hay = (w + " " + (item.gloss || "") + " " + (item.pos || "")).toLowerCase();
      if (w.toLowerCase() === q) exact.push(w);
      else if (w.toLowerCase().indexOf(q) === 0) prefix.push(w);
      else if (hay.indexOf(q) !== -1) contains.push(w);
    });
    return exact.concat(prefix, contains).slice(0, limit || 60);
  }

  KY.data = {
    meta: meta,
    words: words,
    wordOrder: wordOrder,
    wordMeta: wordMeta,
    paper: paper,
    loadPaper: loadPaper,
    loadWordDetails: loadWordDetails,
    detailsFor: detailsFor,
    allPapers: allPapers,
    findWord: findWord,
    searchWords: searchWords
  };
})();
