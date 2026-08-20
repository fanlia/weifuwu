/**
 * testBrowser Proxy/Trace 契约测试（AGENTS §7.1.4——client 测试必须基于
 * testBrowser——本文件锁定 testBrowser 行为不变量）
 *
 * 不变量：
 * - **每次操作记录**：call/set 全记录（含参数/返回值摘要）；顶层 get 记录
 * - **身份保持**：同一 target 恒同一 proxy（`===`——assertKept 依赖）；
 *   不同 target 恒不同 proxy（createElement 每次新元素——真实 DOM 语义）
 * - **语义保持**：instanceof/nodeType/contains/appendChild/dispatchEvent
 *   经 proxy 不破（jsdom 内部槽位——方法 this 绑定 raw target）
 * - **过滤/统计/打印**：trace.filter/count/clear/print
 * - **全局安装/恢复**：installJsdomGlobals/restoreJsdomGlobals 成对零残留
 */

import { describe, it, test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser, installJsdomGlobals, restoreJsdomGlobals } from './setup.ts'

describe('testBrowser Proxy 追踪', () => {
  it('call 全记录：createElement/appendChild 参数与返回值摘要', () => {
    const browser = testBrowser()
    const div = browser.document.createElement('div')
    browser.document.body.appendChild(div)
    const calls = browser.trace.filter('document.createElement').filter((e) => e.kind === 'call')
    assert.ok(calls.length >= 1, 'createElement 调用被记录')
    assert.equal(calls[0].args, '"div"')
    assert.equal(calls[0].ret, '[DIV]', '返回值摘要（nodeName）')
    assert.ok(browser.trace.filter('appendChild').filter((e) => e.kind === 'call').length >= 1, 'appendChild 被记录')
  })

  it('set 记录：innerHTML 赋值', () => {
    const browser = testBrowser()
    browser.document.body.innerHTML = '<b>x</b>'
    const sets = browser.trace.filter('innerHTML').filter((e) => e.kind === 'set')
    assert.ok(sets.length >= 1, 'innerHTML set 被记录')
    assert.equal(sets[0].args, '"<b>x</b>"')
  })

  it('顶层 get 记录：window.location / document.body', () => {
    const browser = testBrowser()
    browser.pathname()
    assert.ok(browser.trace.filter('window.location').filter((e) => e.kind === 'get').length >= 1, 'window.location get 被记录')
    browser.bodyElement()
    assert.ok(browser.trace.filter('document.body').filter((e) => e.kind === 'get').length >= 1, 'document.body get 被记录')
  })

  it('身份保持：同一 target 恒同一 proxy（===）——不同 target 恒不同', () => {
    const browser = testBrowser()
    assert.equal(browser.document.body, browser.document.body, 'body 身份保持')
    assert.equal(browser.window.document, browser.document, 'window.document === document')
    const el = browser.document.createElement('div')
    assert.equal(el.firstChild, el.firstChild, '节点遍历同 target 同 proxy')
    assert.equal(el.parentNode, el.parentNode, 'parentNode 同 target 同 proxy')
    const a = browser.document.createElement('div')
    const b = browser.document.createElement('div')
    assert.notEqual(a, b, 'createElement 每次新元素（真实 DOM 语义）')
  })

  it('语义保持：instanceof/nodeType/contains/appendChild/dispatchEvent', () => {
    const browser = testBrowser()
    const { window: win, document: doc } = browser
    const el = doc.createElement('div')
    assert.ok(el instanceof win.HTMLElement, 'instanceof 保持')
    assert.equal(el.nodeType, 1, 'nodeType 保持')
    assert.equal(doc.nodeType, 9, 'document nodeType 保持')
    const span = doc.createElement('span')
    el.appendChild(span)
    assert.equal(span.parentNode, el, 'parentNode 身份')
    doc.body.appendChild(el)
    assert.ok(doc.body.contains(el), 'contains 经 proxy 参数成立')
    let got = 0
    el.addEventListener('click', () => { got++ })
    el.dispatchEvent(new win.Event('click', { bubbles: true }))
    assert.equal(got, 1, 'dispatchEvent 经 proxy 触发')
    span.textContent = 'x'
    assert.equal(el.textContent, 'x', 'textContent 读写经 proxy 成立')
    const removed = el.removeChild(span)
    assert.equal(removed.textContent, 'x', 'removeChild 经 proxy 成立')
    // 集合（querySelectorAll/childNodes）与遍历链身份一致（assertKept 依赖）
    const keep = doc.createElement('k')
    el.appendChild(keep)
    const col = doc.querySelectorAll('k')
    assert.equal(col[0], col.item(0), '集合下标与 item() 同 proxy')
    assert.equal(col[0], doc.querySelector('k'), '集合项与 querySelector 同 proxy')
    assert.equal([...col][0], col[0], '迭代产出与下标同 proxy')
    assert.equal(el.childNodes[0], el.firstChild, 'childNodes 项与 firstChild 同 proxy')
    assert.equal(Array.from(el.children)[0], el.firstChild, 'children 迭代与遍历链同 proxy')
  })

  it('trace.filter/count/clear 断言面', () => {
    const browser = testBrowser()
    browser.document.createElement('div')
    browser.document.createElement('span')
    assert.equal(browser.trace.count('createElement'), 4, 'count 统计（2 get + 2 call）')
    assert.equal(browser.trace.filter('createElement').filter((e) => e.kind === 'call').length, 2)
    browser.trace.clear()
    assert.equal(browser.trace.entries.length, 0, 'clear 清空')
  })

  it('trace.print 输出格式（log:true + filter）', () => {
    const logs: string[] = []
    const orig = console.log
    console.log = (...a: unknown[]) => { logs.push(a.join(' ')) }
    try {
      const browser = testBrowser({ log: true, filter: 'createElement' })
      browser.document.createElement('div')
      browser.document.body.appendChild(browser.document.createElement('span'))
      // filter=createElement：span 的 createElement 打印，appendChild 不打印
      assert.ok(logs.some((l) => l.includes('[jsdom]') && l.includes('createElement') && l.includes('"div"')), 'filter 打印匹配调用')
      assert.ok(!logs.some((l) => l.includes('appendChild')), 'filter 排除不匹配调用')
    } finally {
      console.log = orig
    }
  })

  it('event 构造跨 realm 安全（browser.event）', () => {
    const browser = testBrowser()
    const ev = browser.event('click', { bubbles: true })
    assert.equal(ev.type, 'click')
    assert.ok(ev instanceof browser.window.Event, 'Event 实例')
    assert.equal(typeof ev.bubbles, 'boolean')
  })
})

describe('jsdom polyfill（缺失能力收敛——一处实现——驱动面）', () => {
  it('matchMedia：默认 false；setMediaQueries 设定 + change 事件', () => {
    const browser = testBrowser()
    const mql = browser.window.matchMedia('(prefers-reduced-motion: reduce)')
    assert.equal(mql.matches, false, '默认不匹配')
    let changed = 0
    mql.addEventListener('change', () => { changed++ })
    browser.setMediaQueries({ '(prefers-reduced-motion: reduce)': true })
    assert.equal(mql.matches, true, '设定后匹配')
    assert.equal(changed, 1, 'change 事件触发（jsdom EventTarget）')
    browser.setMediaQueries({ '(prefers-reduced-motion: reduce)': true })
    assert.equal(changed, 1, '无变化不触发')
  })

  it('IntersectionObserver：fireIO 手动触发回调（确定性驱动）', () => {
    const browser = testBrowser()
    const entries: Array<{ isIntersecting: boolean }> = []
    const io = new browser.window.IntersectionObserver((es) => entries.push(...es))
    const el = browser.document.createElement('div')
    io.observe(el)
    browser.fireIO(el, { isIntersecting: true })
    assert.equal(entries.length, 1)
    assert.equal(entries[0].isIntersecting, true)
    io.disconnect()
    browser.fireIO(el, { isIntersecting: false })
    assert.equal(entries.length, 1, 'disconnect 后不再触发')
  })

  it('visualViewport：setViewport 更新 + resize/scroll 事件', () => {
    const browser = testBrowser()
    const vv = browser.window.visualViewport
    assert.ok(vv, 'visualViewport 存在（jsdom 原生无）')
    let resized = 0
    vv.addEventListener('resize', () => { resized++ })
    browser.setViewport({ height: 500, offsetTop: 120 })
    assert.equal(vv.height, 500)
    assert.equal(vv.offsetTop, 120)
    assert.equal(resized, 1)
  })

  it('scrollTo：真实现写 scrollingElement.scrollTop（jsdom 桩不抛错）', () => {
    const browser = testBrowser()
    const scroller = browser.document.scrollingElement ?? browser.document.documentElement
    assert.doesNotThrow(() => browser.window.scrollTo(0, 42))
    assert.equal(browser.scrollTop(), 42, 'scrollTo 真实写入')
    browser.window.scrollTo({ top: 7 })
    assert.equal(browser.scrollTop(), 7, 'ScrollToOptions 形态')
  })

  it('navigator.clipboard：writeText → 断言缓冲', async () => {
    const browser = testBrowser()
    await browser.window.navigator.clipboard.writeText('hello')
    assert.deepEqual(browser.__clipboardWrites, ['hello'])
  })

  it('CSS.escape：规范算法（jsdom 无）', () => {
    const browser = testBrowser()
    assert.equal(browser.window.CSS.escape('.a.b'), '\\.a\\.b')
    assert.equal(browser.window.CSS.escape('0abc'), '\\30 abc')
    assert.equal(browser.window.CSS.escape('中'), '中')
  })

  it('URL.createObjectURL/revokeObjectURL：对象 URL 工厂', () => {
    const browser = testBrowser()
    const blob = new browser.window.Blob(['x'], { type: 'text/plain' })
    const url = browser.window.URL.createObjectURL(blob)
    assert.ok(url.startsWith('blob:jsdom/'), 'URL 可创建（jsdom 原生无）')
    assert.doesNotThrow(() => browser.window.URL.revokeObjectURL(url))
  })
})

describe('installJsdomGlobals / restoreJsdomGlobals', () => {
  it('安装后 document/window 可用；恢复后零残留', () => {
    const before = { doc: (globalThis as Record<string, unknown>).document, win: (globalThis as Record<string, unknown>).window }
    const browser = testBrowser()
    const restore = installJsdomGlobals(browser)
    assert.equal(globalThis.document, browser.document, 'document 指向 testBrowser 实例')
    assert.equal(globalThis.window, browser.window, 'window 指向 testBrowser 实例')
    assert.ok(globalThis.document.querySelector('#root'), 'root 预置存在')
    globalThis.document.body.innerHTML = '<i>t</i>'
    assert.equal(browser.document.querySelector('i')?.textContent, 't', '全局写操作同步到实例')
    restore()
    assert.equal(globalThis.document, before.doc, '恢复原 document')
    assert.equal(globalThis.window, before.win, '恢复原 window')
  })

  it('重复 install 幂等（同浏览器）', () => {
    const browser = testBrowser()
    installJsdomGlobals(browser)
    const restore2 = installJsdomGlobals(browser)
    assert.equal(typeof restore2, 'function')
    restoreJsdomGlobals()
    restoreJsdomGlobals() // 第二次无操作
  })
})

test('trace 与引擎兼容：mountToDom 经 proxy——同 target 身份 + instanceof 保持', async () => {
  const { mountToDom } = await import('./testing.ts')
  const browser = testBrowser()
  const container = browser.document.createElement('div')
  browser.document.body.appendChild(container)
  const vnode = {
    type: 'ul',
    props: {
      children: [
        { type: 'li', props: { children: 'A' } },
        { type: 'li', props: { children: 'B' } },
      ],
    },
  }
  await mountToDom(container, vnode, {})
  assert.equal(container.querySelector('ul')?.textContent, 'AB', 'mount 经 proxy 落地')
  // 同 target 跨入口身份：querySelector 与遍历链一致（assertKept 语义）
  const ul = container.firstChild
  assert.equal(container.querySelector('ul'), ul, 'querySelector 与 firstChild 同 proxy')
  const liA = ul.firstChild
  assert.equal(ul.querySelector('li'), liA, '子节点跨入口同 proxy')
  assert.ok(liA instanceof browser.window.HTMLElement, '引擎产物 instanceof 保持')
  assert.equal(liA.nodeType, 1)
  // childNodes（raw NodeList 元素）语义一致（nodeType 判定）
  assert.equal(ul.childNodes[0].nodeType, 1)
})
