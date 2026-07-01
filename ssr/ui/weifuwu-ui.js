/**
 * weifuwu-ui.js — Theme, i18n, flash, toast helpers (~2KB).
 *
 * HTMX handles AJAX, SSE, WebSocket, forms, and dynamic loading.
 * weifuwu-ui handles what HTMX can't: theme toggle, i18n switch,
 * flash messages, and toast notifications.
 *
 * Usage:
 *   <script src="/__wfw/js/htmx.min.js"></script>
 *   <script src="/__wfw/js/weifuwu-ui.js"></script>
 *   <link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css">
 *
 * @license MIT
 */
const WFU_VERSION = '0.27.20';
(function () {
  'use strict'

  /* ── Helpers ─────────────────────────────────────────────── */
  function cookie(name) {
    var m = document.cookie.match(new RegExp(name + '=([^;]+)'))
    return m ? m[1] : null
  }
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  /* ── Theme ───────────────────────────────────────────────── */
  function applyTheme(value) {
    var theme = value === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : value
    document.documentElement.setAttribute('data-theme', theme)
    return theme
  }
  function syncThemeAttr(resolved) {
    var target = resolved === 'dark' ? 'light' : 'dark'
    document.querySelectorAll('[data-wf-theme]').forEach(function (b) {
      b.setAttribute('data-wf-theme', target)
      b.textContent = target === 'dark' ? '🌙' : '☀️'
    })
  }

  var themeValue = cookie('theme') || 'system'
  var themeResolved = applyTheme(themeValue)
  syncThemeAttr(themeResolved)

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      var c = cookie('theme') || 'system'
      if (c === 'system') syncThemeAttr(applyTheme('system'))
    })
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-wf-theme]')
    if (!btn) return
    var next = btn.getAttribute('data-wf-theme')
    applyTheme(next)
    document.cookie = 'theme=' + next + '; Path=/; SameSite=Lax; Max-Age=31536000'
    fetch('/__theme/' + next, { headers: { Accept: 'application/json' } }).catch(function () {})
    syncThemeAttr(next)
  })

  /* ── i18n ────────────────────────────────────────────────── */
  var i18nMessages = {}
  var i18nScript = document.getElementById('__wf-i18n')
  if (i18nScript) {
    try { i18nMessages = JSON.parse(i18nScript.textContent || '{}') } catch (e) {}
  }

  function translate(key) {
    var keys = key.split('.')
    var val = i18nMessages
    for (var i = 0; i < keys.length; i++) val = val ? val[keys[i]] : undefined
    return val != null ? String(val) : key
  }

  function switchLocale(locale) {
    fetch('/__lang/' + locale, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json() })
      .then(function (data) {
        i18nMessages = data.messages || {}
        document.cookie = 'locale=' + locale + '; Path=/; SameSite=Lax; Max-Age=31536000'
        document.body.setAttribute('data-locale', locale)
        // Update [wu-text-key] elements
        document.querySelectorAll('[wu-text-key]').forEach(function (el) {
          el.textContent = translate(el.getAttribute('wu-text-key'))
        })
        // Toggle lang buttons: zh-CN ↔ en
        document.querySelectorAll('[data-wf-lang]').forEach(function (b) {
          b.setAttribute('data-wf-lang',
            b.getAttribute('data-wf-lang') === 'zh-CN' ? 'en' : 'zh-CN')
        })
      })
      .catch(function (err) { console.warn('[wf] i18n switch failed:', err) })
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-wf-lang]')
    if (!btn) return
    switchLocale(btn.getAttribute('data-wf-lang'))
  })

  /* ── Flash ───────────────────────────────────────────────── */
  var flashEl = document.getElementById('__wf-flash')
  if (flashEl) {
    try {
      var fd = JSON.parse(flashEl.textContent || '{}')
      if (fd.message) {
        var toast = document.createElement('div')
        toast.className = 'wu-toast wu-toast-' + (fd.type || 'info')
        toast.textContent = fd.message
        toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;cursor:pointer'
        toast.addEventListener('click', function () { toast.remove() })
        document.body.appendChild(toast)
        setTimeout(function () { if (toast.parentNode) toast.remove() }, 5000)
      }
    } catch (e) {}
  }

  /* ── Toast API ───────────────────────────────────────────── */
  window.wfToast = function (message, type) {
    var t = document.createElement('div')
    t.className = 'wu-toast wu-toast-' + (type || 'info')
    t.textContent = message
    t.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;cursor:pointer;margin-top:8px'
    t.addEventListener('click', function () { t.remove() })
    var container = document.getElementById('__wf-toast-container')
    if (container) {
      container.appendChild(t)
    } else {
      document.body.appendChild(t)
    }
    setTimeout(function () { if (t.parentNode) t.remove() }, 3000)
  }

  window.WFU_VERSION = WFU_VERSION
})()
