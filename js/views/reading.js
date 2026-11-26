/* Close reading: article, clickable words, question explanations. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;
  var V = null;

  function lookup(raw) {
    var w = String(raw || "").toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "").replace(/'s$/, "");
    if (!w) return null;
    var tries = [w, w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, ""), w.replace(/ed$/, ""), w.replace(/ing$/, ""), w.replace(/ly$/, "")];
    for (var i = 0; i < tries.length; i++) {
      if (KY.data.findWord(tries[i])) return { word: tries[i], item: KY.data.findWord(tries[i]) };
    }
    return null;
  }

  function tokenHTML(text) {
    var safe = u.esc(text == null ? "" : text);
    return safe.replace(/[A-Za-z][A-Za-z'’-]*/g, function (m) {
      var found = lookup(m);
      var cls = "word";
      if (found) {
        cls += " is-known";
        var card = KY.store.getWord(found.word);
        if (card && card.status === "review") cls += " is-mastered";
      }
      return '<span class="' + cls + '" role="button" tabindex="0" data-word="' + u.attr(m) + '">' + m + "</span>";
    });
  }

  function readingParts(paper) {
    return (paper.parts || []).filter(function (p) { return p.kind === "reading"; });
  }

  function articleCard(part) {
    var first = part.passage && part.passage.paragraphs && part.passage.paragraphs[0];
    return '<a class="card card--link" href="#/reading/' + encodeURIComponent(V.paper.id) + "/" + part.textNo + '">' +
      '<div class="row row--between"><span class="kicker">TEXT ' + part.textNo + "</span>" + u.chip(part.questions.length + " 题") + "</div>" +
      "<h3 class=\"mt-8\">" + u.esc(part.passage.title || "Text " + part.textNo) + "</h3>" +
      '<p class="muted mt-8">' + u.esc((first && first.text || "").slice(0, 150)) + "…</p>" +
      '<div class="row mt-16"><span class="small muted">' + u.esc(part.directions || "") + "</span></div></a>";
  }

  function listPage() {
    var parts = readingParts(V.paper);
    return KY.ui.shell("papers", KY.ui.pageHead(V.paper.label + " · 精读", "CLOSE READING", '<a class="btn btn--ghost btn--sm" href="#/papers">' + u.icon("back") + "返回真题库</a>") +
      '<p class="muted">点开一篇，点任意英文单词查释义与真题例句；右侧可展开题目解析。</p>' +
      '<div class="paper-grid mt-16">' + (parts.length ? parts.map(articleCard).join("") : KY.ui.empty("这套卷没有阅读文章", "旧卷结构可能不同。")) + "</div>");
  }

  function articlePage(part) {
    var qs = part.questions || [];
    var state = KY.store.state();
    var known = [];
    (part.passage.paragraphs || []).forEach(function (p) {
      String(p.text || "").replace(/[A-Za-z][A-Za-z'’-]*/g, function (m) {
        var f = lookup(m);
        if (f && known.indexOf(f.word) < 0) known.push(f.word);
        return m;
      });
    });
    var knownCards = known.filter(function (w) { return !!state.vocab[w]; });
    return KY.ui.shell("papers", KY.ui.pageHead("Text " + part.textNo, V.paper.label + " · 精读", '<a class="btn btn--ghost btn--sm" href="#/reading/' + encodeURIComponent(V.paper.id) + '">' + u.icon("list") + "文章列表</a>") +
      '<div class="reading-layout">' +
        '<article class="reading-text"><div class="row row--between"><span class="kicker">TEXT ' + part.textNo + "</span>" + u.chip(qs.length + " 题") + "</div>" +
          "<h1 class=\"mt-8\">" + u.esc(part.passage.title || "Text " + part.textNo) + "</h1>" +
          '<p class="small muted mt-8">' + u.esc(part.directions || "") + "</p>" +
          '<div class="passage mt-24" id="article-body">' + (part.passage.paragraphs || []).map(function (p, i) {
            return '<div class="reading-para"><div class="reading-para__tools"><button type="button" class="icon-btn" data-action="speak" data-text="' + u.attr(p.text) + '" aria-label="朗读本段">' + u.icon("volume") + "</button></div><p>" + tokenHTML(p.text) + "</p></div>";
          }).join("") + "</div>" +
          '<p class="small muted mt-24">来源：<a href="' + u.attr(V.paper.sourceUrl) + '" target="_blank" rel="noopener">' + u.esc(V.paper.sourceUrl) + "</a> · 点词查询，朗读使用浏览器语音。</p>" +
        "</article>" +
        '<aside class="reading-side"><div class="card"><h3>本篇题目</h3>' + qs.map(function (q) {
          return '<details class="q-explain"><summary><span class="mono small">' + q.n + "</span> " + u.esc(q.stem || "第 " + q.n + " 题") + "</summary>" +
            '<div class="small muted mt-8">答案 <strong>' + u.esc(q.answer) + "</strong></div>" +
            KY.views.exam.explainHTML(q, part) + "</details>";
        }).join("") + "</div>" +
        '<div class="card mt-16"><h3>本篇命中词</h3>' + (knownCards.length ? knownCards.slice(0, 40).map(function (w) {
          return '<a class="chip" href="#/word/' + encodeURIComponent(w) + '">' + u.esc(w) + "</a>";
        }).join(" ") : '<p class="small muted">还没有标记生词。点文章里的词开始查。</p>') + "</div>" +
        '<div class="card mt-16"><h3>怎么用</h3><p class="small muted">先通读，遇到卡住的词点一下；读完再看题目解析。把不熟的词加入生词本，第二天会进入复习队列。</p></div>' +
        "</aside></div>");
  }

  function wordModal(raw) {
    var found = lookup(raw);
    var word = found ? found.word : String(raw || "").toLowerCase();
    var item = found ? found.item : null;
    var state = KY.store.state();
    var card = state.vocab[word];
    var html = '<h2 class="modal__title">' + u.esc(raw) + "</h2>";
    if (!item) {
      html += '<p class="modal__text">这个词不在 931 个考纲高频词与 217 个超纲高频词中。可以先记下，遇到真题例句时再补充。</p>' +
        '<div class="row"><button class="btn btn--ghost" data-close-modal>关闭</button></div>';
      KY.ui.modal(html);
      return;
    }
    html += '<div class="row mt-8">' + (item.ipa ? '<span class="ipa">' + u.esc(item.ipa) + "</span>" : "") +
      (item.pos ? '<span class="muted">' + u.esc(item.pos) + "</span>" : "") +
      (item.cefr ? u.chip(item.cefr) : "") + (item.freq ? u.chip("真题 " + item.freq + " 句") : "") + "</div>" +
      '<p class="mt-8">' + u.esc(item.gloss || "") + "</p>" +
      '<div class="row mt-16">' +
        '<button class="btn btn--sm" data-add-word="' + u.attr(word) + '">' + (card ? "已在生词本" : "加入生词本") + "</button>" +
        '<button class="btn btn--ghost btn--sm" data-action="speak" data-text="' + u.attr(word) + '">' + u.icon("volume") + "朗读</button>" +
        '<a class="btn btn--ghost btn--sm" href="#/word/' + encodeURIComponent(word) + '" data-close-modal>完整词条</a>' +
      "</div>" +
      '<div id="word-modal-examples" class="mt-16"><p class="small muted">正在加载真题例句…</p></div>';
    var root = KY.ui.modal(html);
    root.querySelectorAll("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); KY.ui.closeModal(); if (el.getAttribute("href")) location.hash = el.getAttribute("href"); });
    });
    root.querySelectorAll("[data-add-word]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!KY.store.getWord(word)) {
          KY.store.setWord(word, KY.srs.newCard(u.today()));
          toast("已加入生词本", "info");
        }
        btn.textContent = "已在生词本";
      });
    });
    KY.data.loadWordDetails().then(function () {
      var detail = KY.data.detailsFor(word);
      var box = document.getElementById("word-modal-examples");
      if (!box) return;
      if (!detail || !detail.examples || !detail.examples.length) {
        box.innerHTML = '<p class="small muted">暂无例句。</p>';
        return;
      }
      box.innerHTML = '<h4>真题例句</h4>' + detail.examples.slice(0, 3).map(function (ex) {
        return '<div class="mini-example"><div class="en">' + u.esc(ex.text) + '</div><div class="zh">' + u.esc(ex.translation) + "</div></div>";
      }).join("");
    }).catch(function () {
      var box = document.getElementById("word-modal-examples");
      if (box) box.innerHTML = '<p class="small muted">例句数据尚未生成。</p>';
    });
  }

  function render() {
    return '<div class="boot"><div class="boot__mark">研</div><p>正在翻开文章…</p></div>';
  }

  function mount(root, params) {
    params = params || {};
    var paperId = params.paperId || params.id;
    var textNo = params.textNo ? parseInt(params.textNo, 10) : null;
    if (!paperId) { root.innerHTML = '<div class="boot"><div class="boot__mark">!</div><p>没有指定试卷。</p></div>'; return; }
    KY.data.loadPaper(paperId).then(function (paper) {
      V = { paper: paper };
      if (!textNo) {
        root.innerHTML = listPage();
        return;
      }
      var part = readingParts(paper).filter(function (p) { return Number(p.textNo) === textNo; })[0];
      if (!part) { root.innerHTML = '<div class="boot"><div class="boot__mark">!</div><p>找不到这篇阅读。</p></div>'; return; }
      root.innerHTML = articlePage(part);
      if (!root.dataset.readingBound) {
        root.dataset.readingBound = "1";
        root.addEventListener("click", function (event) {
          var w = event.target.closest("[data-word]");
          if (w) { event.preventDefault(); wordModal(w.getAttribute("data-word")); }
        });
        root.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          var w = event.target.closest("[data-word]");
          if (w) { event.preventDefault(); wordModal(w.getAttribute("data-word")); }
        });
      }
    }).catch(function (err) {
      root.innerHTML = '<div class="boot"><div class="boot__mark">!</div><p>加载失败：' + u.esc(err.message || err) + "</p></div>";
    });
  }

  KY.views = KY.views || {};
  KY.views.reading = { render: render, mount: mount };
})();
