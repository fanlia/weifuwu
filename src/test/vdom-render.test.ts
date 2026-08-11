/**
 * vdom render 测试——DOM 落地
 *
 * 前置：组件必须已构建（buildVNode await）——测试先 build 再 renderValue。
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h, type VNode } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom/build.ts'
import { renderValue } from '../ui-dom/vdom/render.ts'
import { createRegistry } from '../ui-dom/vdom/registry.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
  delete (globalThis as any).__registry
})

async function makeCtx(): Promise<any> {
  const browser = createClientBrowser()
  const reg = createRegistry()
  return {
    browser,
    __registry: reg,
    ui: { _selfId: '_wf_root', setMounting: () => {}, endMounting: () => {} },
  }
}

function mount(id: string): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = id
  return el
}

// ── 1. 基础 ──

test('renderValue: 文本/数字/null', async () => {
  const ctx = await makeCtx()
  const el = mount('r1')
  el.appendChild(renderValue('hi', ctx)!)
  assert.equal(el.textContent, 'hi')
  assert.equal(renderValue(null, ctx), null)
  assert.equal(renderValue(false, ctx), null)
})

test('renderValue: native 元素 + 属性/事件/ref', async () => {
  const ctx = await makeCtx()
  let clicked = 0
  let refEl: any = null
  const v = h('button', {
    class: 'btn primary',
    'data-x': '1',
    onClick: () => clicked++,
    ref: (el: any) => { refEl = el },
  }, 'Click')
  const el = mount('r2')
  el.appendChild(renderValue(v, ctx)!)
  const btn = el.querySelector('button')!
  assert.ok(btn.classList.contains('btn'))
  assert.ok(btn.classList.contains('primary'))
  assert.equal(btn.getAttribute('data-x'), '1')
  btn.dispatchEvent(new (window as any).Event('click'))
  assert.equal(clicked, 1)
  assert.equal(refEl, btn, 'ref 触发')
})

test('renderValue: style 对象 + innerHTML + draggable enumerated', async () => {
  const ctx = await makeCtx()
  const v = h('div', { style: { color: 'red', width: '10px' }, innerHTML: '<b>x</b>', draggable: true })
  const el = mount('r3')
  el.appendChild(renderValue(v, ctx)!)
  const div = el.firstChild as HTMLElement
  assert.equal(div.style.color, 'red')
  assert.equal(div.innerHTML, '<b>x</b>')
  assert.equal(div.getAttribute('draggable'), 'true', 'enumerated 显式字符串')
})

// ── 2. 组件（已构建）──

test('renderValue: 已构建组件 → 输出 DOM', async () => {
  const ctx = await makeCtx()
  const Comp = async (_init: any) => () => h('div', { class: 'comp' }, '内容')
  const vnode = h(Comp, {})
  await buildVNode(vnode, ctx)
  const el = mount('r4')
  el.appendChild(renderValue(vnode, ctx)!)
  const div = el.querySelector('.comp')!
  assert.equal(div.textContent, '内容')
})

test('renderValue: 组件输出 null → 无 DOM（_child = null）', async () => {
  const ctx = await makeCtx()
  const NullComp = async (_init: any) => () => null
  const vnode = h(NullComp, {})
  await buildVNode(vnode, ctx)
  const el = mount('r5')
  const node = renderValue(vnode, ctx)
  assert.equal(node, null)
  assert.equal(vnode._child, null, '构建为 null')
})

test('renderValue: 数组 children 含组件 → 展开渲染', async () => {
  const ctx = await makeCtx()
  const Item = async (_init: any) => () => h('span', { class: 'item' }, 'I')
  const vnode = h('div', {}, [h(Item, {}), 'sep', h(Item, {})])
  await buildVNode(vnode, ctx)
  const el = mount('r6')
  el.appendChild(renderValue(vnode, ctx)!)
  assert.equal(el.querySelectorAll('.item').length, 2)
})

test('renderValue: 未构建组件 → 抛错（防静默）', async () => {
  const ctx = await makeCtx()
  const Comp = async (_init: any) => () => h('div', {}, 'x')
  const vnode = h(Comp, {}) // 未 build
  const el = mount('r7')
  assert.throws(() => renderValue(vnode, ctx), /not built/)
})

// ── 3. Portal / Fragment ──

test('renderValue: Portal → #__wf_portal', async () => {
  const ctx = await makeCtx()
  const { createPortal } = await import('../ui-dom/vnode.ts')
  const vnode = h('div', {}, createPortal(h('span', { class: 'po' }, 'P'), 'test-portal'))
  await buildVNode(vnode, ctx)
  const el = mount('r8')
  el.appendChild(renderValue(vnode, ctx)!)
  const portal = document.querySelector('#__wf_portal [data-portal="test-portal"]')
  assert.ok(portal, 'portal 容器存在')
  assert.equal(portal?.textContent, 'P')
})

test('renderValue: Fragment 展开', async () => {
  const ctx = await makeCtx()
  const { Fragment } = await import('../ui-dom/vnode.ts')
  const vnode = h('div', {}, h(Fragment as any, {}, [h('span', { class: 'a' }, '1'), h('span', { class: 'b' }, '2')]))
  await buildVNode(vnode, ctx)
  const el = mount('r9')
  el.appendChild(renderValue(vnode, ctx)!)
  assert.equal(el.querySelectorAll('.a, .b').length, 2)
})
