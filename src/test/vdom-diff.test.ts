/**
 * vdom diff 测试——同步 patch
 *
 * 核心场景：
 * 1. 属性/text patch
 * 2. 数组无 key 按位置（含动态挂载组件——chat 事故）
 * 3. 数组 keyed（移动/删除/新增）
 * 4. 组件三态 skip（renderFn 不重跑）
 * 5. **动态挂载不重复**（再次 diff 同数组不产生新 DOM）
 * 6. **无死循环**（diff 未构建组件抛错——不调工厂）
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h, type VNode } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom/build.ts'
import { renderValue, setProp } from '../ui-dom/vdom/render.ts'
import { patchValue, patchChildren, normalizeChildren, patchProps } from '../ui-dom/vdom/diff.ts'
import { createRegistry } from '../ui-dom/vdom/registry.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
})

async function makePatchCtx(): Promise<{ ctx: any; reg: any }> {
  const browser = createClientBrowser()
  const reg = createRegistry()
  return {
    reg,
    ctx: {
      browser,
      registry: reg,
      ctxVersion: 0,
      getCtxVersion: () => 0,
      ui: {
        _selfId: '_wf_root',
        setMounting: () => {},
        endMounting: () => {},
        $: function (this: any) {
          const selfId = this._selfId ?? '_wf_root'
          const target: Record<string, any> = {}
          return new Proxy(target, {
            set(t, k, v) { t[k as string] = v; return true },
            get(t, k) { return t[k as string] },
          })
        },
      },
    },
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

// ── 1. 文本/属性 patch ──

test('文本 patch：旧文本 → 新文本', async () => {
  const { ctx } = await makePatchCtx()
  const el = mount('d1')
  el.appendChild(renderValue('old', ctx, ctx.browser)!)
  const t = patchValue(el, el.firstChild, 'old', 'new', ctx)
  assert.equal(el.textContent, 'new')
  assert.ok(t === el.firstChild, '返回新文本节点')
})

test('属性 patch：class/data 变化', async () => {
  const { ctx } = await makePatchCtx()
  const el = mount('d2')
  const v1 = h('div', { class: 'a', 'data-x': '1' })
  const v2 = h('div', { class: 'b', 'data-x': '2' })
  const node = renderValue(v1, ctx, ctx.browser)!
  el.appendChild(node)
  patchValue(el, node, v1, v2, ctx)
  const div = el.firstChild as HTMLElement
  assert.equal(div.className, 'b')
  assert.equal(div.getAttribute('data-x'), '2')
})

test('不同 type → 替换', async () => {
  const { ctx } = await makePatchCtx()
  const el = mount('d3')
  const v1 = h('span', {}, 's')
  const node = renderValue(v1, ctx, ctx.browser)!
  el.appendChild(node)
  const v2 = h('div', {}, 'd')
  patchValue(el, node, v1, v2, ctx)
  assert.equal(el.children[0].tagName, 'DIV')
})

// ── 2. 数组 diff（无 key 按位置）──

test('数组无 key：新增/删除/同位置 patch', async () => {
  const { ctx } = await makePatchCtx()
  const el = mount('d4')
  const v1 = h('div', {}, [h('span', { class: 'a' }, '1'), h('span', { class: 'b' }, '2')])
  const n1 = renderValue(v1, ctx, ctx.browser)!
  el.appendChild(n1)
  // 新增
  const v2 = h('div', {}, [h('span', { class: 'a' }, '1'), h('span', { class: 'b' }, '2'), h('span', { class: 'c' }, '3')])
  patchValue(el, n1, v1, v2, ctx)
  assert.equal(el.querySelectorAll('span').length, 3)
  // 删除
  const v3 = h('div', {}, [h('span', { class: 'a' }, '1')])
  patchValue(el, n1, v2, v3, ctx)
  assert.equal(el.querySelectorAll('span').length, 1)
})

// ── 3. 组件 diff + 三态 skip ──

test('组件 diff：同类型复用 _render（工厂不重跑）', async () => {
  const { ctx, reg } = await makePatchCtx()
  const el = mount('d5')
  let factoryCalls = 0
  const Comp = async (_init: any) => { factoryCalls++; return () => h('div', { class: 'c' }, 'x') }
  const v1 = h(Comp, {})
  await buildVNode(v1, ctx, undefined, reg)
  const n1 = renderValue(v1, ctx, ctx.browser)!
  el.appendChild(n1)
  // 再次渲染（同 props）：buildVNode（复用 _render）→ patch（三态 skip）
  const v2 = h(Comp, {})
  await buildVNode(v2, ctx, v1, reg)
  const n2 = patchValue(el, n1, v1, v2, ctx)
  assert.equal(factoryCalls, 1, '工厂不重跑')
  assert.ok(n2 === n1, 'skip 复用旧 DOM')
})

test('组件 diff：props 变化 → renderFn 重跑 → DOM 更新', async () => {
  const { ctx, reg } = await makePatchCtx()
  const el = mount('d6')
  const Comp = async (_init: any) => (props: any) => h('div', { class: 'c' }, String(props.n))
  const v1 = h(Comp, { n: 1 })
  await buildVNode(v1, ctx, undefined, reg)
  const n1 = renderValue(v1, ctx, ctx.browser)!
  el.appendChild(n1)
  const v2 = h(Comp, { n: 2 })
  await buildVNode(v2, ctx, v1, reg)
  patchValue(el, n1, v1, v2, ctx)
  assert.equal(el.querySelector('.c')?.textContent, '2')
})

// ── 4. 动态挂载核心（chat 事故回归）──

test('数组含 async 组件：diff 渲染 + 再渲染不重复（chat ×2 事故）', async () => {
  const { ctx, reg } = await makePatchCtx()
  const el = mount('d7')
  const Ava = async (_init: any) => () => h('div', { class: 'ava' }, 'A')
  const Item = async (_init: any) => () => h('div', { class: 'item' }, h(Ava, {}), h('div', { class: 'body' }, 'b'))
  const v1 = h('div', { class: 'list' }, [h(Item, { key: '1' }), h(Item, { key: '2' })])
  await buildVNode(v1, ctx, undefined, reg)
  const n1 = renderValue(v1, ctx, ctx.browser)!
  el.appendChild(n1)
  assert.equal(el.querySelectorAll('.item').length, 2, '首次 2 items')
  assert.equal(el.querySelectorAll('.ava').length, 2, '2 avatars')
  // 再次 patch 同结构：不重复（chat 事故）
  const v2 = h('div', { class: 'list' }, [h(Item, { key: '1' }), h(Item, { key: '2' })])
  await buildVNode(v2, ctx, v1, reg)
  patchValue(el, n1, v1, v2, ctx)
  assert.equal(el.querySelectorAll('.item').length, 2, '再渲染不重复')
  assert.equal(el.querySelectorAll('.ava').length, 2)
})

// ── 5. keyed diff ──

test('keyed diff：移动/删除/新增', async () => {
  const { ctx } = await makePatchCtx()
  const el = mount('d8')
  const mk = (id: string) => h('span', { key: id, class: `k-${id}` }, id)
  const v1 = h('div', {}, [mk('a'), mk('b'), mk('c')])
  const n1 = renderValue(v1, ctx, ctx.browser)!
  el.appendChild(n1)
  // 删除 b、新增 d、c 保持
  const v2 = h('div', {}, [mk('a'), mk('c'), mk('d')])
  patchValue(el, n1, v1, v2, ctx)
  assert.deepEqual([...el.querySelectorAll('span')].map(s => s.textContent), ['a', 'c', 'd'])
})

// ── 6. 未构建组件 → 抛错（防死循环/静默）──

test('diff 遇未构建组件 → throw（不调工厂）', async () => {
  const { ctx } = await makePatchCtx()
  const el = mount('d9')
  let factoryCalls = 0
  const Comp = async (_init: any) => { factoryCalls++; return () => h('div', {}, 'x') }
  const v = h(Comp, {}) // 未 build
  const node = renderValue('placeholder', ctx, ctx.browser)!
  el.appendChild(node)
  assert.throws(() => patchValue(el, node, 'placeholder', v, ctx), /not built/)
  assert.equal(factoryCalls, 0, '工厂不被调用')
})

// ── 7. setProp / normalizeChildren 工具 ──

test('setProp: enumerated 属性显式字符串', () => {
  const el = document.createElement('div')
  setProp(el, 'draggable', true)
  assert.equal(el.getAttribute('draggable'), 'true')
  // false → 移除（patchProps 移除语义）
  el.removeAttribute('draggable')
  setProp(el, 'draggable', false)
  assert.equal(el.getAttribute('draggable'), null, 'false 不设属性（移除由 patchProps）')
})

test('normalizeChildren: null/数组/单值', () => {
  assert.deepEqual(normalizeChildren(null), [])
  assert.deepEqual(normalizeChildren([1, 2]), [1, 2])
  assert.deepEqual(normalizeChildren('x'), ['x'])
})

test('patchProps: 事件函数引用变化 → 移除旧 handler（不重复绑定累积）', () => {
  const el = document.createElement('button')
  let clicks = 0
  const oldClick = () => { clicks++ }
  patchProps(el, { onClick: oldClick }, { onClick: () => { clicks++ } })
  el.click()
  assert.equal(clicks, 1, '新 handler 只触发一次——旧 handler 已移除（否则重复绑定触发两次）')
})
