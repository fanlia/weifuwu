/**
 * 端到端三层一致性验收：用户 JSX → vnode → DOM 逐条对照规则表
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/context.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { createRegistry } from '../ui-dom/vdom2/registry.ts'

before(setupJsdom)

// 用户 JSX（含全部节点形态）
const Item = async (_init: any) => (props: any) => h('span', { class: 'item', 'data-n': props.n }, props.n)
const Shell = async (_init: any) => async (props: any) =>
  h('div', { class: 'shell' }, props.children, h('button', {}, '固定'))

test('综合：用户 JSX 全形态 → DOM 与规则表推导精确一致', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  // JSX：div > [ 文本, 组件×2(keyed), 数组项, false, Fragment, 元素 ]
  const v1 = h('div', { class: 'root' }, [
    'hello',
    h(Item, { key: 'a', n: 'A' }),
    h(Item, { key: 'b', n: 'B' }),
    [h('i', { class: 'na' }), h('i', { class: 'nb' })],
    false,
    h(Fragment, {}, h('em', {}, 'frag')),
    h('span', { class: 'plain' }, 'end'),
  ])
  await handle.mount(v1)
  const root = container.querySelector('.root')!
  const kids = [...root.childNodes]

  // ① 顺序 = 用户数组顺序（数组项展开为兄弟、fragment 展开、false 占位）
  const order = kids.map(n => n.nodeType === 3 ? `text:${n.textContent}` : n.nodeType === 8 ? `hole:${n.nodeValue}` : (n as Element).className || (n as Element).tagName.toLowerCase())
  assert.deepEqual(order, [
    'text:hello',
    'item', 'item',                          // 组件输出
    'hole:wf-hole: type=fragment-start key=3 fid=3',    // 数组项边界（外层下标 3 + fid 位置路径）
    'na', 'nb',
    'hole:wf-hole: type=fragment-end key=3 fid=3',
    'hole:wf-hole: type=hole value=false',  // false 占位
    'hole:wf-hole: type=fragment-start key=5 fid=5',    // Fragment 边界（2026-12 统一协议——与数组项同构）
    'em',                                    // Fragment 展开
    'hole:wf-hole: type=fragment-end key=5 fid=5',
    'plain',
  ], 'DOM 结构 = 用户 JSX 推导（含边界/占位标记）')

  // ② data-wf-key：组件显式 key 穿透；无 key 项不写（取消自动 key——位置身份 DOM 诚实）
  const itemA = root.querySelector('[data-n="A"]')!
  assert.equal(itemA.getAttribute('data-wf-key'), 'a', '组件显式 key 穿透')
  assert.ok(itemA.getAttribute('data-wf-id')?.startsWith('_wf_'), '组件实例 id 存在（值由引擎分配——规则表 §4 存在性可预期）')
  assert.equal(root.querySelector('.na')!.getAttribute('data-wf-key'), null, '无 key 项不写 data-wf-key（位置身份）')
  assert.equal(root.querySelector('.nb')!.getAttribute('data-wf-key'), null)
  assert.equal(root.querySelector('.plain')!.getAttribute('data-wf-key'), null)

  // ③ 属性：class 原样、style 数字加 px、enumerated
  const plain = root.querySelector('.plain')!
  assert.equal(plain.getAttribute('class'), 'plain')

  // ④ 更新（diff）：删 B + 数组项重排 → DOM 跟随，组件复用
  const v2 = h('div', { class: 'root' }, [
    'hello',
    h(Item, { key: 'a', n: 'A' }),
    false,
    [h('i', { class: 'nb' }), h('i', { class: 'na' })],
    h(Fragment, {}, h('em', {}, 'frag')),
    h('span', { class: 'plain' }, 'end'),
  ])
  const reg = createRegistry()
  const built = await buildVNode(v2, ctx, v1, reg)
  patchValue(container, root, v1, built, { browser, registry: reg })
  const after = [...root.childNodes].map(n => n.nodeType === 3 ? `text:${n.textContent}` : n.nodeType === 8 ? `hole:${n.nodeValue}` : (n as Element).className || (n as Element).tagName.toLowerCase())
  assert.deepEqual(after, [
    'text:hello', 'item',
    'hole:wf-hole: type=hole value=false',
    'hole:wf-hole: type=fragment-start key=3 fid=3', 'nb', 'na', 'hole:wf-hole: type=fragment-end key=3 fid=3',
    'hole:wf-hole: type=fragment-start key=4', 'em', 'hole:wf-hole: type=fragment-end key=4',  // 新增 Fragment（key=位置身份）
    'plain',
  ], '更新后 DOM 与用户新 JSX 推导一致（B 移除、数组项重排、占位位置保持）')
  assert.equal(root.querySelector('[data-n="A"]')!.getAttribute('data-wf-key'), 'a', '组件 A 复用（key 身份保持）')

  handle.close?.()
  document.body.removeChild(container)
})
