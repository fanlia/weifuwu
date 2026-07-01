/**
 * weifuwu-ui.js — Alpine.js plugin for weifuwu SSR.
 *
 * Provides Alpine stores for theme, i18n, flash, and toast.
 *
 * Usage:
 *   <script src="/__wfw/js/htmx.min.js"></script>
 *   <script defer src="/__wfw/js/alpine.min.js"></script>
 *   <script src="/__wfw/js/weifuwu-ui.js"></script>
 *   <link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css">
 *
 * @license MIT
 */
const WFU_VERSION = '0.27.20';
(function () {
  'use strict'

  // ── Theme helpers ──────────────────────────────────────────
  function applyTheme(value) {
    var theme = value === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : value
    document.documentElement.setAttribute('data-theme', theme)
    return theme
  }
  function syncThemeAttr(resolved) {
    var target = resolved === 'dark' ? 'light' : 'dark'
    document.querySelectorAll('[data-wf-theme]').forEach(function (b) {
      b.setAttribute('data-wf-theme', target)
    })
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp(name + '=([^;]+)'))
    return m ? m[1] : null
  }

  // ── i18n helpers ───────────────────────────────────────────
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

  // ── Register Alpine stores (Alpine loaded before this script) ─
  function registerStores() {

    Alpine.store('theme', {
      value: getCookie('theme') || 'system',
      init: function () {
        var resolved = applyTheme(this.value)
        syncThemeAttr(resolved)
        if (window.matchMedia) {
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
            var current = getCookie('theme') || 'system'
            if (current === 'system') { var r = applyTheme('system'); syncThemeAttr(r) }
          })
        }
      },
      toggle: function () {
        var resolved = this.value === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
          : this.value
        var next = resolved === 'dark' ? 'light' : 'dark'
        this.value = next
        applyTheme(next)
        document.cookie = 'theme=' + next + '; Path=/; SameSite=Lax; Max-Age=31536000'
        fetch('/__theme/' + next, { headers: { Accept: 'application/json' } }).catch(function () {})
        syncThemeAttr(next)
      },
    })

    Alpine.store('i18n', {
      locale: document.body ? document.body.getAttribute('data-locale') || 'en' : 'en',
      messages: i18nMessages,
      t: function (key) { return translate(key) },
      switch: function (locale) {
        fetch('/__lang/' + locale, { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (data) {
            i18nMessages = data.messages || {}
            this.messages = data.messages || {}
            this.locale = locale
            document.cookie = 'locale=' + locale + '; Path=/; SameSite=Lax; Max-Age=31536000'
            document.body.setAttribute('data-locale', locale)
            document.querySelectorAll('[data-wf-lang]').forEach(function (b) {
              var v = b.getAttribute('data-wf-lang')
              b.setAttribute('data-wf-lang', v === 'zh-CN' ? 'en' : 'zh-CN')
            })
          }.bind(this))
          .catch(function (err) { console.warn('[wf] i18n switch failed:', err) })
      },
    })

    Alpine.store('flash', {
      message: '',
      type: 'info',
      show: false,
      init: function () {
        var el = document.getElementById('__wf-flash')
        if (el) {
          try {
            var data = JSON.parse(el.textContent || '{}')
            if (data.message) {
              this.message = data.message; this.type = data.type || 'info'; this.show = true
              setTimeout(function () { this.show = false }.bind(this), 5000)
            }
          } catch (e) {}
        }
      },
      clear: function () { this.show = false },
    })

    Alpine.magic('toast', function () {
      return function (message, type) {
        var container = document.getElementById('__wf-toast-container')
        if (!container) return
        var t = document.createElement('div')
        t.className = 'wu-toast wu-toast-' + (type || 'info')
        t.textContent = message
        container.appendChild(t)
        setTimeout(function () { t.remove() }, 3000)
      }
    })
  }

  registerStores()

  // ── Init theme on load ─────────────────────────────────────
  function initTheme() {
    applyTheme(getCookie('theme') || 'system')
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme)
  } else {
    initTheme()
  }

  window.WFU_VERSION = WFU_VERSION
})()
