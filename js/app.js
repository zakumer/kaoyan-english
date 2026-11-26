/* Hash router, shell selection, and global search. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;
  var root = null;

  function parseHash() {
    var raw = String(location.hash || "").replace(/^#\/?/, "");
    var qi = raw.indexOf("?");
    var path = qi >= 0 ? raw.slice(0, qi) : raw;
    var query = {};
    if (qi >= 0) {
      raw.slice(qi + 1).split("&").forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split("=");
        query[decodeURIComponent(kv[0] || "")] = decodeURIComponent((kv[1] || "").replace(/\+/g, " "));
      });
    }
    var segs = path.split("/").filter(Boolean).map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    return { segs: segs, query: query };
  }

  function setTitle(text) {
    document.title = (text ? text + " · " : "") + "研英 · 考研英语一";
  }

  function notFound() {
    return '<div class="app-shell"><div class="boot"><div class="boot__mark">?</div><p>这个页面不存在。</p><p><a class="btn btn--sm" href="#/">回到今日</a></p></div></div>';
  }

  function route() {
    root = document.getElementById("app");
    if (!root) return;
    KY.ui.closeModal();
    var parsed = parseHash();
    var segs = parsed.segs;
    var query = parsed.query;
    var name = segs[0] || "dashboard";
    var params = { query: query };
    var view = null;
    var active = "dashboard";
    var title = "今日学习";
    var wrap = true;

    if (name === "dashboard" || name === "home") {
      view = KY.views.dashboard;
      active = "dashboard";
      title = "今日学习";
    } else if (name === "vocab" || name === "word") {
      view = KY.views.vocab;
      active = "vocab";
      title = name === "word" ? "词条" : "背单词";
      if (name === "word") params.word = segs[1] || "";
    } else if (name === "papers") {
      view = KY.views.papers;
      active = "papers";
      title = "真题库";
    } else if (name === "exam") {
      view = KY.views.exam;
      active = "papers";
      title = "模考";
      wrap = false;
      params.paperId = segs[1] || "";
      params.mode = query.mode === "practice" ? "practice" : "exam";
    } else if (name === "review") {
      view = KY.views.review;
      active = "papers";
      title = "逐题解析";
      wrap = false;
      params.attemptId = segs[1] || "";
    } else if (name === "reading") {
      view = KY.views.reading;
      active = "papers";
      title = "精读";
      wrap = false;
      params.paperId = segs[1] || "";
      params.textNo = segs[2] || "";
    } else if (name === "mistakes") {
      view = KY.views.mistakes;
      active = "mistakes";
      title = "错题本";
      wrap = false;
    } else if (name === "stats") {
      view = KY.views.stats;
      active = "stats";
      title = "学习统计";
      wrap = false;
    } else if (name === "settings") {
      view = KY.views.settings;
      active = "settings";
      title = "设置";
      wrap = false;
    }

    setTitle(title);
    if (!view) {
      root.innerHTML = notFound();
      return;
    }
    try {
      if (wrap) {
        root.innerHTML = KY.ui.shell(active, view.render(params));
        view.mount(root.querySelector("#view") || root, params);
      } else {
        root.innerHTML = view.render(params);
        view.mount(root, params);
      }
      if (name === "vocab" && query.mode === "new" && !params.word) {
        setTimeout(function () { KY.views.vocab.start("new"); }, 0);
      }
    } catch (err) {
      console.error(err);
      root.innerHTML = '<div class="boot"><div class="boot__mark">!</div><p>页面出错：' + u.esc(err.message || err) + '</p><p><a class="btn btn--sm" href="#/">回到今日</a></p></div>';
    }
    window.scrollTo(0, 0);
  }

  function searchResults(query) {
    var q = String(query || "").trim();
    var words = q ? KY.data.searchWords(q, 8) : KY.data.wordOrder().slice(0, 8);
    var papers = KY.data.allPapers().filter(function (p) {
      if (!q) return false;
      return String(p.year).indexOf(q) !== -1 || String(p.label || "").toLowerCase().indexOf(q.toLowerCase()) !== -1;
    }).slice(0, 5);
    var html = "";
    if (words.length) {
      html += '<p class="search-group">单词</p>' + words.map(function (w) {
        var item = KY.data.findWord(w) || {};
        return '<a class="search-result" href="#/word/' + encodeURIComponent(w) + '" data-close-modal><strong>' + u.esc(w) + '</strong><span>' + u.esc(item.gloss || "") + "</span>" + (item.ipa ? '<em>' + u.esc(item.ipa) + "</em>" : "") + "</a>";
      }).join("");
    }
    if (papers.length) {
      html += '<p class="search-group">真题</p>' + papers.map(function (p) {
        return '<a class="search-result" href="#/exam/' + encodeURIComponent(p.id) + '?mode=practice" data-close-modal><strong>' + u.esc(p.label) + '</strong><span>' + p.objectiveCount + " 道客观题 · " + (p.era === "modern" ? "英语一" : "旧卷") + "</span></a>";
      }).join("");
    }
    if (!html) html = '<p class="search-empty">没有找到匹配的单词或试卷。试试英文单词、年份，或中文释义。</p>';
    return html;
  }

  function openSearch() {
    var html = '<h2 class="modal__title">搜索</h2>' +
      '<div class="search-box search-box--modal">' + u.icon("search") + '<input class="input" id="global-search" placeholder="单词、中文释义或年份…" autocomplete="off"></div>' +
      '<div id="search-results" class="search-results"><p class="small muted">输入关键词开始搜索。</p></div>' +
      '<p class="small muted mt-16">快捷键：按 <b>/</b> 也可以打开搜索。</p>';
    var modal = KY.ui.modal(html);
    var input = modal.querySelector("#global-search");
    var results = modal.querySelector("#search-results");
    function update() { results.innerHTML = searchResults(input.value); }
    input.addEventListener("input", u.debounce(update, 120));
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        var first = results.querySelector("a");
        if (first) { event.preventDefault(); first.click(); }
      }
    });
    modal.querySelectorAll("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", function () { KY.ui.closeModal(); });
    });
    setTimeout(function () { input.focus(); }, 30);
    update();
  }

  function boot() {
    KY.ui.applyTheme();
    if (!root) root = document.getElementById("app");
    if (!KY.data.wordOrder().length) {
      console.warn("Word data is missing. Run: python tools/parse_words.py && python tools/build_data.py");
    }
    route();
    window.addEventListener("hashchange", route);
    document.addEventListener("keydown", function (event) {
      var tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        openSearch();
      }
    });
  }

  KY.app = { route: route, openSearch: openSearch };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
