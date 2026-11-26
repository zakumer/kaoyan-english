/* Versioned localStorage state.  All data stays on this device. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var KEY = "kaoyan-english:v1";
  var VERSION = 1;
  var memoryOnly = false;
  var saveTimer = null;

  function emptyState() {
    var d = KY.util.today();
    return {
      version: VERSION,
      createdAt: d,
      lastOpened: d,
      settings: {
        dailyNew: 20,
        dailyReview: 100,
        examDate: (window.EXAM_DATA && EXAM_DATA.meta && EXAM_DATA.meta.examDate) || "2026-12-19",
        theme: "auto",
        ttsRate: 0.92,
        examMinutes: 180
      },
      vocab: {},
      attempts: {},
      mistakes: {},
      drafts: {},
      notes: {},
      activity: {}
    };
  }

  function normalize(raw) {
    var base = emptyState();
    if (!raw || typeof raw !== "object") return base;
    var state = Object.assign(base, raw);
    state.version = VERSION;
    state.settings = Object.assign(base.settings, raw.settings || {});
    ["vocab", "attempts", "mistakes", "drafts", "notes", "activity"].forEach(function (key) {
      if (!raw[key] || typeof raw[key] !== "object" || Array.isArray(raw[key])) state[key] = {};
    });
    return state;
  }

  function load() {
    try {
      var text = localStorage.getItem(KEY);
      if (!text) return emptyState();
      return normalize(JSON.parse(text));
    } catch (err) {
      memoryOnly = true;
      console.warn("localStorage unavailable, using memory state", err);
      return emptyState();
    }
  }

  var state = load();

  function saveNow() {
    state.lastOpened = KY.util.today();
    if (memoryOnly) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      memoryOnly = true;
      console.warn("Could not persist state", err);
      if (window.KY && KY.ui) KY.ui.toast("浏览器存储空间不足，数据只保留在本次页面中", "warn");
    }
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 120);
  }

  function flush() {
    clearTimeout(saveTimer);
    saveNow();
  }

  function todayActivity() {
    var d = KY.util.today();
    if (!state.activity[d]) state.activity[d] = { reviews: 0, newWords: 0, papers: 0, minutes: 0 };
    return state.activity[d];
  }

  function record(kind, amount) {
    var a = todayActivity();
    if (kind === "review") a.reviews += amount || 1;
    if (kind === "new") a.newWords += amount || 1;
    if (kind === "paper") a.papers += amount || 1;
    if (kind === "minutes") a.minutes += amount || 0;
    save();
  }

  function getWord(word) {
    return state.vocab[word] || null;
  }

  function setWord(word, card) {
    state.vocab[word] = card;
    save();
  }

  function removeWord(word) {
    delete state.vocab[word];
    save();
  }

  function getAttempt(id) {
    return state.attempts[id] || null;
  }

  function saveAttempt(attempt) {
    state.attempts[attempt.id] = attempt;
    var ids = Object.keys(state.attempts).sort(function (a, b) {
      return String(state.attempts[b].startedAt || "").localeCompare(String(state.attempts[a].startedAt || ""));
    });
    ids.slice(60).forEach(function (id) { delete state.attempts[id]; });
    save();
  }

  function addMistake(paperId, qn, correct, chosen) {
    var key = paperId + ":" + qn;
    var item = state.mistakes[key];
    if (!item) {
      item = { paperId: paperId, qn: qn, correct: correct, chosen: chosen, count: 0, lastAt: "", resolved: false };
      state.mistakes[key] = item;
    }
    item.correct = correct;
    item.chosen = chosen;
    item.count += 1;
    item.lastAt = new Date().toISOString();
    item.resolved = false;
    save();
  }

  function resolveMistake(key, resolved) {
    if (state.mistakes[key]) {
      state.mistakes[key].resolved = !!resolved;
      save();
    }
  }

  function saveDraft(key, text) {
    state.drafts[key] = text;
    save();
  }

  function getDraft(key) {
    return state.drafts[key] || "";
  }

  function exportState() {
    return JSON.stringify({
      app: "kaoyan-english",
      exportedAt: new Date().toISOString(),
      state: state
    }, null, 2);
  }

  function importState(text) {
    var payload = JSON.parse(text);
    var incoming = payload && payload.state ? payload.state : payload;
    if (!incoming || typeof incoming !== "object") throw new Error("文件内容不是有效的备份");
    state = normalize(incoming);
    saveNow();
    return state;
  }

  function reset() {
    state = emptyState();
    saveNow();
  }

  function stats() {
    var words = Object.keys(state.vocab);
    var learned = words.filter(function (w) { return state.vocab[w].status === "review"; }).length;
    var learning = words.filter(function (w) { return state.vocab[w].status === "learning"; }).length;
    var attempts = Object.keys(state.attempts).map(function (id) { return state.attempts[id]; });
    var completed = attempts.filter(function (a) { return a.completed; });
    var correct = completed.reduce(function (n, a) { return n + (a.correct || 0); }, 0);
    var answered = completed.reduce(function (n, a) { return n + (a.answered || 0); }, 0);
    var unresolved = Object.keys(state.mistakes).filter(function (k) { return !state.mistakes[k].resolved; }).length;
    return {
      learned: learned,
      learning: learning,
      touched: words.length,
      attempts: attempts.length,
      completed: completed.length,
      accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      unresolved: unresolved
    };
  }

  function streak() {
    var cursor = KY.util.today();
    var count = 0;
    for (var i = 0; i < 3650; i++) {
      var a = state.activity[cursor];
      var active = a && (a.reviews > 0 || a.newWords > 0 || a.papers > 0);
      if (active) count += 1;
      else if (i === 0) {
        // Today may not have started yet; allow yesterday to keep the streak.
      } else break;
      cursor = KY.util.addDays(cursor, -1);
    }
    return count;
  }

  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });

  KY.store = {
    state: function () { return state; },
    save: save,
    flush: flush,
    record: record,
    getWord: getWord,
    setWord: setWord,
    removeWord: removeWord,
    getAttempt: getAttempt,
    saveAttempt: saveAttempt,
    addMistake: addMistake,
    resolveMistake: resolveMistake,
    saveDraft: saveDraft,
    getDraft: getDraft,
    exportState: exportState,
    importState: importState,
    reset: reset,
    stats: stats,
    streak: streak,
    todayActivity: todayActivity,
    isMemoryOnly: function () { return memoryOnly; }
  };
})();
