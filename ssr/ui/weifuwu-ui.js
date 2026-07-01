/**
 * weifuwu-ui.js — Alpine.js plugin for weifuwu SSR.
 *
 * Provides Alpine stores for theme, i18n, flash, and toast.
 * HTMX handles AJAX, SSE, WebSocket, and form submission.
 * Alpine handles state, DOM binding, and UI components.
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

  // ── Theme ───────────────────────────────────────────────────
  function applyTheme(value) {
    const theme =
      value === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : value
    document.documentElement.setAttribute('data-theme', theme)
  }
  function syncThemeButtons(resolved) {
    const target = resolved === 'dark' ? 'light' : 'dark'
    document.querySelectorAll('[data-wf-theme]').forEach((b) => {
      b.setAttribute('data-wf-theme', target)
      b.textContent = target === 'dark' ? '🌙' : '☀️'
    })
  }

  // ── i18n ────────────────────────────────────────────────────
  let i18nMessages = {}
  const i18nScript = document.getElementById('__wf-i18n')
  if (i18nScript) {
    try { i18nMessages = JSON.parse(i18nScript.textContent || '{}') } catch {}
  }
  function translate(key) {
    const keys = key.split('.')
    let val = i18nMessages
    for (const k of keys) val = val?.[k]
    return val != null ? String(val) : key
  }

  // ── Alpine stores ───────────────────────────────────────────
  document.addEventListener('alpine:init', () => {
    // ── Theme store ─────────────────────────────────────────
    Alpine.store('theme', {
      value: document.cookie.match(/theme=([^;]+)/)?.[1] || 'system',
      init() {
        const resolved = applyTheme(this.value)
        syncThemeButtons(resolved)
        // Listen for system preference changes
        if (window.matchMedia) {
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            const current = document.cookie.match(/theme=([^;]+)/)?.[1] || 'system'
            if (current === 'system') {
              const r = applyTheme('system')
              syncThemeButtons(r)
            }
          })
        }
      },
      toggle() {
        const resolved =
          this.value === 'system'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
            : this.value
        const next = resolved === 'dark' ? 'light' : 'dark'
        this.value = next
        applyTheme(next)
        document.cookie = 'theme=' + next + '; Path=/; SameSite=Lax; Max-Age=31536000'
        fetch('/__theme/' + next, { headers: { Accept: 'application/json' } }).catch(() => {})
        syncThemeButtons(next)
      },
    })

    // ── i18n store ──────────────────────────────────────────
    Alpine.store('i18n', {
      locale: document.body?.getAttribute('data-locale') || 'en',
      messages: i18nMessages,
      t(key) {
        return translate(key)
      },
      async switch(locale) {
        try {
          const res = await fetch('/__lang/' + locale, { headers: { Accept: 'application/json' } })
          const data = await res.json()
          this.messages = data.messages || {}
          this.locale = locale
          document.cookie = 'locale=' + locale + '; Path=/; SameSite=Lax; Max-Age=31536000'
          document.body?.setAttribute('data-locale', locale)
          // Toggle buttons: zh-CN ↔ en
          document.querySelectorAll('[data-wf-lang]').forEach((b) => {
            const v = b.getAttribute('data-wf-lang')
            if (v === 'zh-CN') b.setAttribute('data-wf-lang', 'en')
            else if (v === 'en') b.setAttribute('data-wf-lang', 'zh-CN')
          })
        } catch (err) {
          console.warn('[wf] i18n switch failed:', err)
        }
      },
    })

    // ── Flash store ─────────────────────────────────────────
    Alpine.store('flash', {
      message: '',
      type: 'info',
      show: false,
      init() {
        const el = document.getElementById('__wf-flash')
        if (el) {
          try {
            const data = JSON.parse(el.textContent || '{}')
            if (data.message) {
              this.message = data.message
              this.type = data.type || 'info'
              this.show = true
              setTimeout(() => { this.show = false }, 5000)
            }
          } catch {}
        }
      },
      clear() {
        this.show = false
      },
    })

    // ── Toast magic ─────────────────────────────────────────
    Alpine.magic('toast', () => {
      return function (message, type) {
        const container = document.getElementById('__wf-toast-container')
        if (!container) return
        const t = document.createElement('div')
        t.className = 'wf-toast wf-toast-' + (type || 'info')
        t.textContent = message
        container.appendChild(t)
        setTimeout(() => { t.remove() }, 3000)
      }
    })
  })

  // ── Init theme on load ─────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyTheme(document.cookie.match(/theme=([^;]+)/)?.[1] || 'system')
    })
  } else {
    applyTheme(document.cookie.match(/theme=([^;]+)/)?.[1] || 'system')
  }

  // ── Expose version ─────────────────────────────────────────
  window.WFU_VERSION = WFU_VERSION
})()
