/* Exam / practice engine: one paper at a time, with autosave and review. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;
  var S = null;
  var timer = null;

  function objParts(paper) {
    return (paper.parts || []).filter(function (p) {
      return p.kind !== "translation" && p.kind !== "writing" && p.questions && p.questions.length;
    });
  }

  function allQuestions(paper) {
    var out = [];
    objParts(paper).forEach(function (p) {
      p.questions.forEach(function (q) { out.push({ part: p, q: q }); });
    });
    return out;
  }

  function partQuestions(part) {
    return (part && part.questions) || [];
  }

  function partShort(part) {
    if (part.kind === "cloze") return "完形";
    if (part.kind === "reading") return "Text " + (part.textNo || "");
    if (part.kind === "ordering") return "排序";
    if (part.kind === "matching") return "匹配";
    if (part.kind === "heading") return "小标题";
    if (part.kind === "translation") return "翻译";
    if (part.kind === "writing") return part.id.indexOf("part-b") >= 0 ? "写作 B" : "写作 A";
    return part.title || part.kind;
  }

  function partTitle(part) {
    if (part.kind === "reading") return "Text " + (part.textNo || "") + " 阅读";
    return part.title || partShort(part);
  }

  function modeLabel() {
    return S.mode === "practice" ? "练习模式" : "模考模式";
  }

  function draftKey(part, n) {
    return part.kind === "translation" ? "t:" + n : "w:" + part.id;
  }

  function getDraft(part, n) {
    return S.attempt.drafts[draftKey(part, n)] || "";
  }

  function setDraft(part, n, value) {
    S.attempt.drafts[draftKey(part, n)] = value;
    persist();
  }

  function persist() {
    if (!S || !S.attempt) return;
    S.attempt.answers = S.answers;
    S.attempt.flags = S.flags;
    S.attempt.partIndex = S.partIndex;
    S.attempt.qn = S.qn;
    S.attempt.elapsed = Math.floor((Date.now() - S.started) / 1000);
    KY.store.saveAttempt(S.attempt);
  }

  function newAttempt(paper, mode) {
    var configured = KY.store.state().settings.examMinutes;
    var minutes = mode === "exam" ? (Number(configured) || paper.timeLimitMin || 180) : 0;
    return {
      id: "att-" + paper.id + "-" + mode + "-" + Date.now(),
      paperId: paper.id,
      paperLabel: paper.label,
      year: paper.year,
      mode: mode,
      startedAt: new Date().toISOString(),
      deadline: mode === "exam" ? Date.now() + minutes * 60000 : null,
      finishedAt: "",
      elapsed: 0,
      answers: {},
      flags: {},
      drafts: {},
      selfScores: {},
      completed: false
    };
  }

  function findResume(paperId, mode) {
    var state = KY.store.state();
    var list = Object.keys(state.attempts).map(function (id) { return state.attempts[id]; })
      .filter(function (a) {
        return a.paperId === paperId && a.mode === mode && !a.completed &&
          a.startedAt && (Date.now() - new Date(a.startedAt).getTime()) < 48 * 3600 * 1000;
      })
      .sort(function (a, b) { return String(b.startedAt).localeCompare(String(a.startedAt)); });
    return list[0] || null;
  }

  function firstPartWithWork(paper) {
    for (var i = 0; i < paper.parts.length; i++) {
      if (paper.parts[i].questions && paper.parts[i].questions.length) return i;
    }
    return 0;
  }

  function firstQ(part) {
    var qs = partQuestions(part);
    return qs.length ? qs[0].n : null;
  }

  function currentPart() {
    return S.paper.parts[S.partIndex] || S.paper.parts[0];
  }

  function currentQ() {
    var qs = partQuestions(currentPart());
    for (var i = 0; i < qs.length; i++) if (qs[i].n === S.qn) return qs[i];
    return qs[0] || null;
  }

  function findPartByQ(n) {
    for (var i = 0; i < S.paper.parts.length; i++) {
      var qs = partQuestions(S.paper.parts[i]);
      for (var j = 0; j < qs.length; j++) if (qs[j].n === n) return i;
    }
    return -1;
  }

  function answeredCount() {
    return allQuestions(S.paper).filter(function (item) { return !!S.answers[item.q.n]; }).length;
  }

  function blankify(text) {
    var safe = u.esc(text == null ? "" : text);
    return safe.replace(/\{\{(\d+)\}\}/g, function (_, n) {
      var ans = S.answers[n] || "";
      var cls = "blank" + (ans ? " is-filled" : "") + (String(n) === String(S.qn) ? " is-current" : "");
      return '<button type="button" class="' + cls + '" data-goto-q="' + n + '" title="跳转到第 ' + n + ' 题">' + u.esc(ans || n) + "</button>";
    });
  }

  function paragraphsHTML(paragraphs) {
    return (paragraphs || []).map(function (p) {
      return "<p>" + blankify(p.text) + "</p>";
    }).join("");
  }

  function passagePane() {
    var part = currentPart();
    var html = "";
    if (part.kind === "cloze") {
      html += '<div class="passage-head"><h2>' + u.esc(part.title) + "</h2>" + u.chip((part.questions || []).length + " 题 · " + (part.points || 0) + " 分") + "</div>";
      if (part.directions) html += '<p class="small muted mb-16">' + u.esc(part.directions) + "</p>";
      html += '<div class="passage">' + paragraphsHTML(part.passage && part.passage.paragraphs) + "</div>";
    } else if (part.kind === "reading") {
      html += '<div class="passage-head"><h2>' + u.esc(partTitle(part)) + "</h2>" + u.chip(part.questions.length + " 题 · " + (part.points || 0) + " 分") + "</div>";
      if (part.directions) html += '<p class="small muted mb-16">' + u.esc(part.directions) + "</p>";
      html += '<div class="passage">' + paragraphsHTML(part.passage && part.passage.paragraphs) + "</div>";
    } else if (part.kind === "ordering") {
      html += '<div class="passage-head"><h2>' + u.esc(part.title) + "</h2>" + u.chip("5 题 · " + (part.points || 0) + " 分") + "</div>";
      if (part.directions) html += '<p class="small muted mb-16">' + u.esc(part.directions) + "</p>";
      html += '<div class="passage">';
      (part.paragraphs || []).forEach(function (p) {
        html += '<p><span class="para-no">[' + u.esc(p.label) + "]</span>" + u.esc(p.text) + "</p>";
      });
      html += "</div>";
      html += '<p class="small muted mt-16">已将可确定的段落放入链条；在对应空位选择其余段落。答案会自动保存。</p>';
    } else if (part.kind === "matching" || part.kind === "heading") {
      html += '<div class="passage-head"><h2>' + u.esc(part.title) + "</h2>" + u.chip("5 题 · " + (part.points || 0) + " 分") + "</div>";
      if (part.directions) html += '<p class="small muted mb-16">' + u.esc(part.directions) + "</p>";
      html += '<div class="passage">' + paragraphsHTML(part.passage && part.passage.paragraphs) + "</div>";
    } else if (part.kind === "translation") {
      html += '<div class="passage-head"><h2>' + u.esc(part.title) + "</h2>" + u.chip((part.sentences || []).length + " 句 · " + (part.points || 0) + " 分") + "</div>";
      if (part.directions) html += '<p class="small muted mb-16">' + u.esc(part.directions) + "</p>";
      html += '<div class="passage">';
      (part.sentences || []).forEach(function (s) {
        html += '<p><span class="para-no">(' + s.n + ")</span>" + u.esc(s.en) + "</p>";
      });
      html += "</div>";
    } else if (part.kind === "writing") {
      html += '<div class="passage-head"><h2>' + u.esc(part.title) + "</h2>" + u.chip(part.points + " 分") + "</div>";
      html += '<div class="subjective__prompt"><div class="en">' + u.esc(part.prompt || part.directions || "") + "</div>";
      if (part.image) {
        var src = part.image.local || part.image.src;
        html += '<p class="mt-16"><img class="writing-image" src="' + u.attr(src) + '" alt="' + u.attr(part.image.alt || "写作题目图片") + '" loading="lazy"></p>';
        html += '<p class="small muted">图片来自源站；若离线未下载，可先看文字说明。</p>';
      }
      html += "</div>";
    }
    html += '<p class="small muted mt-24">来源：<a href="' + u.attr(S.paper.sourceUrl) + '" target="_blank" rel="noopener">' + u.esc(S.paper.sourceUrl) + "</a></p>";
    return html;
  }

  function qnavHTML(part) {
    var qs = partQuestions(part);
    if (!qs.length) return "";
    return '<div class="qnav">' + qs.map(function (q) {
      var cls = "qnav__btn";
      if (S.answers[q.n]) cls += " is-answered";
      if (S.qn === q.n) cls += " is-current";
      if (S.flags[q.n]) cls += " is-flagged";
      return '<button type="button" class="' + cls + '" data-goto-q="' + q.n + '" title="第 ' + q.n + ' 题">' + q.n + "</button>";
    }).join("") + "</div>";
  }

  function optionHTML(q, opt) {
    var selected = S.answers[q.n] === opt.key;
    var reveal = S.mode === "practice" && !!S.answers[q.n];
    var cls = "option";
    if (selected) cls += " is-selected";
    if (reveal) {
      if (opt.key === q.answer) cls += " is-correct";
      else if (selected) cls += " is-wrong";
    }
    return '<button type="button" class="' + cls + '" data-answer="' + q.n + '" data-key="' + u.attr(opt.key) + '">' +
      '<span class="option__key">' + u.esc(opt.key) + "</span><span class=\"option__text\">" + u.esc(opt.text) + "</span></button>";
  }

  function questionBlock(q, part) {
    var reveal = S.mode === "practice" && !!S.answers[q.n];
    var html = '<div class="question-block">' +
      '<div class="question-block__head"><div class="q-number">' + q.n + "</div><div>" +
        (q.stem ? '<div class="q-stem q-stem-en">' + u.esc(q.stem) + "</div>" : '<div class="q-stem">第 ' + q.n + " 题</div>") +
        (q.explanation && q.explanation.stemZh && q.explanation.stemZh.indexOf(String(q.n)) !== 0 ? '<div class="small muted mt-8">' + u.esc(q.explanation.stemZh) + "</div>" : "") +
      "</div></div>" +
      '<div class="options">' + (q.options || []).map(function (opt) { return optionHTML(q, opt); }).join("") + "</div>" +
      '<div class="row row--between mt-8"><button type="button" class="btn btn--ghost btn--sm" data-flag="' + q.n + '">' + u.icon("flag") + (S.flags[q.n] ? "取消标记" : "标记") + "</button>" +
        (q.stem ? '<button type="button" class="btn btn--ghost btn--sm" data-action="speak" data-text="' + u.attr(q.stem) + '">' + u.icon("volume") + "朗读</button>" : "") +
      "</div>";
    if (reveal) html += explainHTML(q, part);
    else if (S.mode === "exam") html += '<p class="small muted mt-8">答案自动保存；交卷后查看逐题解析。</p>';
    html += "</div>";
    return html;
  }

  function selectOptions(q, part) {
    var list = (q.options && q.options.length) ? q.options : (part.choices || []);
    return list.map(function (o) {
      return '<option value="' + u.attr(o.key) + '"' + (S.answers[q.n] === o.key ? " selected" : "") + ">" + u.esc(o.key) + ". " + u.esc(o.text) + "</option>";
    }).join("");
  }

  function partBQuestion(q, part) {
    var answered = S.answers[q.n];
    var html = '<div class="subjective__prompt">' +
      '<div class="row row--between"><strong>第 ' + q.n + " 题</strong>" + (answered ? u.chip("已选 " + answered, "accent") : u.chip("未选")) + "</div>" +
      (q.explanation && q.explanation.stemZh ? '<div class="small muted mt-8">' + u.esc(q.explanation.stemZh) + "</div>" : "") +
      '<label class="field mt-8"><span>选择答案</span><select class="select" data-select-q="' + q.n + '"><option value="">— 请选择 —</option>' + selectOptions(q, part) + "</select></label>";
    if (S.mode === "practice" && answered) html += explainHTML(q, part);
    html += "</div>";
    return html;
  }

  function orderingPane(part) {
    var chain = String(part.chain || "").split("→").map(function (s) { return s.trim(); }).filter(Boolean);
    var html = '<div class="ordering-slots">';
    if (chain.length) {
      chain.forEach(function (token) {
        var m = token.match(/^(\d{2})\.?$/);
        if (m || /^\d{2}$/.test(token)) {
          var n = parseInt(token, 10);
          var q = (part.questions || []).filter(function (x) { return x.n === n; })[0];
          html += '<div class="ordering-slot"><span class="ordering-slot__no">' + n + "</span>" +
            '<select class="select" data-order-q="' + n + '"><option value="">— 选择段落 —</option>' +
            (part.paragraphs || []).map(function (p) {
              return '<option value="' + u.attr(p.label) + '"' + (S.answers[n] === p.label ? " selected" : "") + ">[" + u.esc(p.label) + "] " + u.esc(p.text.slice(0, 80)) + (p.text.length > 80 ? "…" : "") + "</option>";
            }).join("") + "</select></div>";
          if (q && S.mode === "practice" && S.answers[n]) html += '<div class="ordering-slot" style="grid-template-columns:1fr"><div>' + explainHTML(q, part) + "</div></div>";
        } else {
          html += '<div class="ordering-slot"><span class="ordering-slot__no">已给</span><strong style="font-family:var(--serif);font-size:18px">[' + u.esc(token) + "]</strong></div>";
        }
      });
    } else {
      (part.questions || []).forEach(function (q) {
        html += '<div class="ordering-slot"><span class="ordering-slot__no">' + q.n + "</span>" +
          '<select class="select" data-order-q="' + q.n + '"><option value="">— 选择段落 —</option>' +
          (part.paragraphs || []).map(function (p) {
            return '<option value="' + u.attr(p.label) + '"' + (S.answers[q.n] === p.label ? " selected" : "") + ">[" + u.esc(p.label) + "] " + u.esc(p.text.slice(0, 80)) + "</option>";
          }).join("") + "</select></div>";
      });
    }
    html += "</div>";
    if (S.mode === "practice") {
      html += '<details class="mt-16"><summary class="small muted">查看顺序解析</summary><div class="explain-box">' +
        '<div class="explain-box__row"><span class="explain-box__label">正确顺序</span><span class="explain-box__text">' + u.esc((part.order || []).join(" → ")) + "</span></div>" +
        (part.orderChain ? '<div class="explain-box__row"><span class="explain-box__label">链条</span><span class="explain-box__text">' + u.esc(part.orderChain) + "</span></div>" : "") +
        (part.seams ? '<div class="explain-box__row"><span class="explain-box__label">衔接</span><span class="explain-box__text">' + (Array.isArray(part.seams) ? part.seams.map(function (s) { return u.esc(s); }).join("<br>") : u.esc(part.seams)) + "</span></div>" : "") +
        "</div></details>";
    }
    return html;
  }

  function translationPane(part) {
    return '<div class="subjective">' + (part.sentences || []).map(function (s) {
      var val = getDraft(part, s.n);
      return '<div class="subjective__prompt">' +
        '<div class="row row--between"><strong>(' + s.n + ")</strong>" + u.chip("参考译文 " + (S.mode === "practice" ? "可看" : "交卷后")) + "</div>" +
        '<div class="en mt-8">' + u.esc(s.en) + "</div>" +
        '<textarea class="textarea mt-8" rows="3" data-draft="' + s.n + '" placeholder="写下你的翻译…">' + u.esc(val) + "</textarea>" +
        (S.mode === "practice" && s.refZh ? '<details class="mt-8"><summary class="small muted">参考译文与意群</summary><div class="explain-box"><div class="explain-box__row"><span class="explain-box__label">参考</span><span class="explain-box__text">' + u.esc(s.refZh) + "</span></div>" + (s.chunks || []).map(function (c) {
          return '<div class="explain-box__row"><span class="explain-box__label">' + u.esc(c.role || "意群") + '</span><span class="explain-box__text">' + u.esc(c.en) + " → " + u.esc(c.lit || "") + (c.note ? "（" + u.esc(c.note) + "）" : "") + "</span></div>";
        }).join("") + "</div></details>" : "") +
      "</div>";
    }).join("") + "</div>";
  }

  function writingPane(part) {
    var val = getDraft(part, null);
    var words = (String(val).trim().match(/[A-Za-z']+/g) || []).length;
    var html = '<div class="subjective">' +
      '<div class="subjective__prompt"><div class="row row--between"><strong>写作任务</strong>' + u.chip(part.points + " 分") + "</div>" +
        '<div class="en mt-8">' + u.esc(part.prompt || part.directions || "") + "</div></div>" +
      '<textarea class="textarea" rows="12" data-draft="writing" data-wordcount="wc" placeholder="在这里起草作文…">' + u.esc(val) + "</textarea>" +
      '<div class="count-row"><span>草稿会自动保存在本机</span><span id="wc">' + words + " words</span></div>";
    if (S.mode === "practice" && part.model) html += modelHTML(part);
    html += "</div>";
    return html;
  }

  function modelHTML(part) {
    var m = part.model || {};
    return '<details class="model-answer mt-8"><summary class="model-toggle small muted">参考范文 / 中译 / 拆解</summary>' +
      '<div class="en mt-8">' + u.esc(m.essay || "暂无范文") + "</div>" +
      (m.translation ? '<div class="zh">' + u.esc(m.translation) + "</div>" : "") +
      (m.breakdown || []).map(function (b) {
        return '<div class="small muted mt-8"><strong>' + u.esc(b.tag || "") + " " + u.esc(b.core || "") + "</strong><br>" + u.esc(b.text || "") + "</div>";
      }).join("") + "</details>";
  }

  function questionPane() {
    var part = currentPart();
    var html = qnavHTML(part);
    if (part.kind === "cloze" || part.kind === "reading") {
      var q = currentQ();
      html += q ? questionBlock(q, part) : '<div class="empty">本部分没有题目。</div>';
    } else if (part.kind === "ordering") {
      html += '<p class="small muted mb-16">' + u.esc(part.directions || "选择每个空位对应的段落。") + "</p>" + orderingPane(part);
    } else if (part.kind === "matching" || part.kind === "heading") {
      html += '<p class="small muted mb-16">' + u.esc(part.directions || "为每个空位选择最合适的选项。") + "</p>" +
        (part.questions || []).map(function (q) { return partBQuestion(q, part); }).join("");
    } else if (part.kind === "translation") {
      html += translationPane(part);
    } else if (part.kind === "writing") {
      html += writingPane(part);
    } else {
      html += '<div class="empty">未知题型：' + u.esc(part.kind) + "</div>";
    }
    return html;
  }

  function explainHTML(q, part) {
    var e = q.explanation;
    if (!e) {
      return '<div class="explain-box"><div class="explain-box__head">' + u.chip("暂无逐题解析", "outline") + "</div>" +
        '<p class="explain-box__text">本题未抓到逐题解析。正确答案：<strong>' + u.esc(q.answer || "—") + "</strong>。可回到源站查看完整解析。</p></div>";
    }
    var html = '<div class="explain-box"><div class="explain-box__head">' + u.chip("答案 " + (e.answer || q.answer || "—"), "accent") +
      (e.type ? u.chip(e.type) : "") + (e.stemZh ? u.chip("题干中译", "outline") : "") + "</div>";
    if (e.stemZh) html += '<div class="explain-box__row"><span class="explain-box__label">题干</span><span class="explain-box__text">' + u.esc(e.stemZh) + "</span></div>";
    if (e.analysis) {
      if (e.analysis.type) html += '<div class="explain-box__row"><span class="explain-box__label">判型</span><span class="explain-box__text">' + u.esc(e.analysis.type) + "</span></div>";
      if (e.analysis.parse) html += '<div class="explain-box__row"><span class="explain-box__label">拆句</span><span class="explain-box__text">' + u.esc(e.analysis.parse) + "</span></div>";
      if (e.analysis.locateEn) html += '<div class="explain-box__row"><span class="explain-box__label">定位</span><span class="explain-box__text en">' + u.esc(e.analysis.locateEn) + "</span></div>";
      if (e.analysis.locateZh) html += '<div class="explain-box__row"><span class="explain-box__label">定位中译</span><span class="explain-box__text">' + u.esc(e.analysis.locateZh) + "</span></div>";
      if (e.choicesZh) {
        html += '<div class="explain-box__row"><span class="explain-box__label">选项中译</span><span class="explain-box__text">' +
          Object.keys(e.choicesZh).map(function (k) { return "<strong>" + k + "</strong>. " + u.esc(e.choicesZh[k]); }).join("<br>") + "</span></div>";
      }
      if (e.analysis.options) {
        var correct = e.analysis.options[q.answer];
        if (correct && correct.note) html += '<div class="explain-box__row"><span class="explain-box__label">正确项</span><span class="explain-box__text">' + u.esc(correct.note) + "</span></div>";
        var wrong = Object.keys(e.analysis.options).filter(function (k) { return k !== q.answer; });
        if (wrong.length) {
          html += '<details class="mt-8"><summary class="small muted">其他选项为什么错</summary>' + wrong.map(function (k) {
            var o = e.analysis.options[k];
            return '<div class="explain-box__row"><span class="explain-box__label">' + k + "</span><span class=\"explain-box__text\">" + u.esc(o.note || "") + "</span></div>";
          }).join("") + "</details>";
        }
      }
    }
    if (e.reason) html += '<div class="explain-box__row"><span class="explain-box__label">理由</span><span class="explain-box__text">' + u.esc(e.reason) + "</span></div>";
    if (e.choiceEn) html += '<div class="explain-box__row"><span class="explain-box__label">正确句</span><span class="explain-box__text en">' + u.esc(e.choiceEn) + "</span></div>";
    if (e.clues && e.clues.length) html += '<div class="explain-box__row"><span class="explain-box__label">线索</span><span class="explain-box__text">' + e.clues.map(function (c) { return "• " + u.esc(c); }).join("<br>") + "</span></div>";
    html += "</div>";
    return html;
  }

  function headerHTML() {
    return '<header class="exam-top">' +
      '<button type="button" class="icon-btn" data-exam-back aria-label="退出">' + u.icon("back") + "</button>" +
      '<div class="exam-top__title"><strong>' + u.esc(S.paper.label) + "</strong><span>" + u.esc(modeLabel()) + " · " + S.paper.objectiveCount + " 道客观题</span></div>" +
      '<div class="exam-top__right">' +
        '<div class="timer" id="exam-timer">--:--</div>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-exam-sheet>' + u.icon("list") + "答题卡</button>" +
        '<button type="button" class="btn btn--sm" data-exam-submit>交卷</button>' +
      "</div>" +
    "</header>";
  }

  function tabsHTML() {
    return '<div class="section-tabs exam-tabs">' + S.paper.parts.map(function (part, i) {
      var qs = partQuestions(part);
      var count = qs.length ? qs.length : (part.kind === "translation" ? (part.sentences || []).length : 1);
      return '<button type="button" class="' + (i === S.partIndex ? "is-active" : "") + '" data-part="' + i + '">' +
        u.esc(partShort(part)) + ' <span class="chip chip--outline" style="margin-left:4px">' + count + "</span></button>";
    }).join("") + "</div>";
  }

  function footerHTML() {
    var qs = partQuestions(currentPart());
    var idx = qs.map(function (q) { return q.n; }).indexOf(S.qn);
    return '<footer class="exam-footer">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-prev ' + (idx <= 0 ? "disabled" : "") + ">上一题</button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-next ' + (idx < 0 || idx >= qs.length - 1 ? "disabled" : "") + ">下一题</button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-flag="' + (S.qn || "") + '" ' + (qs.length ? "" : "disabled") + ">" + u.icon("flag") + "标记</button>" +
      '<span class="exam-footer__spacer"></span>' +
      '<span class="exam-footer__hint">已答 ' + answeredCount() + " / " + S.paper.objectiveCount + "</span>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-exam-sheet>答题卡</button>' +
    "</footer>";
  }

  function examHTML() {
    return '<div class="exam-shell">' + headerHTML() + tabsHTML() +
      '<div class="exam-body"><section class="passage-pane" id="passage-pane">' + passagePane() +
      '</section><section class="question-pane" id="question-pane">' + questionPane() + "</section></div>" +
      footerHTML() + "</div>";
  }

  function refresh() {
    var root = S && S.root;
    if (!root) return;
    var pp = root.querySelector("#passage-pane");
    var qp = root.querySelector("#question-pane");
    if (pp) pp.innerHTML = passagePane();
    if (qp) qp.innerHTML = questionPane();
    var tabs = root.querySelector(".exam-tabs");
    if (tabs) tabs.outerHTML = tabsHTML();
    var footer = root.querySelector(".exam-footer");
    if (footer) footer.outerHTML = footerHTML();
    updateTimer();
  }

  function updateTimer() {
    if (!S) return;
    var el = document.getElementById("exam-timer");
    if (!el) return;
    var now = Date.now();
    var sec;
    if (S.mode === "exam" && S.attempt.deadline) {
      sec = Math.max(0, Math.round((S.attempt.deadline - now) / 1000));
      el.textContent = u.fmtDuration(sec);
      el.classList.toggle("is-low", sec <= 300);
      if (sec <= 0 && !S.submitted) {
        toast("时间到，自动交卷", "warn");
        finalize(true);
      }
    } else {
      sec = Math.floor((now - S.started) / 1000);
      el.textContent = u.fmtDuration(sec);
      el.classList.remove("is-low");
    }
  }

  function startTimer() {
    clearInterval(timer);
    updateTimer();
    timer = setInterval(updateTimer, 1000);
  }

  function goPart(i) {
    if (i < 0 || i >= S.paper.parts.length) return;
    S.partIndex = i;
    S.qn = firstQ(S.paper.parts[i]);
    persist();
    refresh();
  }

  function goQ(n) {
    var i = findPartByQ(n);
    if (i < 0) return;
    S.partIndex = i;
    S.qn = n;
    persist();
    refresh();
    var qp = document.getElementById("question-pane");
    if (qp) qp.scrollTop = 0;
  }

  function choose(n, key) {
    S.answers[n] = key;
    persist();
    refresh();
  }

  function toggleFlag(n) {
    if (!n) return;
    S.flags[n] = !S.flags[n];
    persist();
    refresh();
  }

  function nextQ() {
    var qs = partQuestions(currentPart());
    var idx = qs.map(function (q) { return q.n; }).indexOf(S.qn);
    if (idx >= 0 && idx < qs.length - 1) goQ(qs[idx + 1].n);
    else if (S.partIndex < S.paper.parts.length - 1) goPart(S.partIndex + 1);
  }

  function prevQ() {
    var qs = partQuestions(currentPart());
    var idx = qs.map(function (q) { return q.n; }).indexOf(S.qn);
    if (idx > 0) goQ(qs[idx - 1].n);
    else if (S.partIndex > 0) {
      var prev = S.paper.parts[S.partIndex - 1];
      var pqs = partQuestions(prev);
      S.partIndex = S.partIndex - 1;
      S.qn = pqs.length ? pqs[pqs.length - 1].n : null;
      persist();
      refresh();
    }
  }

  function answerSheet() {
    var html = '<h2 class="modal__title">答题卡</h2><p class="modal__text">已答 ' + answeredCount() + " / " + S.paper.objectiveCount + "。点击题号跳转。</p>";
    objParts(S.paper).forEach(function (part) {
      html += '<h3 class="small muted mt-16">' + u.esc(partShort(part)) + "</h3><div class=\"answer-grid\">";
      part.questions.forEach(function (q) {
        var cls = "answer-cell";
        if (S.answers[q.n]) cls += " is-answered";
        if (S.flags[q.n]) cls += " is-flagged";
        if (S.qn === q.n) cls += " is-current";
        html += '<button type="button" class="' + cls + '" data-goto-q="' + q.n + '">' + q.n + "</button>";
      });
      html += "</div>";
    });
    var root = KY.ui.modal(html, { wide: true });
    root.querySelectorAll("[data-goto-q]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        KY.ui.closeModal();
        goQ(parseInt(btn.getAttribute("data-goto-q"), 10));
      });
    });
  }

  function grade() {
    var rows = [];
    var total = 0, correct = 0, answered = 0, maxObjective = 0, score = 0;
    objParts(S.paper).forEach(function (part) {
      var qs = part.questions;
      var partCorrect = 0, partAnswered = 0;
      qs.forEach(function (q) {
        total += 1;
        if (S.answers[q.n]) { answered += 1; partAnswered += 1; }
        if (S.answers[q.n] === q.answer) { correct += 1; partCorrect += 1; }
      });
      maxObjective += part.points || 0;
      if (S.paper.scoreMode === "estimated") score += (part.points || 0) * (qs.length ? partCorrect / qs.length : 0);
      rows.push({ part: part, correct: partCorrect, answered: partAnswered, total: qs.length });
    });
    return {
      rows: rows,
      total: total,
      answered: answered,
      correct: correct,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      objectiveScore: Math.round(score * 10) / 10,
      maxObjective: maxObjective
    };
  }

  function subjectiveParts() {
    return (S.paper.parts || []).filter(function (p) { return p.kind === "translation" || p.kind === "writing"; });
  }

  function subjectiveMarkup() {
    var parts = subjectiveParts();
    if (!parts.length) return "";
    return '<div class="card mt-16"><h3>主观题 · 参考答案与自评</h3><p class="small muted">主观题不自动判分。对照参考译文/范文，给自己一个保守的分数。</p>' +
      parts.map(function (part) {
        var score = S.attempt.selfScores[part.id] || 0;
        var html = '<div class="model-answer mt-16"><div class="row row--between"><strong>' + u.esc(partTitle(part)) + "</strong>" + u.chip("满分 " + part.points) + "</div>";
        if (part.kind === "translation") {
          (part.sentences || []).forEach(function (s) {
            var draft = getDraft(part, s.n);
            html += '<div class="mt-8"><div class="small muted">(' + s.n + ") 你的翻译</div><div class=\"zh\">" + u.esc(draft || "（未作答）") + "</div>" +
              '<div class="small muted mt-8">参考译文</div><div class="en">' + u.esc(s.refZh || "暂无") + "</div></div>";
          });
        } else {
          var draft = getDraft(part, null);
          html += '<div class="small muted mt-8">你的作文</div><div class="zh">' + u.esc(draft || "（未作答）") + "</div>";
          if (part.model) {
            html += '<details class="mt-8"><summary class="small muted">参考范文与中译</summary><div class="en mt-8">' + u.esc(part.model.essay || "") + "</div><div class=\"zh\">" + u.esc(part.model.translation || "") + "</div></details>";
          }
        }
        html += '<label class="field mt-8" style="max-width:240px"><span>自评分数（0–' + part.points + '）</span><select class="select" data-self="' + u.attr(part.id) + '">' +
          Array.apply(null, Array(part.points + 1)).map(function (_, i) { return '<option value="' + i + '"' + (Number(score) === i ? " selected" : "") + ">" + i + " 分</option>"; }).join("") +
          "</select></label></div>";
        return html;
      }).join("") + "</div>";
  }

  function resultHTML() {
    var r = S.result;
    var selfTotal = 0;
    subjectiveParts().forEach(function (p) { selfTotal += Number(S.attempt.selfScores[p.id] || 0); });
    var estimated = S.paper.scoreMode === "estimated";
    var subjectiveMax = subjectiveParts().reduce(function (n, p) { return n + (p.points || 0); }, 0);
    var totalScore = estimated ? Math.round((r.objectiveScore + selfTotal) * 10) / 10 : null;
    var maxTotal = r.maxObjective + subjectiveMax;
    var html = '<div class="exam-shell"><header class="exam-top">' +
      '<a class="icon-btn" href="#/papers" aria-label="返回真题库">' + u.icon("back") + "</a>" +
      '<div class="exam-top__title"><strong>' + u.esc(S.paper.label) + "</strong><span>交卷结果</span></div>" +
      '<div class="exam-top__right"><a class="btn btn--ghost btn--sm" href="#/review/' + encodeURIComponent(S.attempt.id) + '">逐题解析</a>' +
      '<button type="button" class="btn btn--sm" data-result-retry>再练一次</button></div></header>' +
      '<main class="view" style="max-width:980px;margin:0 auto;padding:24px 20px 80px">' +
      '<section class="result-hero"><div class="score-ring" style="--score:' + r.accuracy + '"><div class="score-ring__value">' + r.accuracy + '%</div><div class="score-ring__label">正确率</div></div>' +
      '<div><p class="kicker">' + (S.mode === "practice" ? "PRACTICE COMPLETE" : "MOCK EXAM COMPLETE") + "</p><h2>" + (r.accuracy >= 80 ? "稳得很，继续保持。" : r.accuracy >= 60 ? "基础在，错题要收干净。" : "先把错题和生词啃下来。") + "</h2>" +
      '<p class="muted">' + u.esc(S.paper.label) + " · " + u.fmtDuration(S.attempt.elapsed || 0) + " · 已答 " + r.answered + " / " + r.total + " 题</p>" +
      '<div class="result-stats">' +
        '<div class="result-stat"><b>' + r.correct + "/" + r.total + "</b><span>客观题正确</span></div>" +
        (estimated ? '<div class="result-stat"><b>' + r.objectiveScore + "/" + r.maxObjective + "</b><span>客观题得分</span></div>" : '<div class="result-stat"><b>' + r.accuracy + "%</b><span>正确率</span></div>") +
        '<div class="result-stat"><b>' + u.fmtDuration(S.attempt.elapsed || 0) + "</b><span>用时</span></div>" +
        (estimated ? '<div class="result-stat"><b id="result-total">' + totalScore + "/" + maxTotal + "</b><span>含自评总分</span></div>" : "") +
      "</div></div></section>" +
      '<div class="card mt-16"><h3>分部分表现</h3>' + r.rows.map(function (row) {
        var p = Math.round((row.correct / row.total) * 100);
        return '<div class="result-part"><span>' + u.esc(partShort(row.part)) + "</span><span>" + row.correct + "/" + row.total + "</span><span class=\"small muted\">" + p + "%</span></div>";
      }).join("") + "</div>" +
      subjectiveMarkup() +
      '<div class="row mt-24"><a class="btn btn--ghost" href="#/papers">返回真题库</a><a class="btn" href="#/review/' + encodeURIComponent(S.attempt.id) + '">进入逐题解析</a></div>' +
      "</main></div>";
    return html;
  }

  function finalize(auto) {
    if (!S || S.submitted) return;
    S.submitted = true;
    clearInterval(timer);
    var r = grade();
    S.result = r;
    S.attempt.answers = S.answers;
    S.attempt.flags = S.flags;
    S.attempt.finishedAt = new Date().toISOString();
    S.attempt.elapsed = Math.floor((Date.now() - S.started) / 1000);
    S.attempt.completed = true;
    S.attempt.correct = r.correct;
    S.attempt.answered = r.answered;
    S.attempt.accuracy = r.accuracy;
    S.attempt.objectiveScore = r.objectiveScore;
    S.attempt.maxObjective = r.maxObjective;
    S.attempt.scoreMode = S.paper.scoreMode;

    allQuestions(S.paper).forEach(function (item) {
      var q = item.q;
      var chosen = S.answers[q.n];
      if (chosen && chosen !== q.answer) {
        KY.store.addMistake(S.paper.id, q.n, q.answer, chosen);
      }
    });
    KY.store.record("paper", 1);
    KY.store.record("minutes", Math.round((S.attempt.elapsed || 0) / 60));
    KY.store.saveAttempt(S.attempt);
    var root = S.root;
    if (root) root.innerHTML = resultHTML();
    bindResult(root);
    if (auto) toast("已自动交卷，去逐题解析看看错题", "warn", 3200);
  }

  function bindResult(root) {
    if (!root) return;
    var retry = root.querySelector("[data-result-retry]");
    if (retry) retry.addEventListener("click", function () {
      var paper = S.paper;
      var mode = S.mode;
      S = null;
      mount(root, { paperId: paper.id, mode: mode });
    });
    root.querySelectorAll("[data-self]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        S.attempt.selfScores[sel.getAttribute("data-self")] = Number(sel.value);
        KY.store.saveAttempt(S.attempt);
        var selfTotal = 0;
        subjectiveParts().forEach(function (p) { selfTotal += Number(S.attempt.selfScores[p.id] || 0); });
        var el = document.getElementById("result-total");
        if (el) {
          var max = S.result.maxObjective + subjectiveParts().reduce(function (n, p) { return n + (p.points || 0); }, 0);
          el.textContent = (Math.round((S.result.objectiveScore + selfTotal) * 10) / 10) + "/" + max;
        }
      });
    });
  }

  function onKey(event) {
    if (!S || S.submitted || !document.querySelector(".exam-shell")) return;
    var tag = (event.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (event.key === "ArrowRight") { event.preventDefault(); nextQ(); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); prevQ(); return; }
    if (event.key.toLowerCase() === "f" && S.qn) { event.preventDefault(); toggleFlag(S.qn); return; }
    var q = currentQ();
    if (!q || !q.options || !q.options.length) return;
    var key = event.key.toUpperCase();
    var map = { "1": "A", "2": "B", "3": "C", "4": "D" };
    if (map[key]) key = map[key];
    var exists = q.options.some(function (o) { return o.key === key; });
    if (exists) {
      event.preventDefault();
      choose(q.n, key);
    }
  }

  function bind(root) {
    if (root.dataset.examBound) return;
    root.dataset.examBound = "1";
    root.addEventListener("click", function (event) {
      var target = event.target.closest("[data-answer]");
      if (target) { event.preventDefault(); choose(parseInt(target.getAttribute("data-answer"), 10), target.getAttribute("data-key")); return; }
      target = event.target.closest("[data-goto-q]");
      if (target) { event.preventDefault(); goQ(parseInt(target.getAttribute("data-goto-q"), 10)); return; }
      target = event.target.closest("[data-part]");
      if (target) { event.preventDefault(); goPart(parseInt(target.getAttribute("data-part"), 10)); return; }
      target = event.target.closest("[data-flag]");
      if (target) { event.preventDefault(); toggleFlag(parseInt(target.getAttribute("data-flag"), 10)); return; }
      if (event.target.closest("[data-prev]")) { event.preventDefault(); prevQ(); return; }
      if (event.target.closest("[data-next]")) { event.preventDefault(); nextQ(); return; }
      if (event.target.closest("[data-exam-sheet]")) { event.preventDefault(); answerSheet(); return; }
      if (event.target.closest("[data-exam-submit]")) {
        event.preventDefault();
        var left = S.paper.objectiveCount - answeredCount();
        KY.ui.confirm(left ? "还有 " + left + " 道客观题未答，确定交卷吗？" : "确定交卷并查看成绩吗？", function () { finalize(false); }, "交卷");
        return;
      }
      if (event.target.closest("[data-exam-back]")) {
        event.preventDefault();
        if (S.submitted || !answeredCount()) location.hash = "#/papers";
        else KY.ui.confirm("退出后本次进度会保存在本机，下次可继续。确定退出吗？", function () { location.hash = "#/papers"; });
        return;
      }
      var toggle = event.target.closest("[data-toggle-explain]");
      if (toggle) { event.preventDefault(); toggle.parentNode.querySelector(".explain-extra").hidden = !toggle.parentNode.querySelector(".explain-extra").hidden; }
    });
    root.addEventListener("change", function (event) {
      var sel = event.target.closest("[data-select-q]");
      if (sel) { choose(parseInt(sel.getAttribute("data-select-q"), 10), sel.value); return; }
      var ord = event.target.closest("[data-order-q]");
      if (ord) { choose(parseInt(ord.getAttribute("data-order-q"), 10), ord.value); return; }
    });
    root.addEventListener("input", function (event) {
      var area = event.target.closest("[data-draft]");
      if (!area) return;
      var part = currentPart();
      var n = area.getAttribute("data-draft");
      if (n === "writing") setDraft(part, null, area.value);
      else setDraft(part, parseInt(n, 10), area.value);
      var wc = document.getElementById("wc");
      if (wc) wc.textContent = (String(area.value).trim().match(/[A-Za-z']+/g) || []).length + " words";
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", function (e) {
      if (S && !S.submitted && answeredCount()) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  function bootHTML(message) {
    return '<div class="exam-shell"><div class="boot"><div class="boot__mark">研</div><p>' + u.esc(message || "正在加载试卷…") + "</p></div></div>";
  }

  function render() {
    return bootHTML();
  }

  function mount(root, params) {
    params = params || {};
    var id = params.paperId || params.id;
    var mode = params.mode === "practice" ? "practice" : "exam";
    if (!id) {
      root.innerHTML = bootHTML("没有指定试卷。");
      return;
    }
    root.innerHTML = bootHTML();
    KY.data.loadPaper(id).then(function (paper) {
      var resume = findResume(paper.id, mode);
      var attempt = resume || newAttempt(paper, mode);
      S = {
        paper: paper,
        mode: mode,
        attempt: attempt,
        root: root,
        answers: attempt.answers || {},
        flags: attempt.flags || {},
        partIndex: typeof attempt.partIndex === "number" ? attempt.partIndex : firstPartWithWork(paper),
        qn: attempt.qn || null,
        started: attempt.startedAt ? new Date(attempt.startedAt).getTime() : Date.now(),
        submitted: false,
        result: null
      };
      if (S.qn == null) S.qn = firstQ(currentPart());
      root.innerHTML = examHTML();
      bind(root);
      startTimer();
      if (resume) toast("已恢复上次未完成的进度", "info");
    }).catch(function (err) {
      console.error(err);
      root.innerHTML = '<div class="exam-shell"><div class="boot"><div class="boot__mark">!</div><p>试卷加载失败：' + u.esc(err.message || err) + '</p><p><a class="btn btn--sm" href="#/papers">返回真题库</a></p></div></div>';
    });
  }

  window.addEventListener("hashchange", function () {
    clearInterval(timer);
    if (S && !S.submitted) persist();
    S = null;
  });

  KY.views = KY.views || {};
  KY.views.exam = {
    render: render,
    mount: mount,
    explainHTML: explainHTML,
    partShort: partShort,
    partTitle: partTitle,
    grade: grade
  };
})();
