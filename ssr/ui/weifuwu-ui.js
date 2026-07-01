/**
 * weifuwu-ui.js — Zero-dependency frontend runtime for weifuwu SSR.
 *
 * One <script> covers: AJAX, state binding, SSE streaming, WebSocket,
 * theme switching, i18n, flash messages, and UI components.
 *
 * Usage:
 *   <script src="/__wfw/js/weifuwu-ui.js"></script>
 *   <link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css">
 *
 * @license MIT
 * @version 0.1.0
 */
const WFU_VERSION = '0.27.19';
(function () {
  'use strict'

  // ═══════════════════════════════════════════════════════════════════
  //  Internal state
  // ═══════════════════════════════════════════════════════════════════

  /** WeakMap<Element, Proxy> — wu-data reactive state per element */
  const states = new WeakMap()

  /** Guard to prevent duplicate initialization */
  let _wuInitialized = false

  /** Active SSE/WS connections for abort */
  let activeStream = null

  /** WebSocket connections tracked by element */
  const wsConnections = new WeakMap()

  // ═══════════════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════════════

  const wu = {
    /** Initialize/reinitialize all wu-* behaviors under a root element */
    init,
    /** Get the reactive state for an element (from its nearest [wu-data] ancestor) */
    getState,
    /** Access the DOM (public ref for extensions) */
    dom: { getState, findState },
  }
  // These are assigned later via property assignment
  // (they cannot be in the object literal because they aren't hoisted).
  wu.abort = function () {}
  wu.send = function () {}
  wu.stream = function () {}
  wu.toast = function () {}

  // ═══════════════════════════════════════════════════════════════════
  //  1. Initialization
  // ═══════════════════════════════════════════════════════════════════

  function init(root) {
    if (root === document || !root) {
      if (_wuInitialized) return
      _wuInitialized = true
    }
    root = root || document
    if (root === document) {
      initTheme()
      initFlash()
      initI18n()
    }
    initStates(root)
    initBindings(root)
    initActions(root)
    initTriggers(root)
    initSSE(root)
    initWS(root)
    initComponents(root)
  }

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init())
  } else {
    init()
  }

  // Re-init after AJAX content replacement
  const origPushState = history.pushState
  history.pushState = function () {
    origPushState.apply(this, arguments)
    init(document.body)
  }
  window.addEventListener('popstate', () => init(document.body))

  // ═══════════════════════════════════════════════════════════════════
  //  2. Reactive state (wu-data)
  // ═══════════════════════════════════════════════════════════════════

  function initStates(root) {
    root.querySelectorAll('[wu-data]').forEach((el) => {
      if (states.has(el)) return // already initialized
      try {
        const raw = el.getAttribute('wu-data')
        const initial = JSON.parse(raw)
        const state = createReactiveState(el, initial)
        states.set(el, state)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[wu] Invalid wu-data:', el.getAttribute('wu-data'), e)
      }
    })
  }

  function createReactiveState(el, initial) {
    const target = { ...initial }
    const proxy = new Proxy(target, {
      set(obj, key, value) {
        const old = obj[key]
        if (old === value) return true
        obj[key] = value
        // Update all bindings under this element
        queueBindingUpdate(el, key, value)
        return true
      },
    })
    return proxy
  }

  /** Find the nearest [wu-data] ancestor and return its state */
  function findState(el) {
    const parent = el.closest('[wu-data]')
    return parent ? states.get(parent) : null
  }

  function getState(el) {
    if (states.has(el)) return states.get(el)
    return findState(el)
  }

  // Apply binding updates synchronously
  function queueBindingUpdate(root, key, value) {
    applyBindings(root, key, value)
  }

  function applyBindings(root, key, value) {
    const els = root.querySelectorAll('[wu-text="' + CSS.escape(key) + '"]')
    for (const el of els) {
      el.textContent = value == null ? '' : String(value)
    }
    const showEls = root.querySelectorAll('[wu-show="' + CSS.escape(key) + '"]')
    for (const el of showEls) {
      el.style.display = value ? '' : 'none'
    }
    const hideEls = root.querySelectorAll('[wu-hide="' + CSS.escape(key) + '"]')
    for (const el of hideEls) {
      el.style.display = value ? 'none' : ''
    }
    const classEls = root.querySelectorAll('[wu-class]')
    for (const el of classEls) {
      const expr = el.getAttribute('wu-class')
      const state = findState(el)
      if (state) el.className = evaluateExpr(expr, state) || ''
    }
    const htmlEls = root.querySelectorAll('[wu-html="' + CSS.escape(key) + '"]')
    for (const el of htmlEls) {
      el.innerHTML = value == null ? '' : String(value)
    }
    // Re-render wu-each (exact match + prefix match for nested paths)
    const eachEls = root.querySelectorAll('[wu-each]')
    for (const el of eachEls) {
      const eachPath = el.getAttribute('wu-each')
      if (eachPath === key || eachPath.startsWith(key + '.')) {
        renderEach(el)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  3. Binding initialization (static render)
  // ═══════════════════════════════════════════════════════════════════

  function initBindings(root) {
    // wu-text: set initial text from state
    root.querySelectorAll('[wu-text]').forEach((el) => {
      const key = el.getAttribute('wu-text')
      const state = findState(el)
      if (state) {
        const val = getNestedValue(state, key)
        el.textContent = val == null ? '' : String(val)
      }
    })
    // wu-show / wu-hide: initial visibility
    root.querySelectorAll('[wu-show], [wu-hide]').forEach((el) => {
      const key = el.getAttribute('wu-show') || el.getAttribute('wu-hide')
      const state = findState(el)
      if (state) {
        const val = getNestedValue(state, key)
        const isShow = el.hasAttribute('wu-show')
        el.style.display = val ? (isShow ? '' : 'none') : isShow ? 'none' : ''
      }
    })
    // wu-class: initial class
    root.querySelectorAll('[wu-class]').forEach((el) => {
      const expr = el.getAttribute('wu-class')
      const state = findState(el)
      if (state) {
        el.className = evaluateExpr(expr, state) || ''
      }
    })
    // wu-model: initial value
    root.querySelectorAll('[wu-model]').forEach((el) => {
      const key = el.getAttribute('wu-model')
      const state = findState(el)
      if (state) {
        const val = getNestedValue(state, key)
        el.value = val == null ? '' : String(val)
      }
    })
    // wu-each: initial render
    root.querySelectorAll('[wu-each]').forEach(renderEach)
  }

  // ═══════════════════════════════════════════════════════════════════
  //  4. wu-each: list rendering
  // ═══════════════════════════════════════════════════════════════════

  /** Get nested property value by dot-separated path */
  function getNestedValue(obj, path) {
    return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj)
  }

  function renderEach(el) {
    const path = el.getAttribute('wu-each')
    const state = findState(el)
    if (!state) return
    const items = getNestedValue(state, path)
    if (!Array.isArray(items)) return
    // Save the template from first render
    let template = el._wu_template
    if (!template) {
      template = el.innerHTML
      el._wu_template = template
    }
    el.innerHTML = items
      .map((item, index) => {
        const rendered = template
          .replace(/\$\{index\}/g, String(index))
          .replace(/\$\{this\}/g, String(item == null ? '' : item))
        // Support nested path access: ${item.name}, ${item.user.email}
        return rendered.replace(/\$\{item\.([^}]+)\}/g, (_, prop) => {
          return String(getNestedValue(item, prop) ?? '')
        })
      })
      .join('')
  }

  // ═══════════════════════════════════════════════════════════════════
  //  5. wu-on: event binding
  // ═══════════════════════════════════════════════════════════════════

  function initActions(root) {
    // Event delegation for wu-on
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[wu-on]')
      if (!el) return
      const expr = el.getAttribute('wu-on')
      handleAction(expr, el, e)
    })
    root.addEventListener('keyup', (e) => {
      const el = e.target.closest('[wu-on]')
      if (!el) return
      const expr = el.getAttribute('wu-on')
      if (!expr.includes('keyup')) return
      handleAction(expr, el, e)
    })
  }

  function handleAction(expr, el, event) {
    const state = findState(el)
    if (!state) return

    // Parse "eventType: expression" or just "expression"
    let actionExpr = expr
    const colonIdx = expr.indexOf(':')
    if (colonIdx !== -1) {
      const eventType = expr.slice(0, colonIdx).trim()
      // Filter by event type
      if (eventType === 'click' && event.type !== 'click') return
      if (eventType === 'keyup' && event.type !== 'keyup') return
      actionExpr = expr.slice(colonIdx + 1).trim()
    }

    evaluateExpr(actionExpr, state)
  }

  // ═══════════════════════════════════════════════════════════════════
  //  6. Expression evaluator
  // ═══════════════════════════════════════════════════════════════════

  function evaluateExpr(expr, state) {
    // Execute expression in the Proxy's scope via with().
    // The Proxy's set trap catches mutations and triggers binding updates.
    // Returns the expression result (used by wu-class).
    try {
      const fn = new Function('$s', `with($s) { return (${expr}) }`)
      return fn(state)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[wu] Expression error:', expr, e)
      return ''
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  7. wu-model: two-way binding
  // ═══════════════════════════════════════════════════════════════════

  function initModels(root) {
    root.querySelectorAll('[wu-model]').forEach((el) => {
      const key = el.getAttribute('wu-model')
      const state = findState(el)
      if (!state) return

      el.addEventListener('input', () => {
        state[key] = el.value
      })
      el.addEventListener('change', () => {
        state[key] = el.value
      })
    })
  }

  // ═══════════════════════════════════════════════════════════════════
  //  8. wu-get / wu-post / wu-put / wu-patch / wu-delete (AJAX)
  // ═══════════════════════════════════════════════════════════════════

  function initTriggers(root) {
    // Click triggers: [wu-get], [wu-post], [wu-put], [wu-patch], [wu-delete]
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[wu-get],[wu-post],[wu-put],[wu-patch],[wu-delete]')
      if (!el) return
      const method = el.hasAttribute('wu-get')
        ? 'GET'
        : el.hasAttribute('wu-post')
          ? 'POST'
          : el.hasAttribute('wu-put')
            ? 'PUT'
            : el.hasAttribute('wu-patch')
              ? 'PATCH'
              : 'DELETE'
      const url =
        el.getAttribute('wu-get') ||
        el.getAttribute('wu-post') ||
        el.getAttribute('wu-put') ||
        el.getAttribute('wu-patch') ||
        el.getAttribute('wu-delete')
      triggerRequest(el, method, url, e)
    })

    // Load triggers: [wu-get wu-trigger="load"]
    root.querySelectorAll('[wu-trigger="load"]').forEach((el) => {
      const method = el.hasAttribute('wu-get') ? 'GET' : 'POST'
      const url = el.getAttribute('wu-get') || el.getAttribute('wu-post')
      if (url) triggerRequest(el, method, url, null)
    })

    // Every triggers: [wu-trigger="every:5s"]
    root.querySelectorAll('[wu-trigger]').forEach((el) => {
      const trigger = el.getAttribute('wu-trigger')
      const m = trigger && trigger.match(/^every:(\d+)$/)
      if (!m) return
      const interval = parseInt(m[1], 10) * 1000
      const method = el.hasAttribute('wu-get') ? 'GET' : 'POST'
      const url = el.getAttribute('wu-get') || el.getAttribute('wu-post')
      if (url) {
        setInterval(() => triggerRequest(el, method, url, null), interval)
      }
    })

    // visible triggers: [wu-trigger="visible"]
    if ('IntersectionObserver' in window) {
      root.querySelectorAll('[wu-trigger="visible"]').forEach((el) => {
        const method = el.hasAttribute('wu-get') ? 'GET' : 'POST'
        const url = el.getAttribute('wu-get') || el.getAttribute('wu-post')
        if (!url) return
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                triggerRequest(el, method, url, null)
                observer.disconnect()
              }
            }
          },
          { rootMargin: '100px' },
        )
        observer.observe(el)
      })
    }

    // Form submit triggers
    root.addEventListener('submit', (e) => {
      const form = e.target.closest('[wu-post],[wu-put]')
      if (!form) return
      e.preventDefault()
      const method = form.hasAttribute('wu-post') ? 'POST' : 'PUT'
      const url = form.getAttribute('wu-post') || form.getAttribute('wu-put')
      triggerRequest(form, method, url, e)
    })
  }

  function triggerRequest(el, method, url, _event) {
    // Confirmation
    const confirmMsg = el.getAttribute('wu-confirm')
    if (confirmMsg && !confirm(confirmMsg)) return

    // Build options
    const opts = { method, headers: {} }
    const isForm = el.tagName === 'FORM'

    // Body: from form or wu-data
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      if (isForm) {
        opts.body = new FormData(el)
      } else {
        const state = findState(el)
        if (state && el.getAttribute('wu-data')) {
          opts.headers['Content-Type'] = 'application/json'
          opts.body = JSON.stringify(state)
        }
      }
    }

    // Show loading indicator
    const loadingId = el.getAttribute('wu-loading')
    const loadingEl = loadingId ? document.querySelector(loadingId) : null
    if (loadingEl) loadingEl.classList.remove('wu-hidden')

    // wu-stream check
    const isStream = el.hasAttribute('wu-stream')
    const target = el.getAttribute('wu-target')

    if (isStream) {
      // Abort previous stream
      if (activeStream) activeStream.abort()
      const controller = new AbortController()
      activeStream = controller
      opts.signal = controller.signal
    }

    fetch(url, opts)
      .then(async (res) => {
        if (loadingEl) loadingEl.classList.add('wu-hidden')

        if (isStream) {
          return handleStreamResponse(res, el)
        }

        if (!res.ok) {
          // Try to parse error JSON
          try {
            const errData = await res.json()
            if (errData.errors) {
              handleErrors(el, errData.errors)
            }
          } catch {}
          return
        }

        // Handle redirect
        const redirect = res.headers.get('X-WFU-Redirect')
        if (redirect) {
          return (window.location.href = redirect)
        }

        const html = await res.text()
        if (!target) {
          document.open()
          document.write(html)
          document.close()
          init()
          return
        }

        const targetEl = document.querySelector(target)
        if (!targetEl) return

        const swap = el.getAttribute('wu-swap') || 'innerHTML'
        applySwap(targetEl, html, swap)

        // Re-init inside the replaced content
        init(targetEl)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        if (loadingEl) loadingEl.classList.add('wu-hidden')
        // eslint-disable-next-line no-console
      console.warn('[wu] Fetch error:', err)
      })
  }

  function applySwap(target, html, swap) {
    switch (swap) {
      case 'outerHTML':
        target.outerHTML = html
        break
      case 'before':
        target.insertAdjacentHTML('beforebegin', html)
        break
      case 'after':
        target.insertAdjacentHTML('afterend', html)
        break
      case 'prepend':
        target.insertAdjacentHTML('afterbegin', html)
        break
      case 'append':
        target.insertAdjacentHTML('beforeend', html)
        break
      default:
        target.innerHTML = html
    }
  }

  function handleErrors(el, errors) {
    const root = el.closest('[wu-data]') || el
    for (const [field, message] of Object.entries(errors)) {
      const errorEl = root.querySelector('[wu-error="' + field + '"]')
      if (errorEl) errorEl.textContent = message
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  9. SSE streaming (wu-stream, wu-sse)
  // ═══════════════════════════════════════════════════════════════════

  function initSSE(root) {
    // Auto-connect SSE on [wu-sse] elements
    root.querySelectorAll('[wu-sse]').forEach((el) => {
      if (el._wu_sse) return
      const url = el.getAttribute('wu-sse')
      connectSSE(el, url)
    })
  }

  function connectSSE(el, url) {
    el._wu_sse = true
    const es = new EventSource(url)
    el._wu_es = es

    es.addEventListener('message', (e) => {
      try {
        const handler = el.getAttribute('wu-on-sse-message')
        if (handler) {
          const state = findState(el)
          if (state) {
            const _data = JSON.parse(e.data)
            const fn = new Function('$s', 'data', `with($s) { ${handler} }`)
            fn(state, _data)
          }
        }
      } catch {}
    })

    // Custom event handlers: wu-on-sse-{eventName}
    const handlerAttr = Array.from(el.attributes)
      .filter((a) => a.name.startsWith('wu-on-sse-'))
    for (const attr of handlerAttr) {
      const eventName = attr.name.slice('wu-on-sse-'.length)
      const handler = attr.value
      es.addEventListener(eventName, (e) => {
        try {
          const data = JSON.parse(e.data)
          const state = findState(el)
          if (state) {
            const fn = new Function('$s', 'data', `with($s) { ${handler} }`)
            fn(state, data)
          }
        } catch (err) {
          // eslint-disable-next-line no-console
      console.warn('[wu] SSE handler error:', err)
        }
      })
    }
  }

  /** Programmatic SSE stream (used with wu-post/wu-get wu-stream) */
  function handleStreamResponse(res, el) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    async function read() {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            emitSSEEvent(el, data)
          } catch {}
        }
      }
    }

    read().catch(() => {
      activeStream = null
    })
  }

  function emitSSEEvent(el, data) {
    if (!data.type) return
    const handlerAttr = 'wu-on-sse-' + data.type
    const state = findState(el)
    if (!state) return

    // Find handler in el or ancestors
    const handler = el.getAttribute(handlerAttr)
    if (handler) {
      const fn = new Function('$s', 'data', `with($s) { ${handler} }`)
      fn(state, data)
    }
  }

  wu.stream = function (method, url, opts) {
    if (activeStream) activeStream.abort()
    const controller = new AbortController()
    activeStream = controller

    const fetchOpts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...(opts.body ? { body: opts.body } : {}),
    }

    fetch(url, fetchOpts)
      .then(async (res) => {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (opts.onEvent && opts.onEvent[data.type]) {
                opts.onEvent[data.type](data)
              }
            } catch {}
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (opts.onDone) opts.onDone()
      })
  }

  wu.abort = function () {
    if (activeStream) {
      activeStream.abort()
      activeStream = null
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  10. WebSocket (wu-ws)
  // ═══════════════════════════════════════════════════════════════════

  function initWS(root) {
    root.querySelectorAll('[wu-ws]').forEach((el) => {
      if (wsConnections.has(el)) return
      const url = el.getAttribute('wu-ws')
      const ws = new WebSocket(url)
      wsConnections.set(el, ws)

      ws.onopen = () => {
        const handler = el.getAttribute('wu-on-ws-open')
        if (handler) {
          const state = findState(el)
          if (state) evaluateExpr(handler, state)
        }
      }

      ws.onclose = () => {
        const handler = el.getAttribute('wu-on-ws-close')
        if (handler) {
          const state = findState(el)
          if (state) evaluateExpr(handler, state)
        }
      }

      ws.onmessage = (e) => {
        const handler = el.getAttribute('wu-on-ws-message')
        if (handler) {
          const state = findState(el)
          if (state) {
            const fn = new Function('$s', 'data', `with($s) { ${handler} }`)
            fn(state, e.data)
          }
        }
      }
    })
  }

  wu.send = function (data) {
    for (const [, ws] of wsConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(typeof data === 'string' ? data : JSON.stringify(data))
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  11. Theme (wu-theme)
  // ═══════════════════════════════════════════════════════════════════

  function initTheme() {
    // Set initial theme from cookie
    const cookie = document.cookie.match(/theme=([^;]+)/)?.[1] || 'system'
    applyTheme(cookie)

    // Listen for system preference changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const current = document.cookie.match(/theme=([^;]+)/)?.[1] || 'system'
        if (current === 'system') applyTheme('system')
      })
    }
  }

  function applyTheme(value) {
    const theme =
      value === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : value
    document.documentElement.setAttribute('data-theme', theme)
  }

  // Theme switching (delegated click)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[wu-theme]')
    if (!btn) return
    const value = btn.getAttribute('wu-theme')
    applyTheme(value)
    document.cookie = 'theme=' + value + '; Path=/; SameSite=Lax; Max-Age=31536000'
    // Sync with server (no redirect, JSON request)
    fetch('/__theme/' + value, { headers: { Accept: 'application/json' } }).catch(() => {})
    // Toggle all [wu-theme] buttons: dark ↔ light
    document.querySelectorAll('[wu-theme]').forEach((b) => {
      const v = b.getAttribute('wu-theme')
      if (v === 'dark') {
        b.setAttribute('wu-theme', 'light')
        b.textContent = '☀️'
      } else if (v === 'light') {
        b.setAttribute('wu-theme', 'dark')
        b.textContent = '🌙'
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  //  12. i18n (wu-lang, wu-text-key)
  // ═══════════════════════════════════════════════════════════════════

  let i18nMessages = {}

  function initI18n() {
    const script = document.getElementById('__wfw-i18n')
    if (script) {
      try {
        i18nMessages = JSON.parse(script.textContent)
      } catch {}
    }
  }

  // Language switching (delegated click)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[wu-lang]')
    if (!btn) return
    const locale = btn.getAttribute('wu-lang')
    switchLocale(locale)
    // Toggle all [wu-lang] buttons: zh-CN ↔ en
    document.querySelectorAll('[wu-lang]').forEach((b) => {
      const v = b.getAttribute('wu-lang')
      if (v === 'zh-CN') b.setAttribute('wu-lang', 'en')
      else if (v === 'en') b.setAttribute('wu-lang', 'zh-CN')
    })
  })

  async function switchLocale(locale) {
    try {
      const res = await fetch('/__lang/' + locale, {
        headers: { Accept: 'application/json' },
      })
      const data = await res.json()
      // locale updated server-side via data-locale attribute
      i18nMessages = data.messages || {}
      document.cookie = 'locale=' + locale + '; Path=/; SameSite=Lax; Max-Age=31536000'
      document.body.setAttribute('data-locale', locale)
      // Update all wu-text-key elements
      document.querySelectorAll('[wu-text-key]').forEach((el) => {
        const key = el.getAttribute('wu-text-key')
        el.textContent = translate(key)
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[wu] i18n switch failed:', err)
    }
  }

  function translate(key) {
    const msg = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), i18nMessages)
    return msg != null ? String(msg) : key
  }

  wu.t = translate

  // ═══════════════════════════════════════════════════════════════════
  //  13. Flash (wu-flash)
  // ═══════════════════════════════════════════════════════════════════

  function initFlash() {
    const script = document.getElementById('__wfw-flash')
    if (!script) return
    try {
      const data = JSON.parse(script.textContent)
      const container = document.querySelector('[wu-flash]')
      if (!container) return
      showFlash(container, data)
    } catch {}
  }

  function showFlash(container, data) {
    const type = data.type || 'info'
    const message = data.message || data.text || String(data)
    const el = document.createElement('div')
    el.className = 'wu-flash-msg wu-flash-' + type
    el.textContent = message
    container.appendChild(el)
    setTimeout(() => {
      el.classList.add('wu-flash-leaving')
      setTimeout(() => el.remove(), 200)
    }, 3000)
  }

  // ═══════════════════════════════════════════════════════════════════
  //  14. UI Components
  // ═══════════════════════════════════════════════════════════════════

  function initComponents(root) {
    initModal(root)
    initCollapse(root)
    initTabs(root)
    initDropdown(root)
    initToast(root)
    initModels(root)
  }

  // ── Modal ──

  function initModal(root) {
    // Toggle buttons
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[wu-toggle]')
      if (!btn) return
      const target = btn.getAttribute('wu-target')
      if (!target) return
      const modal = root.querySelector(target)
      if (modal && modal.hasAttribute('wu-modal')) {
        modal.classList.toggle('wu-open')
      }
    })

    // Close buttons
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[wu-close]')
      if (!btn) return
      const modal = btn.closest('[wu-modal]')
      if (modal) modal.classList.remove('wu-open')
    })

    // Click outside to close
    root.addEventListener('click', (e) => {
      const modal = e.target.closest('[wu-modal].wu-open')
      if (!modal) return
      if (e.target === modal) modal.classList.remove('wu-open')
    })

    // ESC to close
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        root.querySelectorAll('[wu-modal].wu-open').forEach((m) => m.classList.remove('wu-open'))
      }
    })
  }

  // ── Collapse ──

  function initCollapse(root) {
    root.addEventListener('click', (e) => {
      const toggle = e.target.closest('[wu-collapse] > [wu-toggle]')
      if (!toggle) return
      toggle.parentElement.classList.toggle('wu-open')
    })
  }

  // ── Tabs ──

  function initTabs(root) {
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('[wu-tabs] [wu-tab]')
      if (!tab) return
      const tabs = tab.closest('[wu-tabs]')
      const tabName = tab.getAttribute('wu-tab')
      if (!tabs || !tabName) return

      tabs.querySelectorAll('[wu-tab]').forEach((t) => t.classList.remove('wu-active'))
      tab.classList.add('wu-active')

      tabs.querySelectorAll('[wu-panel]').forEach((p) => p.classList.remove('wu-active'))
      const panel = tabs.querySelector('[wu-panel="' + tabName + '"]')
      if (panel) panel.classList.add('wu-active')
    })
  }

  // ── Dropdown ──

  function initDropdown(root) {
    root.addEventListener('click', (e) => {
      const dd = e.target.closest('[wu-dropdown]')
      if (!dd) return
      const toggle = e.target.closest('[wu-toggle]')
      if (toggle && dd.contains(toggle)) {
        dd.classList.toggle('wu-open')
        e.stopPropagation()
        return
      }
    })

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      document.querySelectorAll('[wu-dropdown].wu-open').forEach((dd) => {
        if (!dd.contains(e.target)) dd.classList.remove('wu-open')
      })
    })
  }

  // ── Toast ──

  let toastContainer = null

  function initToast() {
    toastContainer = document.querySelector('.wu-toast-container')
    if (!toastContainer) {
      toastContainer = document.createElement('div')
      toastContainer.className = 'wu-toast-container'
      document.body.appendChild(toastContainer)
    }
  }

  wu.toast = function (message, type) {
    type = type || 'info'
    const el = document.createElement('div')
    el.className = 'wu-toast wu-toast-' + type
    el.textContent = message
    toastContainer.appendChild(el)
    setTimeout(() => {
      el.classList.add('wu-toast-leaving')
      setTimeout(() => el.remove(), 200)
    }, 3000)
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Expose
  // ═══════════════════════════════════════════════════════════════════

  window.wu = wu
  window.wu_ = wu // shorthand for inline scripts

  // Convenience: re-init when new content is loaded
  document.addEventListener('wu:content-loaded', (e) => {
    init(e.detail || document.body)
  })
})()
