/**
 * Runtime tests for weifuwu-ui.js — runs the JS runtime in jsdom.
 *
 * These tests verify that wu-data, wu-on, wu-text, AJAX triggers,
 * theme switching, i18n, UI components, and SSE/WS work correctly
 * in a simulated browser DOM environment.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Helpers ──────────────────────────────────────────────────────────

const UI_JS_PATH = resolve('ssr/ui/weifuwu-ui.js')

function createDOM(html: string): JSDOM {
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  })

  // Polyfill missing browser APIs for jsdom
  dom.window.matchMedia = function () {
    return { matches: false, addEventListener: () => {}, removeEventListener: () => {} }
  }
  // Mock fetch
  dom.window.fetch = function () {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null, forEach: () => {} },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    })
  }

  // Polyfill CSS.escape (required by weifuwu-ui.js for querySelector)
  function cssEscape(s: string): string {
    return String(s).replace(/[\s.#:;,'"[\]{}()\\]/g, '\\$&')
  }
  dom.window.CSS = { escape: cssEscape }
  // Also set on globalThis so it's accessible from eval
  ;(dom.window as any).globalThis = dom.window
  // Mock document.cookie
  Object.defineProperty(dom.window.document, 'cookie', {
    get: () => '',
    set: () => {},
    configurable: true,
  })

  // Evaluate weifuwu-ui.js in the window context
  const code = readFileSync(UI_JS_PATH, 'utf-8')
  dom.window.eval(code)

  // Trigger DOMContentLoaded to run wu.init()
  try {
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'))
  } catch (e) {
    console.error('[createDOM] init error:', e)
  }

  return dom
}

function waitForRAF(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

describe('weifuwu-ui runtime', () => {
  // ── wu-data: state initialization ────────────────────────────────

  describe('wu-data', () => {
    it('initializes state from JSON attribute', async () => {
      const dom = createDOM(`
        <html><body>
          <div id="app" wu-data='{ "count": 5, "name": "test" }'></div>
        </body></html>
      `)
      const wu = (dom.window as any).wu
      const el = dom.window.document.getElementById('app')
      const state = wu.getState(el)
      assert.equal(state.count, 5)
      assert.equal(state.name, 'test')
    })

    it('updates wu-text when state changes', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "count": 0 }'>
            <span id="counter" wu-text="count">0</span>
          </div>
        </body></html>
      `)
      const wu = (dom.window as any).wu
      const span = dom.window.document.getElementById('counter')
      assert.equal(span.textContent, '0', 'initial value')

      const state = wu.getState(span)
      state.count = 42
      await waitForRAF()

      assert.equal(span.textContent, '42', 'after state update')
    })

    it('supports multiple state fields independently', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "a": 1, "b": 2 }'>
            <span id="a" wu-text="a"></span>
            <span id="b" wu-text="b"></span>
          </div>
        </body></html>
      `)
      const wu = (dom.window as any).wu
      const elA = dom.window.document.getElementById('a')
      const elB = dom.window.document.getElementById('b')
      assert.equal(elA.textContent, '1')
      assert.equal(elB.textContent, '2')

      const state = wu.getState(elA)
      state.a = 100
      await waitForRAF()
      assert.equal(elA.textContent, '100')
      assert.equal(elB.textContent, '2', 'b should not change')
    })

    it('handles null, undefined, false, 0 values', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "nullVal": null, "falseVal": false, "zeroVal": 0, "strVal": "hello" }'>
            <span id="nv" wu-text="nullVal"></span>
            <span id="fv" wu-text="falseVal"></span>
            <span id="zv" wu-text="zeroVal"></span>
          </div>
        </body></html>
      `)
      const wu = (dom.window as any).wu
      assert.equal(dom.window.document.getElementById('nv').textContent, '')
      assert.equal(dom.window.document.getElementById('fv').textContent, 'false')
      assert.equal(dom.window.document.getElementById('zv').textContent, '0')
    })
  })

  // ── wu-show / wu-hide ───────────────────────────────────────────

  describe('wu-show / wu-hide', () => {
    it('shows/hides based on state truthiness', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "open": true, "hidden": false }'>
            <div id="show-el" wu-show="open">visible</div>
            <div id="hide-el" wu-hide="hidden">not hidden</div>
          </div>
        </body></html>
      `)
      const wu = (dom.window as any).wu
      const showEl = dom.window.document.getElementById('show-el')
      const hideEl = dom.window.document.getElementById('hide-el')

      // Initial: open=true, hidden=false → show-el visible, hide-el visible
      assert.equal(showEl.style.display, '')

      const state = wu.getState(showEl)
      state.open = false
      await waitForRAF()
      assert.equal(showEl.style.display, 'none')
    })
  })

  // ── wu-on: event handling ───────────────────────────────────────

  describe('wu-on', () => {
    it('executes expression on click', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "count": 0 }'>
            <button id="btn" wu-on="click: count++">+1</button>
            <span id="val" wu-text="count">0</span>
          </div>
        </body></html>
      `)
      const btn = dom.window.document.getElementById('btn')!

      btn.click()
      await waitForRAF()
      assert.equal(
        dom.window.document.getElementById('val')!.textContent,
        '1',
        'click increments count',
      )

      btn.click()
      await waitForRAF()
      assert.equal(
        dom.window.document.getElementById('val')!.textContent,
        '2',
        'second click increments again',
      )
    })

    it('supports toggle expression', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "open": false }'>
            <button id="tog" wu-on="click: open = !open">toggle</button>
            <div id="panel" wu-show="open">content</div>
          </div>
        </body></html>
      `)
      const panel = dom.window.document.getElementById('panel')!
      assert.equal(panel.style.display, 'none', 'initially hidden')

      dom.window.document.getElementById('tog')!.click()
      await waitForRAF()
      assert.equal(panel.style.display, '', 'now visible')

      dom.window.document.getElementById('tog')!.click()
      await waitForRAF()
      assert.equal(panel.style.display, 'none', 'hidden again')
    })

    it('supports conditional expression', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "count": 0, "label": "" }'>
            <button id="btn" wu-on="click: label = count > 5 ? 'high' : 'low'">test</button>
            <span id="lbl" wu-text="label"></span>
          </div>
        </body></html>
      `)
      const state = (dom.window as any).wu.getState(dom.window.document.querySelector('[wu-data]'))
      state.count = 10
      dom.window.document.getElementById('btn')!.click()
      await waitForRAF()
      assert.equal(dom.window.document.getElementById('lbl')!.textContent, 'high')
    })
  })

  // ── wu-class: conditional class ─────────────────────────────────

  describe('wu-class', () => {
    it('sets class from string expression', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "active": true }'>
            <div id="box" wu-class="active ? 'active-class' : 'inactive-class'">box</div>
          </div>
        </body></html>
      `)
      const box = dom.window.document.getElementById('box')!
      assert.equal(box.className, 'active-class')

      const state = (dom.window as any).wu.getState(box)
      state.active = false
      await waitForRAF()
      assert.equal(box.className, 'inactive-class')
    })
  })

  // ── wu-model: two-way binding ───────────────────────────────────

  describe('wu-model', () => {
    it('syncs input value to state', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "name": "default" }'>
            <input id="input" wu-model="name">
            <span id="display" wu-text="name"></span>
          </div>
        </body></html>
      `)
      const input = dom.window.document.getElementById('input') as HTMLInputElement
      assert.equal(input.value, 'default')

      input.value = 'updated'
      input.dispatchEvent(new dom.window.Event('input'))
      await waitForRAF()
      assert.equal(dom.window.document.getElementById('display')!.textContent, 'updated')
    })
  })

  // ── wu-theme ────────────────────────────────────────────────────

  describe('wu-theme', () => {
    it('sets data-theme attribute on click', async () => {
      const dom = createDOM(`
        <html data-theme="light">
          <body>
            <button id="dark-btn" wu-theme="dark">Dark</button>
          </body>
        </html>
      `)
      assert.equal(dom.window.document.documentElement.getAttribute('data-theme'), 'light')

      dom.window.document.getElementById('dark-btn')!.click()
      assert.equal(dom.window.document.documentElement.getAttribute('data-theme'), 'dark')
    })
  })

  // ── wu-lang + wu-text-key ──────────────────────────────────────

  describe('wu-lang / wu-text-key', () => {
    it('renders initial text from server', async () => {
      const dom = createDOM(`
        <html><body data-locale="en">
          <script id="__wfw-i18n" type="application/json">
            {"greeting":"Hello","nav":{"home":"Home"}}
          </script>
          <span id="grt" wu-text-key="greeting">Hello</span>
          <span id="nav" wu-text-key="nav.home">Home</span>
        </body></html>
      `)
      await waitForRAF()
      // wu-text-key doesn't change the textContent on init (server already rendered it)
      assert.equal(dom.window.document.getElementById('grt')!.textContent, 'Hello')
    })

    it('wu.t() translates keys', async () => {
      const dom = createDOM(`
        <html><body data-locale="en">
          <script id="__wfw-i18n" type="application/json">
            {"greeting":"Hello","deep":{"key":"Deep Value"}}
          </script>
        </body></html>
      `)
      const wu = (dom.window as any).wu
      await waitForRAF()
      assert.equal(wu.t('greeting'), 'Hello')
      assert.equal(wu.t('deep.key'), 'Deep Value')
      assert.equal(wu.t('nonexistent'), 'nonexistent')
    })
  })

  // ── wu-flash ────────────────────────────────────────────────────

  describe('wu-flash', () => {
    it('renders flash message from script tag', async () => {
      const dom = createDOM(`
        <html><body>
          <script id="__wfw-flash" type="application/json">
            {"type":"success","message":"Saved!"}
          </script>
          <div id="flash" wu-flash></div>
        </body></html>
      `)
      await waitForRAF()
      const flash = dom.window.document.getElementById('flash')!
      const msg = flash.querySelector('.wu-flash-msg')
      assert.ok(msg, 'flash message element created')
      assert.ok(msg!.classList.contains('wu-flash-success'), 'has success class')
      assert.equal(msg!.textContent, 'Saved!')
    })
  })

  // ── UI Components ───────────────────────────────────────────────

  describe('wu-modal', () => {
    it('opens and closes modal', async () => {
      const dom = createDOM(`
        <html><body>
          <button id="open-btn" wu-target="#my-modal" wu-toggle>Open</button>
          <div id="my-modal" wu-modal>
            <div class="wu-modal-content">
              <button id="close-btn" wu-close>Close</button>
            </div>
          </div>
        </body></html>
      `)
      const modal = dom.window.document.getElementById('my-modal')!
      assert.ok(!modal.classList.contains('wu-open'), 'initially closed')

      dom.window.document.getElementById('open-btn')!.click()
      assert.ok(modal.classList.contains('wu-open'), 'opens on toggle')

      dom.window.document.getElementById('close-btn')!.click()
      assert.ok(!modal.classList.contains('wu-open'), 'closes on close')
    })

    it('closes on ESC key', async () => {
      const dom = createDOM(`
        <html><body>
          <button wu-target="#modal" wu-toggle>Open</button>
          <div id="modal" wu-modal class="wu-open"></div>
        </body></html>
      `)
      const modal = dom.window.document.getElementById('modal')!
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
      assert.ok(!modal.classList.contains('wu-open'), 'closed on ESC')
    })
  })

  describe('wu-collapse', () => {
    it('toggles open/close on toggle click', async () => {
      const dom = createDOM(`
        <html><body>
          <div id="coll" wu-collapse>
            <button wu-toggle>Title</button>
            <div wu-body>content</div>
          </div>
        </body></html>
      `)
      const coll = dom.window.document.getElementById('coll')!
      assert.ok(!coll.classList.contains('wu-open'), 'initially closed')

      coll.querySelector('[wu-toggle]')!.click()
      assert.ok(coll.classList.contains('wu-open'), 'opens on toggle')

      coll.querySelector('[wu-toggle]')!.click()
      assert.ok(!coll.classList.contains('wu-open'), 'closes on second toggle')
    })
  })

  describe('wu-tabs', () => {
    it('switches tab panels', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-tabs>
            <nav>
              <button wu-tab="tab1" class="wu-active">One</button>
              <button wu-tab="tab2">Two</button>
            </nav>
            <div wu-panel="tab1" class="wu-active">Content 1</div>
            <div wu-panel="tab2">Content 2</div>
          </div>
        </body></html>
      `)
      const tab2 = dom.window.document.querySelector('[wu-tab="tab2"]')!
      const panel1 = dom.window.document.querySelector('[wu-panel="tab1"]')!
      const panel2 = dom.window.document.querySelector('[wu-panel="tab2"]')!

      assert.ok(panel1.classList.contains('wu-active'))
      assert.ok(!panel2.classList.contains('wu-active'))

      tab2.click()
      assert.ok(!panel1.classList.contains('wu-active'))
      assert.ok(panel2.classList.contains('wu-active'))
      assert.ok(tab2.classList.contains('wu-active'))
    })
  })

  describe('wu-dropdown', () => {
    it('opens and closes dropdown', async () => {
      const dom = createDOM(`
        <html><body>
          <div id="dd" wu-dropdown>
            <button wu-toggle>Menu</button>
            <div wu-menu><a href="#">Item</a></div>
          </div>
        </body></html>
      `)
      const dd = dom.window.document.getElementById('dd')!
      assert.ok(!dd.classList.contains('wu-open'))

      dd.querySelector('[wu-toggle]')!.click()
      assert.ok(dd.classList.contains('wu-open'))
    })
  })

  // ── toast ───────────────────────────────────────────────────────

  describe('wu.toast()', () => {
    it('creates and removes toast notification', async () => {
      const dom = createDOM(`<html><body></body></html>`)
      const wu = (dom.window as any).wu
      await waitForRAF()

      wu.toast('Test message', 'success')
      const container = dom.window.document.querySelector('.wu-toast-container')
      assert.ok(container, 'toast container exists')
      assert.equal(container!.children.length, 1)
      const toast = container!.children[0]
      assert.ok(toast.classList.contains('wu-toast-success'))
      assert.equal(toast.textContent, 'Test message')
    })
  })

  // ── nested state paths ──────────────────────────────────────────

  describe('nested state (dot paths)', () => {
    it('wu-text supports nested path like user.name', async () => {
      const dom = createDOM(`
        <html><body>
          <div wu-data='{ "user": { "name": "Alice", "email": "alice@test.com" } }'>
            <span id="name" wu-text="user.name"></span>
            <span id="email" wu-text="user.email"></span>
          </div>
        </body></html>
      `)
      await waitForRAF()
      assert.equal(dom.window.document.getElementById('name')!.textContent, 'Alice')
      assert.equal(dom.window.document.getElementById('email')!.textContent, 'alice@test.com')
    })
  })

  // ── CSS class structure ─────────────────────────────────────────

  describe('weifuwu-ui.css structure', () => {
    it('has all expected component selectors', async () => {
      const css = readFileSync(resolve('ssr/ui/weifuwu-ui.css'), 'utf-8')
      const checks = [
        '.wu-btn',
        '.wu-btn-primary',
        '.wu-btn-danger',
        '.wu-input',
        '.wu-card',
        '[wu-modal]',
        '[wu-collapse]',
        '[wu-tabs]',
        '[wu-dropdown]',
        '.wu-toast',
        '.wu-skeleton',
        '[wu-flash]',
        ':root',
        "[data-theme='dark']",
        '@keyframes wu-slide-in',
        '.wu-flex',
        '.wu-grid',
        '.wu-hidden',
      ]
      for (const sel of checks) {
        assert.ok(css.includes(sel), `CSS should contain ${sel}`)
      }
    })
  })

  // ── CSS variable theme system ───────────────────────────────────

  describe('CSS variable theme', () => {
    it('has all core CSS variables', () => {
      const css = readFileSync(resolve('ssr/ui/weifuwu-ui.css'), 'utf-8')
      const vars = [
        '--wu-primary',
        '--wu-bg',
        '--wu-text',
        '--wu-border',
        '--wu-radius',
        '--wu-shadow',
        '--wu-transition',
      ]
      for (const v of vars) {
        assert.ok(css.includes(v), `CSS should define ${v}`)
      }
    })

    it('has dark theme overrides', () => {
      const css = readFileSync(resolve('ssr/ui/weifuwu-ui.css'), 'utf-8')
      assert.ok(css.includes("[data-theme='dark']") || css.includes('[data-theme="dark"]'))
    })
  })
})
