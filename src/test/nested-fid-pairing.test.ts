/** 嵌套数组项 end 配对：移除内层数组项 [e,f] 不切错外层 [c,d,[e,f]] 边界 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { patchValue } from '../ui-dom/vdom/diff.ts'
import { buildVNode } from '../ui-dom/vdom/build.ts'
import { createRegistry } from '../ui-dom/vdom/registry.ts'

before(setupJsdom)
test('嵌套数组项：移除内层 [e,f] → 外层边界完整（fid 配对）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  const mk = (id: string) => h('i', { id })
  // [[a,b],[c,d,[e,f]],x] → [[a,b],[c,d],x]（移除内层数组项 [e,f]）
  const v1 = h('div', { class: 'w' }, [[mk('a'), mk('b')], [mk('c'), mk('d'), [mk('e'), mk('f')]], mk('x')])
  await handle.mount(v1)
  const v2 = h('div', { class: 'w' }, [[mk('a'), mk('b')], [mk('c'), mk('d')], mk('x')])
  const reg = createRegistry()
  const built = await buildVNode(v2, ctx, v1, reg)
  patchValue(container, container.querySelector('.w')!, v1, built, { browser, registry: reg })
  const w = container.querySelector('.w')!
  const rows = [...w.childNodes].map(n => n.nodeType === 8 ? `📄${n.nodeValue}` : `🏷${n.id}`)
  console.log('[after]', rows.join(' | '))
  const hasEF = w.querySelector('#e, #f')
  assert.ok(!hasEF, '内层 [e,f] 已移除')
  const markers = [...w.childNodes].filter(n => n.nodeType === 8).map(n => n.nodeValue!)
  const starts = markers.filter(m => m.includes('fragment-start'))
  assert.equal(starts.length, 2, `两个数组项 [a,b]/[c,d] 各一个 start（内层 [e,f] 标记已清）: ${markers.join(' | ')}`)
  assert.ok(!starts.some(m => m.includes('fid=1-2')), '内层 fid=1-2 标记已移除')
  assert.equal(markers.filter(m => m.includes('fragment-end')).length, 2, 'end 与 start 配对（无嵌套残留）')
  // x 保留 + 顺序正确
  assert.deepEqual(['a', 'b', 'c', 'd', 'x'].map(id => w.querySelector(`#${id}`)?.id), ['a', 'b', 'c', 'd', 'x'])
  handle.close?.()
  document.body.removeChild(container)
})
