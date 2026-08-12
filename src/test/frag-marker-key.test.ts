/** fragment-start/end 边界标记带数组项 key（id 有则写）——DOM 内数组项身份可见 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { h } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

describe('数组项边界标记（fragment-start/end + key/id）', () => {
  it('嵌套数组项标记带 key（外层下标）；无 id 省略', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const browser = createClientBrowser()
    const { ctx } = createVdomContext({ root: container, browser })
    const handle = mountRoot({ root: container, ctx, browser })
    // [[a,b], c] — 数组项 [a,b] 外层下标 0
    await handle.mount(h('div', { class: 'w' }, [[h('i', { id: 'a' }), h('i', { id: 'b' })], h('i', { id: 'c' })]))
    const w = container.querySelector('.w')!
    const comments = [...w.childNodes].filter(n => n.nodeType === 8).map(n => n.nodeValue)
    assert.ok(comments[0]?.includes('wf-hole:fragment-start key="0"'), `start 标记带 key: ${comments[0]}`)
    assert.ok(comments[1]?.includes('wf-hole:fragment-end key="0"'), `end 标记带 key: ${comments[1]}`)
    assert.ok(!comments[0]?.includes(' id='), '无 id 时不写 id 字段')
    handle.close?.()
    document.body.removeChild(container)
  })

  it('多层嵌套：内层数组项标记 key 层级独立（各自内层下标）', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const browser = createClientBrowser()
    const { ctx } = createVdomContext({ root: container, browser })
    const handle = mountRoot({ root: container, ctx, browser })
    // [[ [a], b ], c] — 外层数组项 [ [a], b ]（key="0"）；内层数组项 [a]（key="0" 内层）
    await handle.mount(h('div', { class: 'w' }, [[[h('i', { id: 'a' })], h('i', { id: 'b' })], h('i', { id: 'c' })]))
    const w = container.querySelector('.w')!
    const comments = [...w.childNodes].filter(n => n.nodeType === 8).map(n => n.nodeValue)
    const starts = comments.filter(c => c?.includes('fragment-start'))
    assert.equal(starts.length, 2, `两层嵌套 → 2 个 start 标记（实际: ${starts.join(' | ')}）`)
    assert.ok(starts[0]?.includes('key="0"'), `外层数组项 key="0": ${starts[0]}`)
    assert.ok(starts[1]?.includes('key="0"'), `内层数组项 key="0"（层级独立）: ${starts[1]}`)
    handle.close?.()
    document.body.removeChild(container)
  })
})
