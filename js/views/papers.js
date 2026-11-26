(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;
  var filter = { era: "all", query: "", year: "all" };

  function attemptsFor(paperId) {
    var state = KY.store.state();
    return Object.keys(state.attempts).map(function (id) { return state.attempts[id]; })
      .filter(function (a) { return a.paperId === paperId && a.completed; })
      .sort(function (a, b) { return String(b.finishedAt || "").localeCompare(String(a.finishedAt || "")); });
  }

  function card(paper) {
    var attempts = attemptsFor(paper.id);
    var best = attempts.reduce(function (n, a) { return Math.max(n, a.accuracy || 0); }, 0);
    var done = attempts.length > 0;
    var minutes = KY.store.state().settings.examMinutes || paper.timeLimitMin || 180;
    return '<article class="paper-card' + (done ? " paper-card--done" : "") + '">' +
      '<div class="row row--between"><div class="paper-card__year">' + paper.year + '<span>' + (paper.era === "modern" ? "英语一" : "旧卷") + "</span></div>" +
        (done ? '<span class="chip chip--gold">最高 ' + best + "%</span>" : '<span class="chip chip--outline">未做</span>') + "</div>" +
      '<div class="paper-card__meta">' +
        '<span class="chip">' + paper.objectiveCount + " 道客观题</span>" +
        '<span class="chip">' + paper.partCount + " 个部分</span>" +
        (paper.coverage && paper.coverage.explained < paper.coverage.objective ? '<span class="chip chip--rust">解析 ' + paper.coverage.explained + "/" + paper.coverage.objective + "</span>" : '<span class="chip chip--accent">解析齐全</span>') +
      "</div>" +
      '<div class="paper-card__foot"><span class="paper-card__status">' + (done ? "已完成 " + attempts.length + " 次" : "建议限时 " + minutes + " 分钟") + "</span>" +
        '<div class="paper-card__actions">' +
          '<a class="btn btn--sm btn--ghost" href="#/reading/' + encodeURIComponent(paper.id) + '">精读</a>' +
          '<a class="btn btn--sm" href="#/exam/' + encodeURIComponent(paper.id) + '?mode=exam">模考</a>' +
        "</div>" +
      "</div>" +
    "</article>";
  }

  function render() {
    var papers = KY.data.allPapers();
    var q = filter.query.trim().toLowerCase();
    var shown = papers.filter(function (p) {
      if (filter.era !== "all" && p.era !== filter.era) return false;
      if (filter.year !== "all" && String(p.year) !== String(filter.year)) return false;
      if (q && String(p.year).indexOf(q) === -1 && (p.label || "").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var years = papers.map(function (p) { return p.year; });
    var state = KY.store.state();
    var doneIds = {};
    Object.keys(state.attempts).forEach(function (id) {
      if (state.attempts[id].completed) doneIds[state.attempts[id].paperId] = true;
    });
    var done = Object.keys(doneIds).length;

    return KY.ui.pageHead("真题库", "PAST PAPERS", '<button class="btn btn--ghost btn--sm" data-action="random-paper">' + u.icon("spark") + "随机一套</button>") +
      '<section class="card card--flat" style="padding:18px">' +
        '<div class="toolbar">' +
          '<div class="search-box" style="flex:1;min-width:180px">' + u.icon("search") + '<input class="input" id="paper-search" placeholder="按年份或关键词筛选…" value="' + u.attr(filter.query) + '"></div>' +
          '<div class="segmented" id="era-filter">' +
            '<button data-era="all" class="' + (filter.era === "all" ? "is-active" : "") + '">全部 29</button>' +
            '<button data-era="modern" class="' + (filter.era === "modern" ? "is-active" : "") + '">2010–2026</button>' +
            '<button data-era="old" class="' + (filter.era === "old" ? "is-active" : "") + '">1998–2009</button>' +
          "</div>" +
        "</div>" +
        '<div class="row mt-8 small muted"><span>已完成 ' + done + " / " + papers.length + " 套。</span><span>模考按 " + (state.settings.examMinutes || 180) + " 分钟计时；练习模式可随时看解析。</span></div>" +
      "</section>" +
      '<div class="paper-grid mt-16">' + (shown.length ? shown.map(card).join("") : '<div class="empty" style="grid-column:1/-1"><h3>没有匹配的试卷</h3><p>调整年份或关键词试试。</p></div>') + "</div>";
  }

  function mount(root) {
    var search = root.querySelector("#paper-search");
    if (search) search.addEventListener("input", u.debounce(function () {
      filter.query = search.value;
      root.innerHTML = render();
      mount(root);
    }, 150));
    root.querySelectorAll("#era-filter button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filter.era = btn.getAttribute("data-era");
        root.innerHTML = render();
        mount(root);
      });
    });
    var random = root.querySelector('[data-action="random-paper"]');
    if (random) random.addEventListener("click", function () {
      var list = KY.data.allPapers();
      var pick = list[Math.floor(Math.random() * list.length)];
      location.hash = "#/exam/" + encodeURIComponent(pick.id) + "?mode=exam";
    });
  }

  KY.views = KY.views || {};
  KY.views.papers = { render: render, mount: mount };
})();
