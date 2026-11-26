/* A compact SM-2 style scheduler.  Pure functions so it can be unit-tested. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KY = root.KY || {};
  root.KY.srs = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var GRADES = ["again", "hard", "good", "easy"];

  function newCard(nowKey) {
    return {
      status: "new",
      ease: 2.5,
      interval: 0,
      reps: 0,
      lapses: 0,
      due: nowKey || new Date().toISOString().slice(0, 10),
      last: null,
      history: []
    };
  }

  function addDays(key, days) {
    var parts = String(key).split("-").map(Number);
    var d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    d.setDate(d.getDate() + days);
    var p = function (n) { return n < 10 ? "0" + n : String(n); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function schedule(card, grade, nowKey) {
    var c = Object.assign({}, newCard(nowKey), card || {});
    c.history = (card && card.history ? card.history.slice(-30) : []);
    var today = nowKey || new Date().toISOString().slice(0, 10);
    var ease = Number(c.ease) || 2.5;
    var interval = Number(c.interval) || 0;
    var reps = Number(c.reps) || 0;

    if (grade === "again") {
      reps = 0;
      interval = 0;
      ease = Math.max(1.3, ease - 0.2);
      c.lapses = (Number(c.lapses) || 0) + 1;
      c.status = "learning";
    } else if (grade === "hard") {
      reps += 1;
      interval = interval <= 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      c.status = "learning";
    } else if (grade === "easy") {
      reps += 1;
      interval = interval <= 0 ? 2 : Math.max(2, Math.round(interval * ease * 1.3));
      ease = Math.min(3.0, ease + 0.15);
      c.status = interval >= 21 ? "review" : "learning";
    } else {
      reps += 1;
      if (reps === 1) interval = 1;
      else if (reps === 2) interval = 3;
      else interval = Math.max(1, Math.round(interval * ease));
      c.status = interval >= 21 ? "review" : "learning";
    }

    interval = Math.max(0, Math.min(365, interval));
    c.ease = Math.round(ease * 100) / 100;
    c.interval = interval;
    c.reps = reps;
    c.last = today;
    c.due = grade === "again" ? today : addDays(today, interval);
    c.history.push({ date: today, grade: grade, interval: interval, ease: c.ease });
    return c;
  }

  function isDue(card, todayKey) {
    if (!card) return false;
    if (card.status === "new") return false;
    return String(card.due || "") <= (todayKey || new Date().toISOString().slice(0, 10));
  }

  function dueCards(vocab, todayKey, limit) {
    var today = todayKey || new Date().toISOString().slice(0, 10);
    var list = Object.keys(vocab || {}).filter(function (w) {
      return isDue(vocab[w], today);
    }).map(function (w) { return Object.assign({ word: w }, vocab[w]); });
    list.sort(function (a, b) {
      return String(a.due).localeCompare(String(b.due)) || String(a.word).localeCompare(String(b.word));
    });
    return typeof limit === "number" ? list.slice(0, limit) : list;
  }

  function counts(vocab, todayKey) {
    var today = todayKey || new Date().toISOString().slice(0, 10);
    var out = { new: 0, learning: 0, review: 0, due: 0, total: 0 };
    Object.keys(vocab || {}).forEach(function (w) {
      var c = vocab[w];
      out.total += 1;
      if (!c || c.status === "new" || !c.status) out.new += 1;
      else if (c.status === "review") out.review += 1;
      else out.learning += 1;
      if (isDue(c, today)) out.due += 1;
    });
    return out;
  }

  return {
    GRADES: GRADES,
    newCard: newCard,
    schedule: schedule,
    isDue: isDue,
    dueCards: dueCards,
    counts: counts,
    addDays: addDays
  };
});
