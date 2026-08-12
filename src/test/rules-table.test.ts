/**
 * 规则表一致性测试（design/vdom-transform-rules.md）
 *
 * 可推导性 by construction：每个「用户写 JSX → vnode → DOM」条目一个测试组。
 * 红 → 绿 流程：本文件先建立全部断言（当前过渡代码红），逐阶段实现（占位法/key 数据完备/
 * 属性三通道/组件 id）让断言变绿——全绿 = 规则表全部落地。
 *
 * 分组对应规则表章节：
 *   §1 节点规则（元素/文本/组件/Fragment/数组项/Portal/占位/非法）
 *   §2 属性规则（event/property/enumerated/class/style/innerHTML）
 *   §3 key 规则（默认下标/显式/字符串化/index key 语义/data-wf-key）
 *   §4 组件 id（data-wf-id）
 *   §5 更新规则（keyed 复用/替换/插入/移除/移动/占位↔真实）
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h, Fragment, Portal, type VNode } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom/build.ts'
import { renderValue } from '../ui-dom/vdom/render.ts'
import { patchValue } from '../ui-dom/vdom/diff.ts'
import { createRegistry } from '../ui-dom/vdom/registry.ts'
import { renderSsr } from '../ui-dom/vdom/ssr.ts'

before(setupJsdom)
afterEach(() => createClientBrowser().clearBody())

async function makeCtx() {
  const browser = createClientBrowser()
  const reg = createRegistry()
  return {
    reg,
    ctx: {
      browser,
      registry: reg,
      ctxVersion: 0,
      getCtxVersion: () => 0,
      ui: { _selfId: '_wf_root', setMounting: () => {}, endMounting: () => {} },
    },
  }
}

function mountEl(): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  return el
}

/** 渲染 vnode 树到挂载 div（buildVNode → renderValue） */
async function render(children: any, ctx: any, reg: any): Promise<{ root: HTMLDivElement; vnode: any }> {
  const root = mountEl()
  const vnode = h('div', { class: 'root' }, children)
  await buildVNode(vnode, ctx, undefined, reg)
  const n = renderValue(vnode, ctx, ctx.browser)!
  root.appendChild(n)
  return { root, vnode }
}

// ─────────────────────────────────────────────
// §1 节点规则
// ─────────────────────────────────────────────

test('§1 原生元素：原样渲染（class 字符串）', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render(h('div', { class: 'a' }), ctx, reg)
  assert.equal(root.querySelector('.root')!.children[0].outerHTML, '<div class="a"></div>')
})

test('§1 文本 → 文本节点', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render('hello', ctx, reg)
  assert.equal((root.querySelector('.root') as HTMLElement).firstChild!.nodeType, 3)
  assert.equal((root.querySelector('.root') as HTMLElement).textContent, 'hello')
})

test('§1 组件 → 其输出 + data-wf-id（每个顶层节点）', async () => {
  const { ctx, reg } = await makeCtx()
  const Btn = async (_init: any) => () => h('button', { class: 'btn' }, 'x')
  const { root } = await render(h(Btn, {}), ctx, reg)
  const btn = root.querySelector('.btn')!
  assert.ok(btn, '组件输出渲染')
  assert.ok(btn.getAttribute('data-wf-id'), '组件输出节点有 data-wf-id: ' + btn.outerHTML)
})

test('§3 组件数组项 key → 输出节点 data-wf-key（客户端——行为与元素项一致）', async () => {
  const { ctx, reg } = await makeCtx()
  const Item = async (_init: any) => (props: any) => h('span', { class: 'ci', 'data-n': props.n }, String(props.n))
  const { root } = await render([h(Item, { key: 'user-a', n: 1 }), h(Item, { n: 2 })], ctx, reg)
  const spans = [...root.querySelectorAll('.ci')] as HTMLElement[]
  assert.equal(spans[0].getAttribute('data-wf-key'), 'user-a', '显式 key 原文穿透到组件输出节点')
  assert.equal(spans[1].getAttribute('data-wf-key'), '1', '默认下标 key 穿透（组件数组项 key 落 DOM——行为与元素项一致）')
})

test('§3 组件多根输出：每个顶层节点写 data-wf-key', async () => {
  const { ctx, reg } = await makeCtx()
  const Multi = async (_init: any) => () => [h('div', { class: 'm1' }, '1'), h('div', { class: 'm2' }, '2')]
  const { root } = await render([h(Multi, { key: 'mx' })], ctx, reg)
  assert.equal(root.querySelector('.m1')!.getAttribute('data-wf-key'), 'mx')
  assert.equal(root.querySelector('.m2')!.getAttribute('data-wf-key'), 'mx', '多根每个顶层节点都写')
})

test('§3 组件数组项 key → data-wf-key（SSR 与客户端一致）', async () => {
  const ctx: any = { params: {}, query: {} }
  const Item = async (_init: any) => (props: any) => h('span', { class: 'ci', 'data-n': props.n }, String(props.n))
  const html = await renderSsr([h(Item, { key: 'user-a', n: 1 }), h(Item, { n: 2 })], ctx)
  assert.ok(html.includes('data-wf-key="user-a"'), 'SSR 显式 key 穿透: ' + html)
  assert.ok(html.includes('data-wf-key="1"'), 'SSR 默认下标 key 穿透: ' + html)
})

test('§1 Fragment → 展开为兄弟节点（无容器）', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render([h(Fragment, {}, [h('span', { class: 'a' }, '1'), h('span', { class: 'b' }, '2')])], ctx, reg)
  const r = root.querySelector('.root')!
  assert.equal(r.children.length, 2)
  assert.equal(r.children[0].className, 'a')
  assert.equal(r.children[1].className, 'b')
})

test('§1 数组项 → 展开为兄弟节点（≡ Fragment）', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render([h('span', { class: 'x' }, '1'), [h('span', { class: 'y' }, '2'), h('span', { class: 'z' }, '3')], h('span', { class: 'w' }, '4')], ctx, reg)
  const r = root.querySelector('.root')!
  assert.equal(r.children.length, 4)
  assert.equal([...r.children].map(c => c.className).join(','), 'x,y,z,w')
})

test('§1 Portal → #__wf_portal（非父树内）', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render(h(Portal, { portalKey: 't1' }, h('div', { class: 'portal-child' }, 'p')), ctx, reg)
  const r = root.querySelector('.root')!
  assert.equal(r.querySelector('.portal-child'), null, 'portal 内容不在父树')
  const portal = document.querySelector('#__wf_portal')!
  assert.ok(portal.querySelector('.portal-child'), 'portal 内容在 #__wf_portal')
})

test('§1 false → 占位节点（childNodes 长度 = 数组长度，按钮保留）', async () => {
  const { ctx, reg } = await makeCtx()
  const Field = async (_init: any) => (props: any) => {
    const parts: any[] = [h('label', {}, props.label), h('input', { class: 'inp', name: props.name })]
    if (props.error) parts.push(h('div', { class: 'err' }, props.error))
    return h('div', { class: 'field' }, parts)
  }
  const Button = async (_init: any) => () => h('button', { type: 'submit' }, '提交')
  const Form = async (_init: any) => (props: any) => h('form', {}, props.children)
  const v1 = h(Form, {}, [h(Field, { label: 'a', name: 'a' }), false, h(Button, {})])
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  const form = root.querySelector('form')!
  assert.equal(form.childNodes.length, 3, 'childNodes 长度 = 数组长度（占位补齐）')
  assert.equal(form.children.length, 2, 'children（元素）不含占位')
  assert.equal(form.querySelectorAll('button').length, 1, '按钮保留')
  // 更新：Field 加 error 重渲染，占位仍在，按钮保留
  const v2 = h(Form, {}, [h(Field, { label: 'a', name: 'a', error: 'e' }), false, h(Button, {})])
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  assert.equal(form.querySelectorAll('button').length, 1, '更新后按钮保留（提交按钮消失事故回归）')
  assert.equal(form.childNodes.length, 3, '更新后 childNodes 长度恒定')
})

test('§1 非法对象 → 占位 + warn（不崩溃）', async () => {
  const { ctx, reg } = await makeCtx()
  const warns: string[] = []
  const ol = console.warn
  console.warn = (...a: any[]) => { warns.push(String(a[0])); ol(...a) }
  try {
    const { root } = await render([{ foo: 'bar' } as any], ctx, reg)
    const r = root.querySelector('.root')!
    assert.equal(r.querySelectorAll('button, span, div').length, 0, '非法对象不产生垃圾标签')
    assert.ok(r.innerHTML.includes('wf-hole'), '非法对象占位可见: ' + r.innerHTML)
  } finally {
    console.warn = ol
  }
  assert.ok(warns.length > 0, '非法对象 console.warn 提示')
})

// ─────────────────────────────────────────────
// §2 属性规则（三通道）
// ─────────────────────────────────────────────

test('§2 event 通道：onClick → 绑定；onClickCapture → 捕获变体', async () => {
  const { ctx, reg } = await makeCtx()
  const fired: string[] = []
  const btn = h('button', {
    onClickCapture: () => fired.push('cap'),
    onClick: () => fired.push('bub'),
  })
  await buildVNode(btn, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(btn, ctx, ctx.browser)!)
  ;(root.querySelector('button') as HTMLElement).click()
  assert.deepEqual(fired, ['cap', 'bub'], '捕获先于冒泡触发（capture 变体被支持）')
})

test('§2 property 通道：input value → property 直写', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render(h('input', { class: 'i', value: 'v' }), ctx, reg)
  const input = root.querySelector('.i') as HTMLInputElement
  assert.equal(input.value, 'v', 'value 是 property')
})

test('§2 enumerated value-based：draggable={false} → draggable="false"（显式，非空字符串）', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render(h('div', { class: 'd', draggable: false }), ctx, reg)
  const div = root.querySelector('.d') as HTMLElement
  assert.equal(div.getAttribute('draggable'), 'false', 'value-based 枚举显式 true/false')
  assert.equal(div.draggable, false)
})

test('§2 enumerated value-based：draggable={true} → draggable="true"', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render(h('div', { class: 'd2', draggable: true }), ctx, reg)
  const div = root.querySelector('.d2') as HTMLElement
  assert.equal(div.getAttribute('draggable'), 'true')
  assert.equal(div.draggable, true)
})

test('§2 enumerated presence-based：disabled → 空字符串', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render(h('button', { class: 'b2', disabled: true }), ctx, reg)
  const btn = root.querySelector('.b2') as HTMLButtonElement
  assert.equal(btn.getAttribute('disabled'), '', 'presence-based 空字符串')
  assert.equal(btn.disabled, true)
})

test('§2 class：字符串→对象切换无残留（先清后设）', async () => {
  const { ctx, reg } = await makeCtx()
  const v1 = h('div', { class: 'a b' })
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  const v2 = h('div', { class: { a: true, b: false, c: true } })
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  const div = root.firstChild as HTMLElement
  assert.equal(div.className, 'a c', 'class 先清后设，b 不残留')
})

test('§2 style：数字加 px；UNITLESS（opacity）不加', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render(h('div', { class: 's', style: { fontSize: 12, opacity: 0.5, '--x': '1' } }), ctx, reg)
  const div = root.querySelector('.s') as HTMLElement
  assert.equal(div.style.fontSize, '12px')
  assert.equal(div.style.opacity, '0.5')
  assert.equal(div.style.getPropertyValue('--x'), '1')
})

test('§2 innerHTML：存在则 children 不渲染（render/diff 同一判断）', async () => {
  const { ctx, reg } = await makeCtx()
  const v1 = h('div', { class: 'ih', innerHTML: '<span>X</span>' }, h('span', { class: 'child' }, 'Y'))
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  assert.equal((root.firstChild as HTMLElement).innerHTML, '<span>X</span>')
  assert.equal(root.querySelectorAll('.child').length, 0, '首帧 children 不渲染')
  const v2 = h('div', { class: 'ih', innerHTML: '<span>X2</span>' }, h('span', { class: 'child' }, 'Y2'))
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  assert.equal((root.firstChild as HTMLElement).innerHTML, '<span>X2</span>', 'diff 后 children 仍不渲染（行为统一）')
  assert.equal(root.querySelectorAll('.child').length, 0)
})

// ─────────────────────────────────────────────
// §3 key 规则
// ─────────────────────────────────────────────

test('§3 默认下标 key → data-wf-key="0"/"1"', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render([h('span', { class: 'k0' }, 'a'), h('span', { class: 'k1' }, 'b')], ctx, reg)
  assert.equal(root.querySelector('.k0')!.getAttribute('data-wf-key'), '0')
  assert.equal(root.querySelector('.k1')!.getAttribute('data-wf-key'), '1')
})

test('§3 显式 key → data-wf-key 原文', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render([h('span', { key: 'user-x', class: 'kx' }, 'a')], ctx, reg)
  assert.equal(root.querySelector('.kx')!.getAttribute('data-wf-key'), 'user-x')
})

test('§3 数字 key 统一字符串化（key={1} ≡ key="1"）', async () => {
  const { ctx, reg } = await makeCtx()
  const { root } = await render([h('span', { key: 1 as any, class: 'kn' }, 'a')], ctx, reg)
  assert.equal(root.querySelector('.kn')!.getAttribute('data-wf-key'), '1')
})

test('§3 默认下标 key = 位置身份：删除中间项 → 后续项位置复用（index key 语义）', async () => {
  const { ctx, reg } = await makeCtx()
  const Item = async (_init: any) => (props: any) => h('span', { class: 'item', 'data-n': props.n }, String(props.n))
  const mk = (ns: number[]) => ns.map((n, i) => h(Item, { n, key: undefined as any }))
  const v1 = h('div', {}, mk([1, 2, 3]))
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  const first2 = root.querySelectorAll('.item')[1] as HTMLElement
  const v2 = h('div', {}, mk([1, 3]))
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  const items = [...root.querySelectorAll('.item')] as HTMLElement[]
  assert.deepEqual(items.map(i => i.textContent), ['1', '3'])
  // index key 语义：位置 1 的 key（'1'）不变 → 同 key 同类型 → 复用旧实例、内容更新为 n=3
  // （React index key 同款——位置复用 + 状态继承；显式 key 才保证身份跟随内容）
  assert.ok(items[1] === first2, 'index key：位置复用（非重建）——后续项 key 跟随位置不变')
})

// ─────────────────────────────────────────────
// §4 组件 id
// ─────────────────────────────────────────────

test('§4 组件输出每个顶层节点有 data-wf-id（多根全部写）', async () => {
  const { ctx, reg } = await makeCtx()
  const Multi = async (_init: any) => () => [h('div', { class: 'm1' }, '1'), h('div', { class: 'm2' }, '2')]
  const { root } = await render(h(Multi, {}), ctx, reg)
  const m1 = root.querySelector('.m1')!
  const m2 = root.querySelector('.m2')!
  assert.ok(m1.getAttribute('data-wf-id'), '多根输出第一个节点有 data-wf-id')
  assert.ok(m2.getAttribute('data-wf-id'), '多根输出第二个节点也有 data-wf-id')
})

// ─────────────────────────────────────────────
// §5 更新规则（keyed diff）
// ─────────────────────────────────────────────

test('§5 同 key 同类型 → 复用（工厂不重跑，组件状态保持）', async () => {
  const { ctx, reg } = await makeCtx()
  let factoryCalls = 0
  const Item = async (_init: any) => { factoryCalls++; return (props: any) => h('span', { class: 'item' }, props.n) }
  const v1 = h('div', {}, [h(Item, { key: 'a', n: 1 })])
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  const v2 = h('div', {}, [h(Item, { key: 'a', n: 2 })])
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  assert.equal(factoryCalls, 1, '同 key 同类型工厂不重跑')
  assert.equal(root.querySelector('.item')!.textContent, '2')
})

test('§5 同 key 不同类型 → 替换', async () => {
  const { ctx, reg } = await makeCtx()
  const A = async (_init: any) => () => h('span', { class: 'ta' }, 'a')
  const B = async (_init: any) => () => h('span', { class: 'tb' }, 'b')
  const v1 = h('div', {}, [h(A, { key: 'k' })])
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  const v2 = h('div', {}, [h(B, { key: 'k' })])
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  assert.equal(root.querySelectorAll('.ta').length, 0)
  assert.equal(root.querySelectorAll('.tb').length, 1, '同 key 不同类型 → 替换')
})

test('§5 新 key 插入 / key 消失移除 / key 移动', async () => {
  const { ctx, reg } = await makeCtx()
  const Span = async (_init: any) => (props: any) => h('span', { class: 'sp', 'data-k': props.k }, props.k)
  const mk = (ks: string[]) => h('div', {}, ks.map(k => h(Span, { key: k, k })))
  const v1 = mk(['a', 'b', 'c'])
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  // 移动 b 到末尾 + 新 key d + 删除 c
  const v2 = mk(['a', 'd', 'b'])
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  const order = [...root.querySelectorAll('.sp')].map(s => s.textContent)
  assert.deepEqual(order, ['a', 'd', 'b'], 'keyed：移动/插入/删除后顺序正确')
})

test('§5 占位 ↔ 真实转换（false → Alert，Alert → false）', async () => {
  const { ctx, reg } = await makeCtx()
  const Alert = async (_init: any) => () => h('div', { class: 'alert' }, '已提交')
  const Btn = async (_init: any) => () => h('button', { class: 'btn5' }, 'x')
  // 首帧：false 占位
  const v1 = h('div', { class: 'w' }, [false, h(Btn, {})])
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  const w = root.querySelector('.w')!
  assert.equal(w.childNodes.length, 2)
  // false → Alert：占位被替换
  const v2 = h('div', { class: 'w' }, [h(Alert, {}), h(Btn, {})])
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  assert.equal(w.querySelectorAll('.alert').length, 1, 'false → Alert 占位变真实')
  assert.equal(w.querySelectorAll('.btn5').length, 1, '按钮保留')
  assert.equal(w.childNodes.length, 2, 'childNodes 长度恒定')
  // Alert → false：真实变占位
  const v3 = h('div', { class: 'w' }, [false, h(Btn, {})])
  await buildVNode(v3, ctx, v2, reg)
  patchValue(root, root.firstChild, v2, v3, ctx)
  assert.equal(w.querySelectorAll('.alert').length, 0, 'Alert → false 真实变占位')
  assert.equal(w.childNodes.length, 2, '长度恒定')
  assert.equal(w.querySelectorAll('.btn5').length, 1)
})

// ─────────────────────────────────────────────
// 阶段 A-3：SSR 与客户端同构（占位/data-wf-key/非法对象）
// ─────────────────────────────────────────────

test('SSR 数组空洞 → 占位注释（与客户端同构，hydration 不 mismatch）', async () => {
  const ctx: any = { params: {}, query: {} }
  const html = await renderSsr([h('span', { class: 'x' }, 'a'), false, h('span', { class: 'z' }, 'b')], ctx)
  assert.ok(html.includes('<!--wf-hole: false-->'), 'SSR 输出占位: ' + html)
  assert.ok(html.indexOf('x') < html.indexOf('<!--wf-hole') && html.indexOf('<!--wf-hole') < html.indexOf('z'), '占位位置正确')
})

test('SSR 数组项 key → data-wf-key（与客户端同构）', async () => {
  const ctx: any = { params: {}, query: {} }
  const html = await renderSsr([h('span', { class: 'k0', key: 'user-x' }, 'a'), h('span', { class: 'k1' }, 'b')], ctx)
  assert.ok(html.includes('data-wf-key="user-x"'), '显式 key 原文: ' + html)
  assert.ok(html.includes('data-wf-key="1"'), '默认下标 key 值: ' + html)
})

test('SSR 非法对象 → 诊断占位（与客户端同一判定，单一规则源）', async () => {
  const ctx: any = { params: {}, query: {} }
  const html = await renderSsr([{ foo: 'bar' } as any], ctx)
  assert.ok(html.includes('wf-hole'), '非法对象占位: ' + html)
  assert.ok(!html.includes('<undefined'), '不产生非法标签')
})

test('SSR enumerated 与客户端同一白名单（draggable=false → draggable="false"）', async () => {
  const ctx: any = { params: {}, query: {} }
  const html = await renderSsr(h('div', { draggable: false }, 'x'), ctx)
  assert.ok(html.includes('draggable="false"'), 'SSR value-based 枚举显式: ' + html)
})

test('阶段 B：fragment 多节点展开后相邻文本不错位（_childAnchors 锚点优先）', async () => {
  const { ctx, reg } = await makeCtx()
  const mk = (tail: string) => h('div', { class: 'w' }, [h(Fragment, {}, [h('span', { class: 'fa' }, '1'), h('span', { class: 'fb' }, '2')]), tail])
  const v1 = mk('tail')
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  const w = root.querySelector('.w')!
  assert.equal(w.childNodes.length, 3, 'frag 展开 2 + 文本 1')
  // 文本更新 tail → TAIL：不得重复残留（source[i] 错位事故的同类未爆变体）
  const v2 = mk('TAIL')
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  const texts = [...w.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent)
  assert.deepEqual(texts, ['TAIL'], 'fragment 后文本更新无重复: ' + JSON.stringify(texts))
  // fragment 后新增元素
  const v3 = h('div', { class: 'w' }, [h(Fragment, {}, [h('span', { class: 'fa' }, '1'), h('span', { class: 'fb' }, '2')]), h('button', { class: 'tail-btn' }, 'b')])
  await buildVNode(v3, ctx, v2, reg)
  patchValue(root, root.firstChild, v2, v3, ctx)
  assert.equal(w.querySelectorAll('.tail-btn').length, 1, 'fragment 后新增元素位置正确')
})
