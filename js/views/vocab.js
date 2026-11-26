(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;
  var session = null;
  var listState = { query: "", list: "all", status: "all", cefr: "all", limit: 120 };
  var rootRef = null;
  var keysBound = false;

  function statusChip(word) {
    var card = KY.store.state().vocab[word];
    if (!card) return '<span class="chip">未学</span>';
    if (card.status === "review") return '<span class="chip chip--accent">已掌握</span>';
    if (card.status === "learning") return '<span class="chip chip--gold">学习中</span>';
    return '<span class="chip">新词</span>';
  }

  function wordRow(word, index) {
    var item = KY.data.findWord(word);
    if (!item) return "";
    return '<a class="word-row" href="#/word/' + encodeURIComponent(word) + '">' +
      '<span class="word-row__rank">' + (item.rank || item.overRank || index + 1) + "</span>" +
      '<span class="word-row__word">' + u.esc(word) + "</span>" +
      '<span class="chip chip--outline">' + u.esc(item.cefr || "—") + "</span>" +
      '<span class="word-row__gloss">' + u.esc(item.gloss || "") + "</span>" +
      '<span class="word-row__freq">' + (item.freq || 0) + " 句</span>" +
      '<span class="word-row__status">' + statusChip(word) + "</span>" +
    "</a>";
  }

  function filtered() {
    var order = KY.data.wordOrder();
    var q = listState.query.trim().toLowerCase();
    var out = [];
    for (var i = 0; i < order.length; i++) {
      var w = order[i];
      var item = KY.data.findWord(w);
      if (!item) continue;
      if (listState.list !== "all" && (item.lists || []).indexOf(listState.list) === -1) continue;
      if (listState.cefr !== "all" && item.cefr !== listState.cefr) continue;
      var card = KY.store.state().vocab[w];
      if (listState.status !== "all") {
        if (listState.status === "new" && card) continue;
        if (listState.status === "learning" && (!card || card.status !== "learning")) continue;
        if (listState.status === "review" && (!card || card.status !== "review")) continue;
      }
      if (q) {
        var hay = (w + " " + (item.gloss || "")).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }
      out.push(w);
    }
    return out;
  }

  function overview() {
    var meta = KY.data.wordMeta();
    var state = KY.store.state();
    var counts = KY.srs.counts(state.vocab, u.today());
    var today = KY.store.todayActivity();
    var due = counts.due;
    var newLeft = Math.max(0, (state.settings.dailyNew || 20) - today.newWords);
    var total = meta.total || 0;
    var rows = filtered();
    var shown = rows.slice(0, listState.limit);
    var cefrs = ["A1", "A2", "B1", "B2", "C1", "C2"];

    return KY.ui.pageHead("背单词", "VOCABULARY", '<button class="btn btn--sm" data-action="start-vocab">' + u.icon("play") + "开始今日学习</button>") +
      '<section class="vocab-hero">' +
        '<div><p class="kicker">SRS · SPACED REPETITION</p><h2>今天先记住 ' + Math.min(state.settings.dailyNew || 20, 99) + " 个</h2><p>到期复习 " + due + " 个，今日已学 " + today.newWords + " 个新词。每次只专注当前这一张卡。</p>" +
          '<div class="row mt-16 wrap">' +
            '<button class="btn" data-action="start-vocab">' + u.icon("play") + "开始学习</button>" +
            '<button class="btn btn--ghost" data-action="start-vocab-new">' + u.icon("spark") + "只学新词</button>" +
          "</div>" +
        "</div>" +
        '<div class="session-progress"><div class="row row--between small"><span>已掌握</span><b>' + counts.review + " / " + total + "</b></div>" + KY.ui.progress(counts.review, total, "", "gold") +
          '<div class="row row--between small mt-8"><span>学习中</span><b>' + counts.learning + "</b></div>" + KY.ui.progress(counts.learning, total, "", "") +
        "</div>" +
      "</section>" +
      '<div class="vocab-layout mt-16">' +
        '<section class="card card--flat">' +
          '<div class="toolbar">' +
            '<div class="search-box" style="flex:1;min-width:180px">' + u.icon("search") + '<input class="input" id="word-search" placeholder="搜索单词或中文释义…" value="' + u.attr(listState.query) + '"></div>' +
            '<div class="segmented" id="list-filter">' +
              '<button data-list="all" class="' + (listState.list === "all" ? "is-active" : "") + '">全部</button>' +
              '<button data-list="syllabus" class="' + (listState.list === "syllabus" ? "is-active" : "") + '">考纲 931</button>' +
              '<button data-list="over" class="' + (listState.list === "over" ? "is-active" : "") + '">超纲 217</button>' +
            "</div>" +
          "</div>" +
          '<div class="filter-row mt-8">' +
            '<select class="select" id="status-filter" style="width:auto">' +
              '<option value="all">全部状态</option><option value="new"' + (listState.status === "new" ? " selected" : "") + ">未学</option>" +
              '<option value="learning"' + (listState.status === "learning" ? " selected" : "") + ">学习中</option>" +
              '<option value="review"' + (listState.status === "review" ? " selected" : "") + ">已掌握</option>" +
            "</select>" +
            '<select class="select" id="cefr-filter" style="width:auto"><option value="all">全部 CEFR</option>' +
              cefrs.map(function (c) { return '<option value="' + c + '"' + (listState.cefr === c ? " selected" : "") + ">" + c + "</option>"; }).join("") +
            "</select>" +
            '<span class="small muted">共 ' + rows.length + " 个结果</span>" +
          "</div>" +
          '<div class="word-table">' +
            '<div class="word-row word-table__head"><span>#</span><span>单词</span><span>CEFR</span><span>释义</span><span>句频</span><span>状态</span></div>' +
            (shown.length ? shown.map(wordRow).join("") : '<div class="empty"><h3>没有匹配的词</h3><p>换个关键词，或清空筛选条件。</p></div>') +
          "</div>" +
          (rows.length > shown.length ? '<div class="list-more"><button class="btn btn--ghost" data-action="load-more">加载更多（' + (rows.length - shown.length) + "）</button></div>" : "") +
        "</section>" +
        '<aside class="vocab-side">' +
          '<section class="card"><div class="card__head"><h2 class="card__title">今日节奏</h2></div>' +
            '<div class="stack stack--sm">' +
              '<div class="row row--between small"><span>到期复习</span><b>' + due + "</b></div>" +
              '<div class="row row--between small"><span>新词目标</span><b>' + (state.settings.dailyNew || 20) + "</b></div>" +
              '<div class="row row--between small"><span>剩余新词</span><b>' + newLeft + "</b></div>" +
              '<div class="row row--between small"><span>今日复习</span><b>' + today.reviews + "</b></div>" +
            "</div>" +
          "</section>" +
          '<section class="card"><div class="card__head"><h2 class="card__title">怎么用</h2></div><p class="small muted">先看单词回想释义，点“显示答案”再自评。选“重来”会在今天再次出现；连续选“认识”会逐步拉长复习间隔。</p></section>' +
          '<section class="card card--flat"><div class="small muted">音标与例句来自词典页。点击任意单词进入词条，可听发音、看 20 条真题例句和逐句解析。</div></section>' +
        "</aside>" +
      "</div>";
  }

  function sessionCard() {
    if (!session || !session.active) return "";
    if (session.index >= session.queue.length) return sessionDone();
    var item = session.queue[session.index];
    var word = item.word;
    var data = KY.data.findWord(word) || { word: word, gloss: "", pos: "", cefr: "", ipa: "", freq: 0 };
    var p = u.pct(session.index, session.queue.length);
    return '<div class="row row--between wrap"><button type="button" class="btn btn--ghost btn--sm" data-action="exit-session">' + u.icon("back") + "退出</button><span class=\"chip chip--accent\">" + (session.index + 1) + " / " + session.queue.length + "</span></div>" +
      '<div class="progress mt-8">' + KY.ui.progress(session.index, session.queue.length, "", "gold").replace('class="progress"', 'class="progress"') + "</div>" +
      '<section class="flashcard mt-16">' +
        '<div class="flashcard__meta">' + (item.isNew ? '<span class="chip chip--gold">新词</span>' : '<span class="chip chip--rust">复习</span>') +
          '<span class="chip chip--outline">' + u.esc(data.cefr || "—") + "</span>" +
          (data.freq ? '<span class="chip">真题 ' + data.freq + " 句</span>" : "") +
        "</div>" +
        '<h2 class="flashcard__word">' + u.esc(word) + "</h2>" +
        (data.ipa ? '<div class="flashcard__ipa">' + u.esc(data.ipa) + "</div>" : "") +
        '<button class="icon-btn" data-action="speak-word" data-text="' + u.attr(word) + '" aria-label="朗读">' + u.icon("volume") + "</button>" +
        (session.revealed ? '<div class="flashcard__answer">' +
          (data.pos ? '<div class="flashcard__pos">' + u.esc(data.pos) + "</div>" : "") +
          '<div class="flashcard__gloss">' + u.esc(data.gloss || "暂无释义") + "</div>" +
          '<div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap">' +
            '<a class="btn btn--ghost btn--sm" href="#/word/' + encodeURIComponent(word) + '">' + u.icon("eye") + "词条与真题例句</a>" +
            '<button class="btn btn--ghost btn--sm" data-action="speak-word" data-text="' + u.attr(word) + '">' + u.icon("volume") + "朗读</button>" +
          "</div>" +
          '<div class="flashcard__prompt mt-8">这张卡记得怎么样？</div>' +
          '<div class="grade-row">' +
            '<button class="grade-btn grade-btn--again" data-grade="again"><b>重来</b><span>1 · 忘了</span></button>' +
            '<button class="grade-btn" data-grade="hard"><b>模糊</b><span>2 · 想不起</span></button>' +
            '<button class="grade-btn" data-grade="good"><b>认识</b><span>3 · 记得</span></button>' +
            '<button class="grade-btn grade-btn--easy" data-grade="easy"><b>很熟</b><span>4 · 秒懂</span></button>' +
          "</div>" +
          '<div class="key-hint">快捷键：1 重来 · 2 模糊 · 3 认识 · 4 很熟</div>' +
        "</div>" : '<div class="flashcard__prompt">先在心里回想它的意思，再显示答案</div><button class="btn btn--lg" data-action="reveal">显示答案 <span class="key-hint">Space</span></button>') +
      "</section>";
  }

  function sessionDone() {
    return '<section class="flashcard"><div class="empty__mark">' + u.icon("check") + "</div><h2 style=\"font-size:30px\">这一组完成了</h2>" +
      '<p class="muted">复习 ' + (session.reviews || 0) + " 个，新学 " + (session.newWords || 0) + " 个。休息一下，或者再来一组。</p>" +
      '<div class="row mt-16"><button class="btn" data-action="start-vocab">再来一组</button><a class="btn btn--ghost" href="#/">回到今日</a></div></section>';
  }

  function start(mode) {
    var state = KY.store.state();
    var today = u.today();
    var due = KY.srs.dueCards(state.vocab, today, state.settings.dailyReview || 100);
    var newLimit = Math.max(0, (state.settings.dailyNew || 20) - KY.store.todayActivity().newWords);
    var newWords = [];
    if (mode !== "review") {
      var order = KY.data.wordOrder();
      for (var i = 0; i < order.length && newWords.length < newLimit; i++) {
        if (!state.vocab[order[i]]) newWords.push(order[i]);
      }
    }
    var queue = [];
    if (mode !== "new") {
      due.forEach(function (c) {
        queue.push({ word: c.word, isNew: false });
      });
    }
    newWords.forEach(function (w) {
      queue.push({ word: w, isNew: true });
    });
    if (!queue.length) {
      KY.ui.toast("今天没有待学内容，去词库挑几个词吧", "info");
      return;
    }
    session = { active: true, done: false, queue: queue, index: 0, revealed: false, reviews: 0, newWords: 0, startedAt: Date.now() };
    renderInto();
  }

  function grade(g) {
    if (!session || !session.active || !session.revealed) return;
    var item = session.queue[session.index];
    var word = item.word;
    var card = KY.store.getWord(word) || KY.srs.newCard(u.today());
    var next = KY.srs.schedule(card, g, u.today());
    KY.store.setWord(word, next);
    if (g !== "again") {
      KY.store.record("review");
      session.reviews += 1;
    }
    if (item.isNew && g !== "again") {
      KY.store.record("new");
      session.newWords += 1;
    }
    session.index += 1;
    session.revealed = false;
    if (session.index >= session.queue.length) { session.done = true; session.active = false; }
    renderInto();
  }

  function renderInto() {
    if (!rootRef) return;
    rootRef.innerHTML = session && session.done ? sessionDone() : session && session.active ? sessionCard() : overview();
    mount(rootRef, {});
  }

  function wordDetail(word) {
    var item = KY.data.findWord(word);
    var card = KY.store.getWord(word);
    if (!item) return KY.ui.empty("没有这个词", "词库中找不到 " + word, '<a class="btn" href="#/vocab">返回词库</a>');
    return '<div class="row row--between wrap"><a class="btn btn--ghost btn--sm" href="#/vocab">' + u.icon("back") + '返回词库</a><div class="word-toolbar">' +
      '<button class="btn btn--ghost btn--sm" data-action="speak-word" data-text="' + u.attr(word) + '">' + u.icon("volume") + "朗读</button>" +
      '<button class="btn btn--ghost btn--sm" data-action="toggle-known">' + (card && card.status === "review" ? "标记为学习中" : "标记已掌握") + "</button></div></div>" +
      '<section class="card mt-16" id="word-detail-card"><div class="word-detail__head">' +
        '<div class="flashcard__meta" style="justify-content:flex-start">' + (item.lists || []).map(function (l) { return '<span class="chip ' + (l === "syllabus" ? "chip--accent" : "chip--gold") + '">' + (l === "syllabus" ? "考纲高频" : "超纲高频") + "</span>"; }).join("") + '<span class="chip chip--outline">' + u.esc(item.cefr || "—") + "</span></div>" +
        '<h1 class="word-detail__word">' + u.esc(word) + "</h1>" +
        '<div class="word-detail__ipa">' + u.esc(item.ipa || "音标加载中…") + "</div>" +
        (item.pos ? '<div class="flashcard__pos">' + u.esc(item.pos) + "</div>" : "") +
        '<p class="word-detail__gloss">' + u.esc(item.gloss || "") + "</p>" +
        '<div class="small muted">真题句频 ' + (item.freq || 0) + " · 例句 " + (item.exampleCount || 0) + " 条 · 排名 " + (item.rank || item.overRank || "—") + "</div>" +
      "</div>" +
      '<div id="word-detail-body" class="word-detail"><div class="small muted">正在加载真题例句…</div></div>' +
      '<div class="word-detail__head" style="border-bottom:0;border-top:1px solid var(--line);padding-top:16px"><div class="small muted">我的笔记</div><textarea class="textarea" id="word-note" placeholder="记下搭配、易混词或你的记忆法…">' + u.esc(KY.store.state().notes[word] || "") + "</textarea><button class=\"btn btn--ghost btn--sm\" data-action=\"save-note\" style=\"justify-self:start\">保存笔记</button></div>" +
      "</section>";
  }

  function renderWord(root, word) {
    var item = KY.data.findWord(word);
    if (!item) return;
    KY.data.loadWordDetails().then(function () {
      var details = KY.data.detailsFor(word) || { examples: [], senses: [] };
      var body = document.getElementById("word-detail-body");
      if (!body) return;
      var senses = (details.senses || []).map(function (s, i) {
        return '<div class="sense"><div class="sense__head"><span class="chip chip--outline">义项 ' + (i + 1) + "</span>" + (s.pos ? '<span class="chip">' + u.esc(s.pos) + "</span>" : "") + (s.cefr ? '<span class="chip chip--gold">' + u.esc(s.cefr) + "</span>" : "") + (s.pct ? '<span class="chip">' + u.esc(s.pct) + "</span>" : "") + '</div><div class="sense__zh">' + u.esc(s.zh || "") + "</div>" + (s.en ? '<div class="sense__en">' + u.esc(s.en) + "</div>" : "") + (s.note ? '<div class="sense__note">' + u.esc(s.note) + "</div>" : "") + "</div>";
      }).join("");
      var examples = (details.examples || []).slice(0, 20).map(function (ex) {
        var source = (ex.links || {}).paper || "";
        if (source.charAt(0) === "/") source = "https://english-exam.lazynote.cn" + source;
        return '<article class="example"><div class="example__meta">' + (ex.year ? '<span class="chip">' + u.esc(ex.year) + "</span>" : "") + (ex.badge ? '<span class="chip chip--accent">' + u.esc(ex.badge) + "</span>" : "") + (ex.cefr ? '<span class="chip chip--outline">' + u.esc(ex.cefr) + "</span>" : "") + (ex.module ? "<span>" + u.esc(ex.module) + "</span>" : "") + (ex.position ? "<span>· " + u.esc(ex.position) + "</span>" : "") + "</div>" +
          '<p class="example__en">' + u.highlightWord(ex.text || "", word) + "</p>" +
          (ex.translation ? '<p class="example__zh">' + u.esc(ex.translation) + "</p>" : "") +
          (ex.analysis ? '<p class="example__analysis">' + u.esc(ex.analysis) + "</p>" : "") +
          (source ? '<a class="small muted" href="' + u.attr(source) + '" target="_blank" rel="noopener">在源站查看整卷 →</a>' : "") +
        "</article>";
      }).join("");
      body.innerHTML = (senses ? '<div><h3 style="font-size:16px;margin-bottom:6px">词典义项</h3>' + senses + "</div>" : "") +
        '<div><h3 style="font-size:16px;margin-bottom:8px">真题例句</h3>' + (examples || '<p class="small muted">这个词暂无真题例句，可先记住释义和搭配。</p>') + "</div>";
    }).catch(function () {
      var body = document.getElementById("word-detail-body");
      if (body) body.innerHTML = '<p class="small muted">例句数据尚未生成或加载失败。可以先用释义和音标学习。</p>';
    });
  }

  function mount(root, params) {
    rootRef = root;
    params = params || {};
    if (params.word) {
      renderWord(root, params.word);
      var note = root.querySelector("#word-note");
      if (note) {
        note.addEventListener("input", u.debounce(function () {
          KY.store.state().notes[params.word] = note.value;
          KY.store.save();
        }, 300));
      }
      return;
    }
    if (session && (session.active || session.done)) {
      root.querySelectorAll("[data-action=\"start-vocab\"]").forEach(function (btn) {
        btn.addEventListener("click", function () { start("all"); });
      });
      root.querySelectorAll("[data-grade]").forEach(function (btn) {
        btn.addEventListener("click", function () { grade(btn.getAttribute("data-grade")); });
      });
      var reveal = root.querySelector('[data-action="reveal"]');
      if (reveal) reveal.addEventListener("click", function () { session.revealed = true; renderInto(); });
      var speak = root.querySelector('[data-action="speak-word"]');
      if (speak) speak.addEventListener("click", function () { u.speak(speak.getAttribute("data-text"), KY.store.state().settings.ttsRate); });
      var exit = root.querySelector('[data-action="exit-session"]');
      if (exit) exit.addEventListener("click", function () { session = null; renderInto(); });
      if (!keysBound) {
        keysBound = true;
        document.addEventListener("keydown", sessionKeys);
      }
      return;
    }

    var startBtn = root.querySelector('[data-action="start-vocab"]');
    if (startBtn) startBtn.addEventListener("click", function () { start("all"); });
    var startNew = root.querySelector('[data-action="start-vocab-new"]');
    if (startNew) startNew.addEventListener("click", function () { start("new"); });
    var search = root.querySelector("#word-search");
    if (search) {
      search.addEventListener("input", u.debounce(function () {
        listState.query = search.value;
        listState.limit = 120;
        renderInto();
      }, 180));
    }
    root.querySelectorAll("#list-filter button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        listState.list = btn.getAttribute("data-list");
        listState.limit = 120;
        renderInto();
      });
    });
    var status = root.querySelector("#status-filter");
    if (status) status.addEventListener("change", function () { listState.status = status.value; listState.limit = 120; renderInto(); });
    var cefr = root.querySelector("#cefr-filter");
    if (cefr) cefr.addEventListener("change", function () { listState.cefr = cefr.value; listState.limit = 120; renderInto(); });
    var more = root.querySelector('[data-action="load-more"]');
    if (more) more.addEventListener("click", function () { listState.limit += 120; renderInto(); });
    var known = root.querySelector('[data-action="toggle-known"]');
    if (known) known.addEventListener("click", function () {
      var word = params.word;
      var card = KY.store.getWord(word);
      if (card && card.status === "review") {
        card.status = "learning";
        card.due = u.today();
        KY.store.setWord(word, card);
        KY.ui.toast("已改为学习中", "info");
      } else {
        var c = card || KY.srs.newCard(u.today());
        c.status = "review";
        c.interval = 21;
        c.ease = Math.max(2.5, c.ease || 2.5);
        c.due = u.addDays(u.today(), 21);
        KY.store.setWord(word, c);
        KY.ui.toast("已标记为掌握", "ok");
      }
      if (params.word) {
        root.innerHTML = wordDetail(params.word);
        mount(root, { word: params.word });
      } else {
        renderInto();
      }
    });
    var saveNote = root.querySelector('[data-action="save-note"]');
    if (saveNote) saveNote.addEventListener("click", function () {
      var noteEl = root.querySelector("#word-note");
      if (noteEl) KY.store.state().notes[params.word] = noteEl.value;
      KY.store.save();
      KY.ui.toast("笔记已保存", "ok");
    });
    var speakBtn = root.querySelector('[data-action="speak-word"]');
    if (speakBtn) speakBtn.addEventListener("click", function () { u.speak(speakBtn.getAttribute("data-text"), KY.store.state().settings.ttsRate); });
  }

  function sessionKeys(event) {
    if (!session || !session.active) return;
    if (!rootRef || !document.body.contains(rootRef) || !rootRef.querySelector(".flashcard")) return;
    if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.code === "Space" && !session.revealed) {
      event.preventDefault();
      session.revealed = true;
      renderInto();
    } else if (["1", "2", "3", "4"].indexOf(event.key) !== -1 && session.revealed) {
      event.preventDefault();
      grade(["again", "hard", "good", "easy"][Number(event.key) - 1]);
    }
  }

  function render(params) {
    params = params || {};
    if (params.word) return wordDetail(params.word);
    if (session && session.done) return sessionDone();
    if (session && session.active) return sessionCard();
    return overview();
  }

  KY.views = KY.views || {};
  KY.views.vocab = { render: render, mount: mount, start: start };
})();
