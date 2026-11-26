/* Learning statistics: vocabulary, activity heatmap, mock history. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;

  function activityLevel(n) {
    if (!n) return 0;
    if (n < 5) return 1;
    if (n < 10) return 2;
    if (n < 20) return 3;
    return 4;
  }

  function heatmap() {
    var state = KY.store.state();
    var cells = [];
    var activeDays = 0;
    for (var i = 181; i >= 0; i--) {
      var key = u.addDays(u.today(), -i);
      var a = state.activity[key] || {};
      var n = (a.reviews || 0) + (a.newWords || 0) + (a.papers || 0) * 3;
      if (n > 0) activeDays += 1;
      cells.push('<span class="heatmap__cell" data-level="' + activityLevel(n) + '" title="' + key + " · " + (a.reviews || 0) + " 复习 / " + (a.newWords || 0) + " 新词 / " + (a.papers || 0) + ' 套卷"></span>');
    }
    return '<div class="heatmap">' + cells.join("") + "</div>" +
      '<div class="heatmap-legend">少 <i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i> 多</div>' +
      '<p class="small muted mt-8">最近 26 周，活跃 ' + activeDays + " 天。任何复习、新词或交卷都会点亮一格。</p>";
  }

  function vocabBars() {
    var state = KY.store.state();
    var total = KY.data.wordMeta().total || 1;
    var counts = { review: 0, learning: 0, untouched: 0 };
    Object.keys(state.vocab).forEach(function (w) {
      var c = state.vocab[w];
      if (c.status === "review") counts.review += 1;
      else counts.learning += 1;
    });
    counts.untouched = Math.max(0, total - counts.review - counts.learning);
    var rows = [
      { label: "已掌握", value: counts.review, tone: "gold" },
      { label: "学习中", value: counts.learning, tone: "" },
      { label: "未开始", value: counts.untouched, tone: "muted" }
    ];
    return '<div class="bar-list">' + rows.map(function (r) {
      var p = Math.round((r.value / total) * 100);
      return '<div class="bar-row"><span class="bar-row__label">' + r.label + '</span><span class="bar-row__track"><span class="bar-row__fill" style="width:' + p + '%;' + (r.tone === "muted" ? "opacity:.35" : "") + '"></span></span><span class="bar-row__value">' + r.value + "</span></div>";
    }).join("") + "</div>";
  }

  function paperHistory() {
    var state = KY.store.state();
    var attempts = Object.keys(state.attempts).map(function (id) { return state.attempts[id]; })
      .filter(function (a) { return a.completed; })
      .sort(function (a, b) { return String(b.finishedAt || "").localeCompare(String(a.finishedAt || "")); })
      .slice(0, 10);
    if (!attempts.length) return KY.ui.empty("还没有模考记录", "完成一套真题后，这里会记录正确率、用时和自评。", '<a class="btn" href="#/papers">选一套真题</a>');
    return '<div class="table-like">' + attempts.map(function (a) {
      return '<a class="table-row" href="#/review/' + encodeURIComponent(a.id) + '">' +
        '<span><strong>' + u.esc(a.paperLabel || a.paperId) + "</strong><small>" + u.esc(String(a.finishedAt || "").slice(0, 10)) + " · " + u.fmtDuration(a.elapsed || 0) + "</small></span>" +
        '<span class="mono">' + (a.correct || 0) + "/" + (a.answered || 0) + "</span>" +
        '<span class="chip ' + ((a.accuracy || 0) >= 60 ? "chip--accent" : "chip--rust") + '">' + (a.accuracy || 0) + "%</span>" +
      "</a>";
    }).join("") + "</div>";
  }

  function mistakeBars() {
    var state = KY.store.state();
    var byPaper = {};
    Object.keys(state.mistakes).forEach(function (key) {
      var m = state.mistakes[key];
      if (m.resolved) return;
      byPaper[m.paperId] = (byPaper[m.paperId] || 0) + 1;
    });
    var rows = Object.keys(byPaper).map(function (id) { return { id: id, n: byPaper[id] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
    if (!rows.length) return '<p class="small muted">没有待消化的错题，保持住。</p>';
    var max = rows[0].n;
    return '<div class="bar-list">' + rows.map(function (r) {
      var label = (KY.data.allPapers().filter(function (p) { return p.id === r.id; })[0] || {}).label || r.id;
      return '<div class="bar-row"><span class="bar-row__label">' + u.esc(label) + '</span><span class="bar-row__track"><span class="bar-row__fill" style="width:' + Math.round((r.n / max) * 100) + '%"></span></span><span class="bar-row__value">' + r.n + "</span></div>";
    }).join("") + "</div>";
  }

  function render() {
    var stats = KY.store.stats();
    var state = KY.store.state();
    var meta = KY.data.meta();
    var wordTotal = KY.data.wordMeta().total || 0;
    var counts = KY.srs.counts(state.vocab, u.today());
    var days = u.daysLeft(state.settings.examDate || meta.examDate || "2026-12-19");
    return KY.ui.shell("stats", KY.ui.pageHead("学习统计", "PROGRESS", '<a class="btn btn--ghost btn--sm" href="#/settings">' + u.icon("settings") + "设置目标</a>") +
      '<div class="stat-grid">' +
        KY.ui.statCard("已掌握单词", stats.learned, "/ " + wordTotal, "gold") +
        KY.ui.statCard("客观题正确率", stats.accuracy, "%") +
        KY.ui.statCard("完成真题", stats.completed, "套", "blue") +
        KY.ui.statCard("待复习", counts.due, "词", counts.due ? "rust" : "") +
      "</div>" +
      '<div class="stats-grid mt-16">' +
        '<section class="card"><div class="card__head"><div><p class="kicker">ACTIVITY</p><h2 class="card__title">学习热力图</h2></div>' + u.chip("连续 " + KY.store.streak() + " 天", "gold") + "</div>" + heatmap() + "</section>" +
        '<section class="card"><div class="card__head"><div><p class="kicker">VOCABULARY</p><h2 class="card__title">词汇状态</h2></div></div>' + vocabBars() +
          '<div class="row row--between small mt-16"><span>今天新词</span><b>' + KY.store.todayActivity().newWords + " / " + (state.settings.dailyNew || 20) + "</b></div>" +
          '<div class="row row--between small mt-8"><span>距考试</span><b>' + (days >= 0 ? days + " 天" : "已过") + "</b></div>" +
          '<a class="btn btn--ghost btn--sm mt-16" href="#/vocab">继续背单词</a></section>' +
        '<section class="card"><div class="card__head"><div><p class="kicker">MISTAKES</p><h2 class="card__title">错题集中在哪</h2></div><a class="small muted" href="#/mistakes">全部 →</a></div>' + mistakeBars() + "</section>" +
        '<section class="card"><div class="card__head"><div><p class="kicker">MOCK EXAMS</p><h2 class="card__title">最近模考</h2></div><a class="small muted" href="#/papers">真题库 →</a></div>' + paperHistory() + "</section>" +
      "</div>" +
      '<section class="card mt-16"><div class="card__head"><div><p class="kicker">NEXT</p><h2 class="card__title">下一步建议</h2></div></div><div class="advice-list">' +
        (counts.due ? '<div class="advice"><strong>先清到期复习</strong><span>' + counts.due + " 个词已经到期。先复习，再学新词，记忆更稳。</span></div>" : '<div class="advice"><strong>今天没有到期词</strong><span>可以学一组新词，或做一篇阅读精读。</span></div>') +
        (stats.unresolved ? '<div class="advice"><strong>消化错题</strong><span>还有 ' + stats.unresolved + " 道错题没标记掌握。先看懂定位句，再重做。</span></div>" : "") +
        '<div class="advice"><strong>保持节奏</strong><span>每天 20 分钟比周末突击更有效。今天做一篇 Text 或 20 个新词就够了。</span></div>' +
      "</div></section>");
  }

  KY.views = KY.views || {};
  KY.views.stats = { render: render, mount: function () {} };
})();
