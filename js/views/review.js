/* Review a saved attempt question by question. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;
  var R = null;
  var filter = "all";

  function optionRow(q, key) {
    var chosen = R.answers[q.n] === key;
    var cls = "option";
    if (key === q.answer) cls += " is-correct";
    else if (chosen) cls += " is-wrong";
    if (chosen) cls += " is-selected";
    return '<div class="' + cls + '"><span class="option__key">' + u.esc(key) + '</span><span class="option__text">' + u.esc((q.options || []).filter(function (o) { return o.key === key; }).map(function (o) { return o.text; })[0] || "") + "</span></div>";
  }

  function orderingReview(part, q) {
    return '<div class="explain-box"><div class="explain-box__head">' + u.chip("答案 " + q.answer, "accent") + "</div>" +
      '<div class="explain-box__row"><span class="explain-box__label">正确顺序</span><span class="explain-box__text">' + u.esc((part.order || []).join(" → ")) + "</span></div>" +
      (part.orderChain ? '<div class="explain-box__row"><span class="explain-box__label">链条</span><span class="explain-box__text">' + u.esc(part.orderChain) + "</span></div>" : "") +
      (part.seams ? '<div class="explain-box__row"><span class="explain-box__label">衔接</span><span class="explain-box__text">' + (Array.isArray(part.seams) ? part.seams.map(function (s) { return u.esc(s); }).join("<br>") : u.esc(part.seams)) + "</span></div>" : "") +
      "</div>";
  }

  function itemHTML(item) {
    var q = item.q, part = item.part;
    var chosen = R.answers[q.n];
    var ok = chosen === q.answer;
    var flag = R.flags && R.flags[q.n];
    var body = "";
    if (q.options && q.options.length) {
      body += '<div class="options">' + q.options.map(function (o) { return optionRow(q, o.key); }).join("") + "</div>";
    }
    if (part.kind === "ordering") body += orderingReview(part, q);
    else body += KY.views.exam.explainHTML(q, part);
    return '<details class="review-item" ' + (filter === "wrong" || filter === "flagged" ? "open" : "") + ">" +
      '<summary class="review-item__head"><span class="review-item__no">' + q.n + "</span>" +
        '<span class="review-item__stem">' + u.esc(q.stem || (part.kind === "ordering" ? "段落排序" : "第 " + q.n + " 题")) + "</span>" +
        u.chip(chosen || "未答", ok ? "accent" : "rust") +
        (flag ? u.chip("标记", "gold") : "") +
      "</summary>" +
      '<div class="review-item__body">' + body + "</div>" +
    "</details>";
  }

  function subjectiveHTML() {
    var parts = (R.paper.parts || []).filter(function (p) { return p.kind === "translation" || p.kind === "writing"; });
    if (!parts.length) return "";
    return '<div class="card mt-16"><h3>主观题</h3>' + parts.map(function (part) {
      var html = '<div class="model-answer mt-16"><div class="row row--between"><strong>' + u.esc(KY.views.exam.partTitle(part)) + "</strong>" + u.chip("满分 " + part.points) + "</div>";
      if (part.kind === "translation") {
        (part.sentences || []).forEach(function (s) {
          var draft = (R.attempt.drafts || {})["t:" + s.n] || "";
          html += '<div class="mt-8"><div class="small muted">(' + s.n + ") 你的翻译</div><div class=\"zh\">" + u.esc(draft || "（未作答）") + "</div>" +
            '<div class="small muted mt-8">参考译文</div><div class="en">' + u.esc(s.refZh || "暂无") + "</div></div>";
        });
      } else {
        var draft = (R.attempt.drafts || {})["w:" + part.id] || "";
        html += '<div class="small muted mt-8">你的作文</div><div class="zh">' + u.esc(draft || "（未作答）") + "</div>";
        if (part.model) html += '<details class="mt-8"><summary class="small muted">参考范文与中译</summary><div class="en mt-8">' + u.esc(part.model.essay || "") + '</div><div class="zh">' + u.esc(part.model.translation || "") + "</div></details>";
      }
      return html + "</div>";
    }).join("") + "</div>";
  }

  function pageHTML() {
    var all = [];
    (R.paper.parts || []).forEach(function (part) {
      (part.questions || []).forEach(function (q) { all.push({ part: part, q: q }); });
    });
    var wrong = all.filter(function (x) { return R.answers[x.q.n] !== x.q.answer; });
    var flagged = all.filter(function (x) { return R.flags && R.flags[x.q.n]; });
    var shown = filter === "wrong" ? wrong : filter === "flagged" ? flagged : all;
    var a = R.attempt;
    return '<div class="app-shell"><aside class="sidebar"><a class="brand" href="#/"><span class="brand__seal">研</span><span class="brand__text"><strong>研英</strong><small>逐题解析</small></span></a>' +
      '<nav class="nav">' + KY.ui.NAV.map(function (item) {
        return '<a class="nav__item" href="' + item.href + '">' + u.icon(item.icon) + "<span>" + item.label + "</span></a>";
      }).join("") + '</nav><div class="sidebar__foot"><a class="nav__item" href="#/papers">' + u.icon("papers") + "<span>返回真题库</span></a></div></aside>" +
      '<div class="main-wrap"><header class="topbar"><a class="topbar__brand" href="#/">研英</a><div class="topbar__actions"><a class="icon-btn" href="#/papers" aria-label="返回">' + u.icon("back") + "</a></div></header>" +
      '<main class="view"><header class="page-head"><div><p class="kicker">REVIEW</p><h1>' + u.esc(a.paperLabel || R.paper.label) + " · 逐题解析</h1><p class=\"muted\">" +
        u.esc(a.finishedAt ? new Date(a.finishedAt).toLocaleString("zh-CN") : "未完成") + " · " + (a.mode === "practice" ? "练习" : "模考") + " · 已答 " + (a.answered || 0) + "/" + (a.total || all.length) + " 题</p></div>" +
        '<div class="page-head__actions"><a class="btn btn--ghost btn--sm" href="#/exam/' + encodeURIComponent(R.paper.id) + '?mode=practice">再练一次</a></div></header>' +
      '<div class="stat-grid stat-grid--4"><div class="stat-card"><span class="stat-card__label">正确率</span><strong class="stat-card__value">' + (a.accuracy || 0) + "%</strong></div>" +
        '<div class="stat-card"><span class="stat-card__label">正确 / 总题</span><strong class="stat-card__value">' + (a.correct || 0) + "/" + all.length + "</strong></div>" +
        '<div class="stat-card"><span class="stat-card__label">错题</span><strong class="stat-card__value">' + wrong.length + "</strong></div>" +
        '<div class="stat-card"><span class="stat-card__label">标记</span><strong class="stat-card__value">' + flagged.length + "</strong></div></div>" +
      '<div class="segmented mt-16" id="review-filter"><button data-filter="all" class="' + (filter === "all" ? "is-active" : "") + '">全部 ' + all.length + '</button>' +
        '<button data-filter="wrong" class="' + (filter === "wrong" ? "is-active" : "") + '">错题 ' + wrong.length + '</button>' +
        '<button data-filter="flagged" class="' + (filter === "flagged" ? "is-active" : "") + '">标记 ' + flagged.length + "</button></div>" +
      '<div class="review-list mt-16">' + (shown.length ? shown.map(itemHTML).join("") : '<div class="empty"><h3>这里没有题目</h3><p>换一个筛选条件试试。</p></div>') + "</div>" +
      '<div class="row mt-24"><a class="btn btn--ghost" href="#/papers">返回真题库</a><a class="btn" href="#/exam/' + encodeURIComponent(R.paper.id) + '?mode=practice">继续练习</a></div>' +
      "</main></div></div>";
  }

  function mount(root, params) {
    params = params || {};
    filter = "all";
    var id = params.attemptId || params.id;
    var state = KY.store.state();
    var attempt = state.attempts[id];
    if (!attempt) {
      root.innerHTML = '<div class="boot"><div class="boot__mark">!</div><p>找不到这次作答记录。可能已被清理。</p><p><a class="btn btn--sm" href="#/papers">返回真题库</a></p></div>';
      return;
    }
    root.innerHTML = '<div class="boot"><div class="boot__mark">研</div><p>正在整理解析…</p></div>';
    KY.data.loadPaper(attempt.paperId).then(function (paper) {
      R = { attempt: attempt, paper: paper, answers: attempt.answers || {}, flags: attempt.flags || {} };
      root.innerHTML = pageHTML();
      bindFilters(root);
    }).catch(function (err) {
      root.innerHTML = '<div class="boot"><div class="boot__mark">!</div><p>加载失败：' + u.esc(err.message || err) + "</p></div>";
    });
  }

  function bindFilters(root) {
    root.querySelectorAll("#review-filter button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filter = btn.getAttribute("data-filter");
        root.innerHTML = pageHTML();
        bindFilters(root);
      });
    });
  }

  KY.views = KY.views || {};
  KY.views.review = {
    render: function () { return '<div class="boot"><div class="boot__mark">研</div><p>正在整理解析…</p></div>'; },
    mount: mount
  };
})();
