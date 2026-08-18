/**
 * 回归测试：unkeyed 列表位置重建——anchor 先捕获（patchInner rebuild 移除旧节点后
 * anchor 脱离 → 新节点 appendChild 末尾——真实 bug）
 *
 * 事故场景（agent-platform 聊天页搜索）：容器 children = [div, false, Comp(keyed)×N]
 * ——混合数组走 unkeyed 位置配对；搜索替换消息列表（同 type 异 key）→ 循环
 * type-only 分支交 patchInner → sameType（type+key）不成立 → rebuild：先
 * removeNodeWithLifecycle(oc.el)（= anchor）再 renderVNode(anchor 已脱离) →
 * insertBefore 落到 appendChild → 首个新项被追加到列表末尾 + audit children 顺序错位。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './setup.ts'
import { h, mount, patch, stream } from './vdom3/index.ts'
import { buildVNode } from './vdom3/build.ts'

before(setupJsdom)

function mkRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

/** 模拟 MessageItem：props.msg → 单 div（data-msgid） */
const Item = (_init: any) => async (props: any) => h('div', { 'data-msgid': props.msg.id.slice(0, 8) }, props.msg.id.slice(0, 8))

function tree(msgs: string[]): any {
  return h('div', { class: 'scroll' }, [
    h('div', { class: 'toolbar' }, 'toolbar'),
    false, // EmptyState 空洞（占位法——DOM 建 hole 注释）
    ...msgs.map((m) => h(Item, { key: m, msg: { id: m } })),
  ])
}

test('回归：keyed 列表替换（同 type 异 key + 前导 div + 空洞）——位置正确 + 零 audit', async () => {
  stream.reset()
  const root = mkRoot()
  const oldMsgs = ['6ec3279b', '76741dae', 'd3364668', 'a625bd45', 'b2da7a57', 'c9578bf3', '90fdd0ed', '1a3a151c']
  const newMsgs = ['d3364668', 'b2da7a57', '90fdd0ed', '76741dae']

  const oldV = await buildVNode(tree(oldMsgs), {})
  mount(oldV, root)
  const sc = root.querySelector('.scroll')!
  assert.equal(sc.querySelectorAll('[data-msgid]').length, 8, '旧列表渲染 8 项')

  const newV = await buildVNode(tree(newMsgs), {}, oldV)
  const audit: string[] = []
  const ol = console.warn
  console.warn = (...a: any[]) => { if (String(a[0]).includes('vdom3/audit')) audit.push(String(a[0]).slice(0, 120)); ol(...a) }
  patch(oldV, newV, root)
  console.warn = ol

  const domMsgs = [...sc.childNodes]
    .map((n) => (n as Element).getAttribute?.('data-msgid') ?? '')
    .filter(Boolean)
  assert.deepEqual(domMsgs, newMsgs.map((m) => m.slice(0, 8)), 'DOM 顺序 = 新列表顺序（首个新项不得 append 到末尾）')
  assert.deepEqual(audit, [], '无 audit children 顺序错位（vnode el ↔ DOM 对齐）')
  document.body.removeChild(root)
})

test('对照：同 key 位置不变——原位 patch 零重建（无 INSERT/REMOVE）', async () => {
  stream.reset()
  const root = mkRoot()
  const msgs = ['a1', 'b2', 'c3']
  const oldV = await buildVNode(tree(msgs), {})
  mount(oldV, root)
  const els = [...root.querySelectorAll('[data-msgid]')].map((e) => e)

  // 同 key 列表重渲染（内容变化——文本更新）
  const newV = await buildVNode(tree(['a1', 'b2', 'c3']), {}, oldV)
  stream.reset()
  patch(oldV, newV, root)
  const events = stream.events()
  assert.equal(events.filter((e) => e.entity === 'node' && e.action === 'insert').length, 0, '同 key 无 INSERT（原位 patch）')
  assert.equal(events.filter((e) => e.entity === 'node' && e.action === 'remove').length, 0, '同 key 无 REMOVE')
  assert.deepEqual([...root.querySelectorAll('[data-msgid]')].map((e) => e), els, '元素恒等（复用）')
  document.body.removeChild(root)
})
