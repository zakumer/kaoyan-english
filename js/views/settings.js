/* Settings, backup and data provenance. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;
  var rootRef = null;

  function setting(key, value) {
    var state = KY.store.state();
    state.settings[key] = value;
    KY.store.save();
    if (key === "theme") KY.ui.applyTheme();
  }

  function themeOptions(current) {
    return [
      ["auto", "跟随系统"],
      ["light", "浅色纸"],
      ["dark", "深色墨"]
    ].map(function (pair) {
      return '<option value="' + pair[0] + '"' + (current === pair[0] ? " selected" : "") + ">" + pair[1] + "</option>";
    }).join("");
  }

  function render() {
    var state = KY.store.state();
    var s = state.settings;
    var meta = KY.data.meta();
    var wm = KY.data.wordMeta();
    var counts = meta.counts || {};
    var memory = KY.store.isMemoryOnly();
    return KY.ui.shell("settings", KY.ui.pageHead("设置", "SETTINGS") +
      (memory ? '<div class="notice notice--warn">当前浏览器禁用了 localStorage，学习记录只保留在本次页面。请改用 Chrome / Edge 打开，或检查隐私设置。</div>' : "") +
      '<div class="settings-grid">' +
        '<div class="settings-section">' +
          '<section class="card"><div class="card__head"><h2 class="card__title">学习节奏</h2></div>' +
            '<div class="field"><label for="set-new">每日新词</label><input class="input" id="set-new" type="number" min="5" max="100" step="5" value="' + u.attr(s.dailyNew || 20) + '"><small>建议 15–25 个；复习优先于新词。</small></div>' +
            '<div class="field"><label for="set-review">每日复习上限</label><input class="input" id="set-review" type="number" min="10" max="300" step="10" value="' + u.attr(s.dailyReview || 100) + '"><small>到期词多时，先清复习再学新词。</small></div>' +
            '<div class="field"><label for="set-date">考试日期</label><input class="input" id="set-date" type="date" value="' + u.attr(s.examDate || "2026-12-19") + '"><small>首页倒计时使用这个日期。</small></div>' +
            '<div class="field"><label for="set-minutes">模考时长（分钟）</label><input class="input" id="set-minutes" type="number" min="60" max="240" step="5" value="' + u.attr(s.examMinutes || 180) + '"><small>只影响新开的模考；进行中的考试保留原时长。</small></div>' +
          "</section>" +
          '<section class="card"><div class="card__head"><h2 class="card__title">显示与朗读</h2></div>' +
            '<div class="field"><label for="set-theme">主题</label><select class="select" id="set-theme">' + themeOptions(s.theme || "auto") + "</select></div>" +
            '<div class="field"><label for="set-rate">朗读速度</label><input id="set-rate" type="range" min="0.6" max="1.2" step="0.02" value="' + u.attr(s.ttsRate || 0.92) + '"><small id="rate-label">' + Number(s.ttsRate || 0.92).toFixed(2) + "×</small></div>" +
            '<button class="btn btn--ghost btn--sm" data-action="test-speak">' + u.icon("volume") + "试听一句</button>" +
          "</section>" +
        "</div>" +
        '<div class="settings-section">' +
          '<section class="card"><div class="card__head"><h2 class="card__title">数据与备份</h2></div>' +
            '<p class="small muted">所有记录都在本机浏览器。换电脑、清缓存前先导出 JSON。</p>' +
            '<div class="row mt-16 wrap"><button class="btn btn--sm" id="export-data">导出备份</button><button class="btn btn--ghost btn--sm" id="import-data">导入备份</button><input type="file" id="import-file" accept="application/json,.json" hidden></div>' +
            '<div class="field-row mt-16"><div class="field-row__main"><strong>学习记录</strong><span>' + Object.keys(state.vocab).length + " 个词 · " + Object.keys(state.attempts).length + " 次考试 · " + Object.keys(state.mistakes).length + " 道错题</span></div></div>" +
            '<div class="field-row danger-zone"><div class="field-row__main"><strong>清空全部记录</strong><span>不可撤销；导出的 JSON 仍可再导入。</span></div><button class="btn btn--danger btn--sm" id="reset-data">清空</button></div>' +
          "</section>" +
          '<section class="card"><div class="card__head"><h2 class="card__title">数据来源</h2></div>' +
            '<p class="small muted">真题、解析、词表来自 <a href="' + u.attr(meta.source || "https://english-exam.lazynote.cn/") + '" target="_blank" rel="noopener">' + u.esc(meta.sourceLabel || "懒笔记") + "</a>，仅作个人学习使用。真题版权归考试委员会；本工具不再分发 PDF。</p>" +
            '<div class="facts">' +
              '<div><b>' + (counts.papers || 29) + "</b><span>套英语一</span></div>" +
              '<div><b>' + (counts.questions || 1240) + "</b><span>道客观题</span></div>" +
              '<div><b>' + (wm.total || 1148) + "</b><span>个高频词</span></div>" +
              '<div><b>' + (wm.syllabus || 931) + "</b><span>考纲词</span></div>" +
            "</div>" +
            '<p class="small muted mt-8">数据生成：' + u.esc(String(meta.generatedAt || "").slice(0, 10)) + " · 版本 " + u.esc(String(meta.version || 1)) + "</p>" +
          "</section>" +
          '<section class="card"><div class="card__head"><h2 class="card__title">使用提示</h2></div><div class="credit">' +
            "1. 双击 <b>启动.bat</b> 或直接打开 <b>index.html</b>。<br>" +
            "2. 模考模式计时并自动保存；练习模式选完立即看解析。<br>" +
            "3. 阅读精读里点任意英文单词，可查释义、听发音、加入生词本。<br>" +
            "4. 主观题不自动判分，交卷后对照参考译文/范文自评。<br>" +
            "5. 浏览器语音的音色取决于系统；没有声音时检查系统语音包。" +
          "</div></section>" +
        "</div>" +
      "</div>");
  }

  function bind(root) {
    rootRef = root;
    [["#set-new", "dailyNew", Number], ["#set-review", "dailyReview", Number], ["#set-minutes", "examMinutes", Number]].forEach(function (row) {
      var el = root.querySelector(row[0]);
      if (!el) return;
      el.addEventListener("change", function () {
        setting(row[1], row[2](el.value));
        KY.ui.toast("已保存", "ok");
      });
    });
    var date = root.querySelector("#set-date");
    if (date) date.addEventListener("change", function () { setting("examDate", date.value); KY.ui.toast("考试日期已更新", "ok"); });
    var theme = root.querySelector("#set-theme");
    if (theme) theme.addEventListener("change", function () { setting("theme", theme.value); KY.ui.toast("主题已切换", "ok"); });
    var rate = root.querySelector("#set-rate");
    if (rate) rate.addEventListener("input", function () {
      setting("ttsRate", Number(rate.value));
      var label = root.querySelector("#rate-label");
      if (label) label.textContent = Number(rate.value).toFixed(2) + "×";
    });
    var test = root.querySelector('[data-action="test-speak"]');
    if (test) test.addEventListener("click", function () {
      u.speak("Reading is thinking with someone else's mind.", KY.store.state().settings.ttsRate);
    });
    var exportBtn = root.querySelector("#export-data");
    if (exportBtn) exportBtn.addEventListener("click", function () {
      u.download("kaoyan-english-backup-" + u.today() + ".json", KY.store.exportState());
      KY.ui.toast("备份已导出", "ok");
    });
    var importBtn = root.querySelector("#import-data");
    var file = root.querySelector("#import-file");
    if (importBtn && file) {
      importBtn.addEventListener("click", function () { file.click(); });
      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        if (!f) return;
        u.readFile(f).then(function (text) {
          KY.ui.confirm("导入会覆盖当前学习记录。确定继续吗？", function () {
            try {
              KY.store.importState(text);
              KY.ui.toast("导入成功", "ok");
              setTimeout(function () { location.hash = "#/"; location.reload(); }, 500);
            } catch (err) {
              KY.ui.toast("导入失败：" + (err.message || err), "warn");
            }
          }, "覆盖并导入");
        }).catch(function (err) { KY.ui.toast("读取失败：" + (err.message || err), "warn"); });
      });
    }
    var reset = root.querySelector("#reset-data");
    if (reset) reset.addEventListener("click", function () {
      KY.ui.confirm("确定清空全部学习记录吗？这个操作不可撤销。", function () {
        KY.store.reset();
        KY.ui.toast("已清空", "info");
        setTimeout(function () { location.hash = "#/"; location.reload(); }, 400);
      }, "清空");
    });
  }

  KY.views = KY.views || {};
  KY.views.settings = { render: render, mount: bind };
})();
