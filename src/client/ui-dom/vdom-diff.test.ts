/**
 * vdom diff 回归测试（关键 diff 场景——每项对应一次真实事故）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './setup.ts'
import { mountToDom, patchToDom, createTestCtx } from './testing.ts'
import { h } from './vdom3/jsx.ts'

before(setupJsdom)


test('keyed diff：末尾追加（4→5）插入位置正确——同引用复用 prev 推进（Tabs 新增标签事故）', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const mk = (items: { key: string; label: string }[]) => h('div', {}, items.map((i) => h('span', { key: i.key }, i.label)))
  const v1 = mk([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }, { key: 't1', label: 'T1' }])
  await mountToDom(host, v1, createTestCtx())
  assert.deepEqual([...host.querySelectorAll('span')].map((e) => e.textContent), ['A', 'B', 'C', 'T1'])
  // 4→5：末尾追加 t2（build 复用旧树节点——同引用快路径——prev 推进 bug 曾致 T2 插到 firstChild）
  const v2 = mk([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }, { key: 't1', label: 'T1' }, { key: 't2', label: 'T2' }])
  await patchToDom(host, host.firstChild, v1, v2, createTestCtx())
  assert.equal([...host.querySelectorAll('span')].map((e) => e.textContent).join(','), 'A,B,C,T1,T2', '末尾追加顺序正确')
  document.body.removeChild(host)
})
