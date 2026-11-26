/* Shared shell, widgets, and feedback. */
(function () {
  "use strict";
  var KY = (window.KY = window.KY || {});
  var u = KY.util;

  var NAV = [
    { id: "dashboard", label: "今日", icon: "home", href: "#/" },
    { id: "vocab", label: "背单词", icon: "book", href: "#/vocab" },
    { id: "papers", label: "真题", icon: "papers", href: "#/papers" },
    { id: "mistakes", label: "错题", icon: "flag", href: "#/mistakes" },
    { id: "stats", label: "统计", icon: "chart", href: "#/stats" }
  ];

  function nav(active) {
    return NAV.map(function (item) {
      return '<a class="nav__item' + (item.id === active ? " is-active" : "") + '" href="' + item.href + '" data-nav="' + item.id + '">' +
        u.icon(item.icon) + "<span>" + item.label + "</span></a>";
    }).join("");
  }

  function shell(active, content, options) {
    options = options || {};
    var state = KY.store.state();
    var streak = KY.store.streak();
    var theme = state.settings.theme || "auto";
    var paperCount = (KY.data.meta().papers || []).length;
    return '<div class="app-shell">' +
      '<aside class="sidebar">' +
        '<a class="brand" href="#/">' +
          '<span class="brand__seal">研</span>' +
          '<span class="brand__text"><strong>研英</strong><small>考研英语一</small></span>' +
        '</a>' +
        '<nav class="nav" aria-label="主导航">' + nav(active) + "</nav>" +
        '<div class="sidebar__foot">' +
          '<div class="mini-streak">' + u.icon("flame") + "<span>连续 " + streak + " 天</span></div>" +
          '<a class="nav__item" href="#/settings">' + u.icon("settings") + "<span>设置</span></a>" +
          '<p class="sidebar__note">离线 · 个人学习<br>' + paperCount + " 套英语一真题</p>" +
        "</div>" +
      "</aside>" +
      '<div class="main-wrap">' +
        '<header class="topbar">' +
          '<a class="topbar__brand" href="#/">研英</a>' +
          '<div class="topbar__actions">' +
            '<button class="icon-btn" data-action="search" aria-label="搜索">' + u.icon("search") + "</button>" +
            '<button class="icon-btn" data-action="toggle-theme" aria-label="切换主题">' + u.icon("spark") + "</button>" +
            '<a class="icon-btn" href="#/settings" aria-label="设置">' + u.icon("settings") + "</a>" +
          "</div>" +
        "</header>" +
        '<main id="view" class="view" data-view="' + u.attr(active) + '">' + content + "</main>" +
        '<nav class="bottom-nav" aria-label="移动导航">' + nav(active) + "</nav>" +
      "</div>" +
      '<div class="theme-dot" data-theme="' + u.attr(theme) + '"></div>' +
    "</div>";
  }

  function pageHead(title, kicker, actions) {
    return '<header class="page-head">' +
      '<div><p class="kicker">' + u.esc(kicker || "") + "</p><h1>" + u.esc(title) + "</h1></div>" +
      (actions ? '<div class="page-head__actions">' + actions + "</div>" : "") +
    "</header>";
  }

  function toast(message, kind, ms) {
    var root = document.getElementById("toast-root");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "toast toast--" + (kind || "info");
    el.innerHTML = '<span class="toast__dot"></span><span>' + u.esc(message) + "</span>";
    root.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("is-on"); });
    setTimeout(function () {
      el.classList.remove("is-on");
      setTimeout(function () { el.remove(); }, 220);
    }, ms || 2400);
  }

  function modal(html, options) {
    options = options || {};
    var root = document.getElementById("modal-root");
    root.innerHTML = '<div class="modal-backdrop" data-action="modal-close">' +
      '<div class="modal ' + (options.wide ? "modal--wide" : "") + '" role="dialog" aria-modal="true">' +
        '<button class="modal__close icon-btn" data-action="modal-close" aria-label="关闭">' + u.icon("x") + "</button>" +
        html +
      "</div></div>";
    document.body.classList.add("has-modal");
    var first = root.querySelector("button, a, input, textarea, select");
    if (first) setTimeout(function () { first.focus(); }, 20);
    return root;
  }

  function closeModal() {
    var root = document.getElementById("modal-root");
    if (root) root.innerHTML = "";
    document.body.classList.remove("has-modal");
  }

  function confirm(message, onYes, yesLabel) {
    modal('<h2 class="modal__title">请确认</h2><p class="modal__text">' + u.esc(message) + '</p>' +
      '<div class="modal__actions"><button class="btn btn--ghost" data-action="modal-close">取消</button>' +
      '<button class="btn btn--danger" id="modal-yes">' + u.esc(yesLabel || "确认") + "</button></div>");
    document.getElementById("modal-yes").addEventListener("click", function () {
      closeModal();
      onYes();
    });
  }

  function progress(value, total, label, tone) {
    var p = u.pct(value, total);
    return '<div class="progress' + (tone ? " progress--" + tone : "") + '">' +
      '<div class="progress__bar"><span style="width:' + p + '%"></span></div>' +
      (label === false ? "" : '<div class="progress__meta"><span>' + u.esc(label || "") + "</span><b>" + p + "%</b></div>") +
    "</div>";
  }

  function empty(title, text, action) {
    return '<div class="empty">' +
      '<div class="empty__mark">' + u.icon("book") + "</div>" +
      "<h3>" + u.esc(title) + "</h3><p>" + u.esc(text) + "</p>" +
      (action || "") +
    "</div>";
  }

  function statCard(label, value, suffix, tone) {
    return '<div class="stat-card' + (tone ? " stat-card--" + tone : "") + '">' +
      '<span class="stat-card__label">' + u.esc(label) + "</span>" +
      '<strong class="stat-card__value">' + u.esc(value) + (suffix ? '<em>' + u.esc(suffix) + "</em>" : "") + "</strong>" +
    "</div>";
  }

  function chip(text, tone, attrs) {
    return '<span class="chip' + (tone ? " chip--" + tone : "") + '" ' + (attrs || "") + ">" + u.esc(text) + "</span>";
  }

  function applyTheme() {
    var state = KY.store.state();
    var theme = state.settings.theme || "auto";
    var resolved = theme;
    if (theme === "auto") {
      resolved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeChoice = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#141916" : "#f3ede2");
  }

  function toggleTheme() {
    var state = KY.store.state();
    var order = ["auto", "light", "dark"];
    var i = order.indexOf(state.settings.theme || "auto");
    state.settings.theme = order[(i + 1) % order.length];
    KY.store.save();
    applyTheme();
    toast("主题：" + ({ auto: "跟随系统", light: "浅色", dark: "深色" })[state.settings.theme], "info");
  }

  function wordDetailLink(word) {
    return "#/word/" + encodeURIComponent(word);
  }

  // Global actions available from any shell.
  document.addEventListener("click", function (event) {
    var action = event.target.closest("[data-action]");
    if (!action) return;
    var name = action.getAttribute("data-action");
    if (name === "toggle-theme") {
      event.preventDefault();
      toggleTheme();
    } else if (name === "modal-close") {
      if (event.target === action || event.target.closest(".modal__close")) closeModal();
    } else if (name === "search") {
      event.preventDefault();
      KY.app.openSearch();
    } else if (name === "speak") {
      event.preventDefault();
      var text = action.getAttribute("data-text") || "";
      u.speak(text, KY.store.state().settings.ttsRate);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeModal();
  });

  KY.ui = {
    NAV: NAV,
    shell: shell,
    pageHead: pageHead,
    toast: toast,
    modal: modal,
    closeModal: closeModal,
    confirm: confirm,
    progress: progress,
    empty: empty,
    statCard: statCard,
    chip: chip,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    wordDetailLink: wordDetailLink
  };
  window.toast = toast;
})();
