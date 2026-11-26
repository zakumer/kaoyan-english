(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;

  function dueSummary() {
    var state = KY.store.state();
    var due = KY.srs.dueCards(state.vocab, u.today()).length;
    var today = KY.store.todayActivity();
    var newLeft = Math.max(0, (state.settings.dailyNew || 20) - today.newWords);
    return { due: due, newLeft: newLeft, today: today };
  }

  function lastAttempt() {
    var state = KY.store.state();
    var attempts = Object.keys(state.attempts).map(function (id) { return state.attempts[id]; });
    attempts.sort(function (a, b) { return String(b.startedAt).localeCompare(String(a.startedAt)); });
    return attempts[0] || null;
  }

  function render() {
    var meta = KY.data.meta();
    var stats = KY.store.stats();
    var due = dueSummary();
    var state = KY.store.state();
    var days = u.daysLeft(state.settings.examDate || meta.examDate || "2026-12-19");
    var wordTotal = KY.data.wordMeta().total || 0;
    var papers = meta.papers || [];
    var doneIds = {};
    Object.keys(state.attempts).forEach(function (id) {
      var a = state.attempts[id];
      if (a.completed) doneIds[a.paperId] = true;
    });
    var donePapers = Object.keys(doneIds).length;
    var last = lastAttempt();
    var recent = Object.keys(state.attempts).map(function (id) { return state.attempts[id]; })
      .filter(function (a) { return a.completed; })
      .sort(function (a, b) { return String(b.finishedAt || "").localeCompare(String(a.finishedAt || "")); })
      .slice(0, 4);

    var hero = '<section class="hero">' +
      '<div class="hero__copy">' +
        '<p class="hero__eyebrow">KAOYAN ENGLISH · ONE</p>' +
        '<h1>把今天的英语，<br>变成考场的底气。</h1>' +
        '<p>真题、单词、精读和错题都在本地。每天二十分钟，先完成最小的一步。</p>' +
        '<div class="hero__actions">' +
          '<a class="btn" href="#/vocab">' + u.icon("book") + "开始背单词</a>" +
          '<a class="btn btn--ghost" href="#/papers">' + u.icon("papers") + "做一套真题</a>" +
        "</div>" +
      "</div>" +
      '<div class="hero__aside">' +
        '<div class="hero__days">' + (days >= 0 ? days : "—") + '<small>天 · 距考试</small></div>' +
        '<div class="chip chip--gold">' + u.icon("flame") + "连续 " + KY.store.streak() + " 天</div>" +
      "</div>" +
    "</section>";

    var statGrid = '<div class="stat-grid mt-16">' +
      KY.ui.statCard("待复习", due.due, "词", due.due ? "rust" : "") +
      KY.ui.statCard("今日新词", due.today.newWords + " / " + (state.settings.dailyNew || 20), "", "gold") +
      KY.ui.statCard("真题完成", donePapers + " / " + papers.length, "套", "blue") +
      KY.ui.statCard("客观题正确率", stats.accuracy, "%") +
    "</div>";

    var todayCard = '<section class="card today-card">' +
      '<div class="card__head"><div><p class="kicker">TODAY</p><h2 class="card__title">今日安排</h2></div>' +
        '<span class="chip chip--accent">' + new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" }) + "</span></div>" +
      '<div class="task-row">' +
        '<div class="task-row__icon">' + u.icon("refresh") + "</div>" +
        '<div><div class="task-row__title">复习到期单词</div><div class="task-row__sub">' + (due.due ? "按遗忘曲线安排，先复习再学新词" : "今天没有到期词，可以学一组新词") + "</div></div>" +
        '<a class="btn btn--sm ' + (due.due ? "" : "btn--ghost") + '" href="#/vocab">' + (due.due ? "去复习 " + due.due : "去学习") + "</a>" +
      "</div>" +
      '<div class="task-row">' +
        '<div class="task-row__icon task-row__icon--gold">' + u.icon("spark") + "</div>" +
        '<div><div class="task-row__title">新词 ' + (state.settings.dailyNew || 20) + " 个</div><div class=\"task-row__sub\">已学 " + due.today.newWords + " 个，还剩 " + due.newLeft + " 个</div></div>" +
        '<a class="btn btn--sm btn--ghost" href="#/vocab?mode=new">继续</a>' +
      "</div>" +
      '<div class="task-row">' +
        '<div class="task-row__icon task-row__icon--rust">' + u.icon("papers") + "</div>" +
        '<div><div class="task-row__title">一篇真题阅读</div><div class="task-row__sub">先读 Text，再做题；做完立即看逐题解析</div></div>' +
        '<a class="btn btn--sm btn--ghost" href="#/reading/2026-english-one/1">精读一篇</a>' +
      "</div>" +
      (stats.unresolved ? '<div class="task-row">' +
        '<div class="task-row__icon task-row__icon--rust">' + u.icon("flag") + "</div>" +
        '<div><div class="task-row__title">回看错题</div><div class="task-row__sub">还有 ' + stats.unresolved + " 道题没有消化</div></div>" +
        '<a class="btn btn--sm btn--ghost" href="#/mistakes">去回看</a>' +
      "</div>" : "") +
    "</section>";

    var side = '<div class="stack">' +
      '<section class="card">' +
        '<div class="card__head"><h2 class="card__title">快捷入口</h2></div>' +
        '<div class="quick-grid">' +
          '<a class="quick-card" href="#/vocab"><span class="quick-card__icon">' + u.icon("book") + '</span><strong>背单词</strong><span>' + wordTotal.toLocaleString() + ' 个高频词</span></a>' +
          '<a class="quick-card" href="#/papers"><span class="quick-card__icon">' + u.icon("papers") + '</span><strong>真题模考</strong><span>' + papers.length + ' 套英语一</span></a>' +
          '<a class="quick-card" href="#/mistakes"><span class="quick-card__icon">' + u.icon("flag") + '</span><strong>错题本</strong><span>按题回看解析</span></a>' +
          '<a class="quick-card" href="#/stats"><span class="quick-card__icon">' + u.icon("chart") + '</span><strong>学习统计</strong><span>看见每天的积累</span></a>' +
        "</div>" +
      "</section>" +
      '<section class="card">' +
        '<div class="card__head"><div><p class="kicker">PROGRESS</p><h2 class="card__title">进度</h2></div></div>' +
        '<div class="stack stack--sm">' +
          '<div class="row row--between small"><span>单词已掌握</span><b>' + stats.learned + " / " + wordTotal + "</b></div>" +
          KY.ui.progress(stats.learned, wordTotal, "", "gold") +
          '<div class="row row--between small mt-8"><span>真题完成</span><b>' + donePapers + " / " + papers.length + "</b></div>" +
          KY.ui.progress(donePapers, papers.length, "", "") +
        "</div>" +
      "</section>" +
      (last ? '<section class="card card--flat">' +
        '<div class="card__head"><div><p class="kicker">LAST</p><h2 class="card__title">上次做到哪</h2></div></div>' +
        '<div class="recent-row"><div class="recent-row__main"><strong>' + u.esc(last.paperLabel || last.paperId) + "</strong><span>" + (last.completed ? "已完成 · " + (last.accuracy || 0) + "% 正确率" : "进行中 · 未交卷") + "</span></div>" +
        '<a class="btn btn--sm btn--ghost" href="' + (last.completed ? "#/review/" + encodeURIComponent(last.id) : "#/exam/" + encodeURIComponent(last.paperId)) + '">' + (last.completed ? "看结果" : "继续") + "</a></div>" +
      "</section>" : "") +
    "</div>";

    return KY.ui.pageHead("今日学习", "DASHBOARD", '<button class="btn btn--ghost btn--sm" data-action="search">' + u.icon("search") + "搜索单词 / 试卷</button>") +
      hero + statGrid +
      '<div class="dashboard-grid">' + todayCard + side + "</div>" +
      (recent.length ? '<section class="card mt-16"><div class="card__head"><h2 class="card__title">最近完成</h2><a class="small muted" href="#/stats">查看统计 →</a></div><div class="recent-list">' +
        recent.map(function (a) {
          return '<a class="recent-row" href="#/review/' + encodeURIComponent(a.id) + '"><div class="recent-row__main"><strong>' + u.esc(a.paperLabel || a.paperId) + "</strong><span>" + u.esc(a.finishedAt ? String(a.finishedAt).slice(0, 10) : "") + " · " + (a.correct || 0) + "/" + (a.answered || 0) + " 题</span></div><span class=\"chip chip--accent\">" + (a.accuracy || 0) + "%</span></a>";
        }).join("") + "</div></section>" : "");
  }

  KY.views = KY.views || {};
  KY.views.dashboard = { render: render, mount: function () {} };
})();
