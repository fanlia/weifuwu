import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
before(setupJsdom)
const { createClientBrowser } = await import('./browser.ts')
const browser = createClientBrowser()

describe('ctx.browser（浏览器环境抽象）', () => {
  afterEach(() => { browser.clearBody() })

  it('copyText：clipboard API 优先', async () => {
    let written = ''
    Object.defineProperty(window, 'navigator', {
      value: { clipboard: { writeText: async (t: string) => { written = t } } },
      configurable: true, writable: true,
    })
    const b = createClientBrowser()
    const ok = await b.copyText('hello')
    assert.equal(ok, true)
    assert.equal(written, 'hello')
  })

  it('copyText：clipboard 拒绝 → execCommand 降级', async () => {
    let execCalled = false
    Object.defineProperty(window, 'navigator', {
      value: { clipboard: { writeText: async () => { throw new Error('denied') } } },
      configurable: true, writable: true,
    })
    ;(document as any).execCommand = () => { execCalled = true; return true }
    const b = createClientBrowser()
    const ok = await b.copyText('fallback')
    assert.equal(ok, true)
    assert.equal(execCalled, true)
    assert.equal(document.body.textContent, '') // 临时 textarea 已清理
  })

  it('copyText：clipboard 不可用 → execCommand 降级', async () => {
    let execCalled = false
    Object.defineProperty(window, 'navigator', { value: {}, configurable: true, writable: true })
    ;(document as any).execCommand = () => { execCalled = true; return true }
    const b = createClientBrowser()
    await b.copyText('no-clip')
    assert.equal(execCalled, true)
  })

  it('byId/query/activeElement 正常（jsdom）', () => {
    const div = browser.createElement('div')
    div.id = 'target'
    div.className = 'cls-a'
    browser.bodyAppend(div)
    const b = createClientBrowser()
    assert.equal(b.byId('target'), div)
    assert.equal(b.query('.cls-a'), div)
    assert.equal(typeof b.activeElement(), 'object')
  })

  it('scrollTop/hash/rootElement 安全读取', () => {
    const b = createClientBrowser()
    assert.equal(typeof b.scrollTop(), 'number')
    assert.equal(typeof b.hash(), 'string')
    assert.ok(b.rootElement())
    assert.equal(b.viewportHeight() > 0, true) // jsdom 有 innerHeight
  })
})
