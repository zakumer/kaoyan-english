/* Mistake notebook: every wrong objective answer, grouped by paper. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;
  var filter = "unresolved";
  var rootRef = null;
  var loaded = {};

  function allMistakes() {
    var state = KY.store.state();
    return Object.keys(state.mistakes).map(function (key) {
      var m = state.mistakes[key];
      m.key = key;
      return m;
    }).sort(function (a, b) { return String(b.lastAt || "").localeCompare(String(a.lastAt || "")); });
  }

  function paperLabel(id) {
    var p = KY.data.allPapers().filter(function (x) { return x.id === id; })[0];
    return p ? p.label : id;
  }

  function findQuestion(paper, n) {
    for (var i = 0; i < (paper.parts || []).length; i++) {
      var part = paper.parts[i];
      var qs = part.questions || [];
      for (var j = 0; j < qs.length; j++) {
        if (Number(qs[j].n) === Number(n)) return { part: part, q: qs[j] };
      }
    }
    return null;
  }

  function group(list) {
    var out = {};
    list.forEach(function (m) {
      if (!out[m.paperId]) out[m.paperId] = [];
      out[m.paperId].push(m);
    });
    return out;
  }

  function shellHTML(list) {
    var unresolved = list.filter(function (m) { return !m.resolved; }).length;
    var total = list.length;
    var groups = group(list);
    var paperIds = Object.keys(groups);
    return KY.ui.shell("mistakes", KY.ui.pageHead("错题本", "MISTAKES", '<a class="btn btn--ghost btn--sm" href="#/papers">' + u.icon("papers") + "去做题</a>") +
      '<div class="stat-grid">' +
        KY.ui.statCard("待消化", unresolved, "题", unresolved ? "rust" : "") +
        KY.ui.statCard("累计错题", total, "题", "gold") +
        KY.ui.statCard("涉及试卷", paperIds.length, "套", "blue") +
      "</div>" +
      '<div class="toolbar mt-16">' +
        '<div class="segmented" id="mistake-filter">' +
          '<button data-filter="unresolved" class="' + (filter === "unresolved" ? "is-active" : "") + '">待消化 ' + unresolved + "</button>" +
          '<button data-filter="all" class="' + (filter === "all" ? "is-active" : "") + '">全部 ' + total + "</button>" +
          '<button data-filter="resolved" class="' + (filter === "resolved" ? "is-active" : "") + '">已掌握</button>' +
        "</div>" +
        '<span class="small muted">错题来自模考与练习；看懂解析后点“已掌握”。</span>' +
      "</div>" +
      '<div id="mistake-list" class="mt-16">' + (paperIds.length ? paperIds.map(function (id) {
        var items = groups[id];
        return '<section class="card mt-16" data-paper-group="' + u.attr(id) + '"><div class="card__head"><div><p class="kicker">' + u.esc(items[0] ? items[0].paperId : "") + '</p><h2 class="card__title">' + u.esc(paperLabel(id)) + "</h2></div>" + u.chip(items.length + " 题", "gold") + "</div>" +
          '<div class="mistake-list">' + items.map(function (m) {
            return '<div class="mistake-row" data-mistake="' + u.attr(m.key) + '">' +
              '<div class="mistake-row__no">' + m.qn + "</div>" +
              '<div class="mistake-row__main"><strong>第 ' + m.qn + " 题 · 你选 " + u.esc(m.chosen || "—") + "，正确 " + u.esc(m.correct || "—") + "</strong><span>错 " + m.count + " 次 · " + u.esc(String(m.lastAt || "").slice(0, 10)) + "</span></div>" +
              '<button class="btn btn--ghost btn--sm" data-resolve="' + u.attr(m.key) + '">' + (m.resolved ? "重新打开" : "已掌握") + "</button>" +
            "</div>";
          }).join("") + "</div></section>";
      }).join("") : KY.ui.empty("错题本还是空的", "先做一套真题，错题会自动收进来。", '<a class="btn" href="#/papers">去真题库</a>')) + "</div>");
  }

  function hydrateRows(root, paper, items) {
    items.forEach(function (m) {
      var row = root.querySelector('[data-mistake="' + m.key.replace(/"/g, '\\"') + '"]');
      if (!row || row.dataset.hydrated === "1") return;
      var found = findQuestion(paper, m.qn);
      if (!found) return;
      row.dataset.hydrated = "1";
      var details = document.createElement("details");
      details.className = "review-item__detail";
      details.innerHTML = '<summary class="small muted">查看题干与解析</summary>' +
        '<div class="review-item__body">' + (found.q.stem ? '<p class="en">' + u.esc(found.q.stem) + "</p>" : "") +
        (found.part.kind === "ordering" && found.part.orderChain ? '<div class="small muted mt-8">顺序：' + u.esc(found.part.orderChain) + "</div>" : "") +
        KY.views.exam.explainHTML(found.q, found.part) + "</div>";
      row.parentNode.insertBefore(details, row.nextSibling);
    });
  }

  function hydrate(root, list) {
    var groups = group(list);
    Object.keys(groups).forEach(function (paperId) {
      if (loaded[paperId]) {
        hydrateRows(root, loaded[paperId], groups[paperId]);
        return;
      }
      KY.data.loadPaper(paperId).then(function (paper) {
        loaded[paperId] = paper;
        hydrateRows(root, paper, groups[paperId]);
      }).catch(function (err) {
        console.warn("Could not load paper for mistakes", paperId, err);
      });
    });
  }

  function render() {
    var list = allMistakes().filter(function (m) {
      if (filter === "unresolved") return !m.resolved;
      if (filter === "resolved") return m.resolved;
      return true;
    });
    return shellHTML(list);
  }

  function mount(root) {
    rootRef = root;
    var list = allMistakes();
    hydrate(root, list);
    root.querySelectorAll("#mistake-filter button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filter = btn.getAttribute("data-filter");
        root.innerHTML = render();
        mount(root);
      });
    });
    if (!root.dataset.mistakeBound) {
      root.dataset.mistakeBound = "1";
      root.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-resolve]");
        if (!btn) return;
        var key = btn.getAttribute("data-resolve");
        var item = KY.store.state().mistakes[key];
        if (!item) return;
        KY.store.resolveMistake(key, !item.resolved);
        KY.ui.toast(item.resolved ? "已重新打开" : "已标记掌握", "ok");
        root.innerHTML = render();
        mount(root);
      });
    }
  }

  KY.views = KY.views || {};
  KY.views.mistakes = { render: render, mount: mount };
})();
