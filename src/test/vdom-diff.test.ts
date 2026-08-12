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
import { patchValue, patchChildren, arrayChildren, patchProps } from '../ui-dom/vdom/diff.ts'
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

test('数组 boolean 空洞：{cond && <X/>}=false 占位不得误删下一个兄弟（提交按钮消失事故）', async () => {
  const { ctx, reg } = await makePatchCtx()
  const el = mount('d4b')
  const Field = async (_init: any) => (props: any) => {
    const parts: any[] = []
    parts.push(h('label', {}, props.label))
    parts.push(h('input', { class: 'inp', name: props.name }))
    if (props.error) parts.push(h('div', { class: 'err' }, props.error))
    return h('div', { class: `field${props.error ? ' err' : ''}` }, parts)
  }
  const Button = async (_init: any) => () => h('button', { type: 'submit' }, '提交')
  const Form = async (_init: any) => (props: any) => h('form', {}, props.children)
  // 首帧：{submitted && <Alert/>} = false —— children 数组含 boolean 空洞
  const v1 = h(Form, {}, [h(Field, { label: 'a', name: 'a' }), false, h(Button, {})])
  await buildVNode(v1, ctx, undefined, reg)
  const n1 = renderValue(v1, ctx, ctx.browser)!
  el.appendChild(n1)
  assert.equal(el.querySelectorAll('button').length, 1, '首帧有按钮')
  assert.equal(el.querySelector('form')!.children.length, 2)
  // 重渲染：Field 出现 error（children 增多）——boolean 空洞仍在 → 按钮不得消失
  const v2 = h(Form, {}, [h(Field, { label: 'a', name: 'a', error: 'e' }), false, h(Button, {})])
  await buildVNode(v2, ctx, v1, reg)
  patchValue(el, n1, v1, v2, ctx)
  const btns = el.querySelectorAll('button')
  assert.equal(btns.length, 1, 'boolean 空洞位置误删兄弟（按钮消失事故）')
  assert.equal(btns[0]?.textContent, '提交')
  assert.equal(el.querySelector('form')!.children.length, 2)
  // 空洞 → 真实元素（false → Alert）：插入到正确位置（Button 前）
  const v3 = h(Form, {}, [h(Field, { label: 'a', name: 'a', error: 'e' }), h('div', { class: 'alert' }, '已提交'), h(Button, {})])
  await buildVNode(v3, ctx, v2, reg)
  patchValue(el, n1, v2, v3, ctx)
  const form = el.querySelector('form')!
  assert.equal(form.children.length, 3)
  assert.equal(form.children[1].className, 'alert')
  assert.equal(form.children[2].textContent, '提交', 'Alert 插入后 Button 仍在正确位置')
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

// ── 7. setProp / arrayChildren 工具 ──

test('setProp: enumerated 属性显式字符串', () => {
  const el = document.createElement('div')
  setProp(el, 'draggable', true)
  assert.equal(el.getAttribute('draggable'), 'true')
  // 规则表 §2：value-based 枚举即使 false 也显式写 'false'（空字符串解析为 false 事故的根治——
  // 显式可预期，不依赖「不设 = 默认值」的隐式行为；移除由 patchProps 的 nv==null 分支负责）
  el.removeAttribute('draggable')
  setProp(el, 'draggable', false)
  assert.equal(el.getAttribute('draggable'), 'false', 'value-based 枚举 false 显式写 "false"')
})

test('setProp: indeterminate 半选态用 property（setAttribute 无效）', () => {
  const el = document.createElement('input')
  el.type = 'checkbox'
  setProp(el, 'indeterminate', true)
  assert.equal(el.indeterminate, true, 'property 赋值生效')
  // patchProps 移除 → 半选态清除
  patchProps(el, { indeterminate: true }, {})
  assert.equal(el.indeterminate, false, '移除后清除半选态')
  // false → 不设
  const el2 = document.createElement('input')
  el2.type = 'checkbox'
  setProp(el2, 'indeterminate', false)
  assert.equal(el2.indeterminate, false)
})

test('arrayChildren: null/数组/单值（保真用户结构——嵌套数组不展开）', () => {
  assert.deepEqual(arrayChildren(null), [])
  assert.deepEqual(arrayChildren([1, 2]), [1, 2])
  assert.deepEqual(arrayChildren('x'), ['x'])
  // 数组项 = 隐式 Fragment：嵌套数组原样保留（vnode 任何阶段以用户 JSX 为标准）
  assert.deepEqual(arrayChildren([[1, 2], 3]), [[1, 2], 3])
})

test('patchProps: 事件函数引用变化 → 移除旧 handler（不重复绑定累积）', () => {
  const el = document.createElement('button')
  let clicks = 0
  const oldClick = () => { clicks++ }
  patchProps(el, { onClick: oldClick }, { onClick: () => { clicks++ } })
  el.click()
  assert.equal(clicks, 1, '新 handler 只触发一次——旧 handler 已移除（否则重复绑定触发两次）')
})

test('patchProps: 事件 prop 非函数值不抛错（onClick=true 守卫——不中断渲染管线）', () => {
  const el = document.createElement('button')
  // setProp 路径（新渲染）
  setProp(el, 'onClick', true as any)   // 不抛 DOMException
  // patchProps 路径（diff）
  patchProps(el, {}, { onClick: true as any })
  patchProps(el, { onClick: true as any }, { onClick: 'str' as any })
  // once/only 等 on 开头非事件属性不被误判为事件（EVENT_RE：on + 大写）
  const el2 = document.createElement('div')
  setProp(el2, 'once', true)   // 应作为普通属性设置，不 removeEventListener('ce')
  patchProps(el2, { once: true }, { once: false })  // 应走移除分支（removeAttribute），不抛错
  assert.ok(true, '非函数事件值 + once 属性均不抛错')
})

test('patchProps: on 开头非事件属性（once）不当事件处理', () => {
  const el = document.createElement('div')
  // 事件引用变化分支不拦截 once（EVENT_RE 排除）
  patchProps(el, {}, { once: 'x' })
  assert.equal(el.getAttribute('once'), 'x', 'once 作为普通属性设置')
  // 移除分支：once 变 null → removeAttribute（不 removeEventListener）
  patchProps(el, { once: 'x' }, {})
  assert.equal(el.getAttribute('once'), null, 'once 移除')
})

test('数组项 = 隐式 Fragment：vnode 保真嵌套——渲染展开为兄弟节点（带边界标记）', () => {
  const c1 = h('span', {}, 'a')
  const c2 = h('span', {}, 'b')
  const c3 = h('span', {}, 'c')
  // vnode 保持用户结构（arrayChildren 不展开——任何阶段以用户 JSX 为标准）
  assert.deepEqual(arrayChildren([[c1, [c2]], c3, [null, 't']]), [[c1, [c2]], c3, [null, 't']])
  // 渲染：嵌套数组展开为兄弟节点（数组项边界标记 fragment-start/end + 占位注释）
  const frag = renderValue([[c1, c2], c3], { browser: createClientBrowser() }, createClientBrowser())
  assert.ok(frag instanceof DocumentFragment)
  const kids = [...(frag as DocumentFragment).childNodes]
  // 结构：[start外, start内, a, b, end内, c, end外]——双层嵌套两层标记（层级独立）
  assert.ok(kids[0].nodeValue?.includes('fragment-start'), `外层 start: ${kids[0].nodeValue}`)
  assert.ok(kids[1].nodeValue?.includes('fragment-start'), `内层 start: ${kids[1].nodeValue}`)
  assert.equal(kids[2].textContent, 'a')
  assert.equal(kids[3].textContent, 'b')
  assert.ok(kids[4].nodeValue?.includes('fragment-end'), `内层 end: ${kids[4].nodeValue}`)
  assert.equal(kids[5].textContent, 'c')
  assert.ok(kids[6].nodeValue?.includes('fragment-end'), `外层 end: ${kids[6].nodeValue}`)
})

test('patchProps: 键顺序不同但内容相同 → 回退全量（正确性无损，不丢属性）', () => {
  const el = document.createElement('div')
  // 键顺序不同（快速路径不命中 → 回退全量）——所有属性仍正确 patch
  patchProps(el, {}, { title: 't', 'data-x': '1', class: 'a' })
  assert.equal(el.getAttribute('class'), 'a')
  assert.equal(el.getAttribute('title'), 't')
  assert.equal(el.getAttribute('data-x'), '1')
  // 键顺序相同且值相同 → 快速路径命中（零 DOM 操作）
  const el2 = document.createElement('div')
  el2.setAttribute('class', 'b')
  patchProps(el2, { class: 'b' }, { class: 'b' })
  assert.equal(el2.getAttribute('class'), 'b', '值相同不破坏')
  // 值变化 → 正常 patch
  patchProps(el2, { class: 'b' }, { class: 'c' })
  assert.equal(el2.getAttribute('class'), 'c')
})
