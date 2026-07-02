/**
 * @weifuwu/ui — Browser entry
 *
 * Exposed as `weifuwu` global (IIFE).
 * Usage:
 *   <script src="/_ui/weifuwu-ui.js"></script>
 *   <script>
 *     const { ref, h, render } = weifuwu
 *   </script>
 */

import { ref, computed, effect, Signal, Computed } from './signal.ts'
import { h, text, fragment, triggerMount } from './h.ts'
import { bind } from './bind.ts'
import { render, reactiveRender } from './render.ts'

// ── Server data bridge ──
// Reads __wui-data from the page (injected by server) and exposes it as signals.
function initServerBridge() {
  const el = document.getElementById('__wui-data')
  if (!el) return null
  try {
    return JSON.parse(el.textContent || '{}')
  } catch {
    return null
  }
}

const serverData = initServerBridge()

// Create reactive stores from server data
const themeSignal = ref(serverData?.theme || 'system')
const localeSignal = ref(serverData?.locale || 'en')
const messagesSignal = ref(serverData?.messages || {})

// ── Theme store (bridges ctx.theme from server) ──
export const theme = {
  value: themeSignal,
  resolved: computed(() => {
    const t = themeSignal.value
    if (t === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return t
  }),
  toggle() {
    const next = themeSignal.value === 'dark' ? 'light' : 'dark'
    // Apply to document
    document.documentElement.dataset.theme = next
    themeSignal.value = next
    // Sync to server (optional, fire-and-forget)
    fetch(`/__theme/${next}`, { headers: { accept: 'application/json' } })
  },
  set(val: string) {
    document.documentElement.dataset.theme = val
    themeSignal.value = val
    fetch(`/__theme/${val}`, { headers: { accept: 'application/json' } })
  },
}

// ── I18n store (bridges ctx.i18n from server) ──
export const i18n = {
  locale: localeSignal,
  messages: messagesSignal,
  t(key: string, params?: Record<string, string>): string {
    const msgs = messagesSignal.value as Record<string, unknown>
    const msg = key.split('.').reduce((o: unknown, k: string) => (o as Record<string, unknown> | undefined)?.[k], msgs)
    if (msg == null) return key
    let result = String(msg)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{${k}}`, v)
      }
    }
    return result
  },
  set(locale: string) {
    localeSignal.value = locale
    fetch(`/__lang/${locale}`, { headers: { accept: 'application/json' } })
  },
}

// ── Toast store ──
export const toast = {
  list: ref<Array<{ id: number; message: string; type: string }>>([]),
  _nextId: 0,
  show(message: string, type: string = 'info', duration: number = 3000) {
    const id = this._nextId++
    this.list.value = [...this.list.value, { id, message, type }]
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration)
    }
  },
  dismiss(id: number) {
    this.list.value = this.list.value.filter(t => t.id !== id)
  },
  success(msg: string) { this.show(msg, 'success') },
  error(msg: string) { this.show(msg, 'error') },
  info(msg: string) { this.show(msg, 'info') },
  warning(msg: string) { this.show(msg, 'warning') },
}

// ── Modal store ──
export const modal = {
  open: ref<string | null>(null),
  show(id: string) { this.open.value = id },
  hide(id?: string) {
    if (!id || this.open.value === id) this.open.value = null
  },
}

// Export all
export { ref, computed, effect, Signal, Computed }
export { h, text, fragment, triggerMount }
export { bind }
export { render, reactiveRender }

// Auto-apply theme on load
if (serverData?.theme) {
  document.documentElement.dataset.theme = theme.resolved.value
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  // Re-evaluate resolved computed
  if (themeSignal.value === 'system') {
    document.documentElement.dataset.theme = theme.resolved.value
  }
})
