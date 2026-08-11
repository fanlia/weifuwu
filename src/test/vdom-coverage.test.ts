/**
 * vdom 引擎覆盖补全测试（design/vdom-coverage-plan.md 步骤 2）
 *
 * 补全全量覆盖率缺口（基线 2026-08）：
 * - build.ts: 78-82 工厂返回非函数 throw / 146-147 未知类型透传
 * - registry.ts: 29-34 ensureId 已有 id / 62-66 safeCallRef 抛错隔离
 * - render.ts: 95-97 数组 fragment / 109-110 body 缺失 Portal null
 * - ssr.ts: 30-36 classToString 数组/对象 / 69-73 工厂非函数 throw / 98-100 enumerated
 * - serve.ts: 110-111 loading 模式不清空 root（骨架屏保留→原子替换）
 * - scheduler.ts: 顺序队列（无互斥锁）——同步跳过未挂载 / 连续 render 顺序落地 / onError
 *   / 112-113 补跑链 / 142-145 无参 render → selfId
 * - diff.ts: 112-125 顶层数组 patch / 250-257 patchProps 移除各分支
 * - mount.ts: 118-128 selfId 校验（空/重复/正常）/ 245-250 createCommandContainer
 * - vnode.ts: 118-131 isNative/isComponent/isFragment/isPortal
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h, Fragment, Portal, createPortal, isNative, isComponent, isFragment, isPortal, type VNode } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom/build.ts'
import { renderValue, setProp } from '../ui-dom/vdom/render.ts'
import { patchValue, patchProps } from '../ui-dom/vdom/diff.ts'
import { createScheduler, type Scheduler } from '../ui-dom/vdom/scheduler.ts'
import { createRegistry, ensureId, safeCallRef } from '../ui-dom/vdom/registry.ts'
import { mountRoot, createCommandContainer } from '../ui-dom/vdom/mount.ts'
import { createVdomContext } from '../ui-dom/vdom/mount.ts'
import { uiServe } from '../ui-dom/vdom/serve.ts'
import { renderSsr } from '../ui-dom/vdom/ssr.ts'
import { hydrateVNode, ensureHydrationId } from '../ui-dom/vdom/hydration.ts'
import { UIRouter } from '../ui-dom/router.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
})

function flush(ms = 0) { return new Promise<void>((r) => setTimeout(r, ms)) }

function makeCtx(): any {
  const reg = createRegistry()
  return {
    __registry: reg,
    browser: createClientBrowser(),
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

// ═══════════════ build.ts ═══════════════

test('build: 工厂返回非函数 → throw（must return a render function）', async () => {
  const ctx = makeCtx()
  const Bad = async (_init: any) => 'not a function' as any
  await assert.rejects(buildVNode(h(Bad, {}), ctx), /must return a render function/)
})

test('build: 未知 type（非 string/symbol/function）→ 原样透传（尾分支）', async () => {
  const ctx = makeCtx()
  // Symbol 走 native 分支（typeof symbol 匹配）；数字/对象 type 才是尾分支
  const v = { type: 123, props: {} } as any as VNode
  const out = await buildVNode(v, ctx)
  assert.equal(out, v, '未知类型原样返回')
})

// ═══════════════ registry.ts ═══════════════

test('registry: ensureId 已有 id 不重复分配', () => {
  const reg = createRegistry()
  const v = h('div', {}) as VNode
  const id1 = ensureId(reg, v)
  const id2 = ensureId(reg, v)
  assert.equal(id1, id2, '同 vnode 复用 id')
  assert.equal(reg.idRegistry.get(id1), v)
})

test('registry: safeCallRef 抛错 → console.error 隔离不中断', () => {
  const errors: string[] = []
  const orig = console.error
  console.error = (...a: any[]) => { errors.push(String(a[0])) }
  try {
    assert.doesNotThrow(() => safeCallRef(() => { throw new Error('boom') }, null, 'cleanup', 'X'))
  } finally { console.error = orig }
  assert.ok(errors.some((e) => e.includes('[weifuwu] ref cleanup error in <X>')), '错误已记录')
})

// ═══════════════ render.ts ═══════════════

test('render: 数组 → DocumentFragment（多 children 展开）', () => {
  const ctx = makeCtx()
  const frag = renderValue([h('span', {}, 'a'), h('span', {}, 'b')], ctx, ctx.browser)
  assert.ok(frag instanceof DocumentFragment)
  assert.equal(frag?.childNodes.length, 2)
})

test('render: Portal body 缺失 → 返回 null（防御分支）', () => {
  const ctx = makeCtx()
  const noBodyBrowser = {
    ...createClientBrowser(),
    bodyElement: () => null,
  }
  const v = createPortal(h('span', {}, 'P'), 't')
  const out = renderValue(v, ctx, noBodyBrowser as any)
  assert.equal(out, null, '无 body 不崩溃')
})

// ═══════════════ ssr.ts ═══════════════

test('ssr: classToString 数组/对象（truthy 过滤）', async () => {
  const ctx = { ui: { render: () => {} }, browser: undefined } as any
  // class 数组 + 对象
  const v = h('div', { class: ['a', 'b', ''] })
  const html = await renderSsr(v, ctx)
  assert.equal(html, '<div class="a b"></div>')
  const v2 = h('div', { class: { a: true, b: false, c: 1 } })
  const html2 = await renderSsr(v2, ctx)
  assert.equal(html2, '<div class="a c"></div>')
})

test('ssr: 工厂返回非函数 → throw', async () => {
  const Bad = async (_init: any) => null as any
  const ctx = { ui: { render: () => {} }, browser: undefined } as any
  await assert.rejects(renderSsr(h(Bad, {}), ctx), /must return a render function/)
})

test('ssr: classToString 非 string/数组/对象 → 空字符串', async () => {
  const ctx = { ui: { render: () => {} }, browser: undefined } as any
  const v = h('div', { class: 42 as any })
  const html = await renderSsr(v, ctx)
  assert.equal(html, '<div></div>', '数字 class 忽略')
})

// ═══════════════ hydration.ts 游标收养 ═══════════════

test('hydration: cursorInsert——客户端多文本插入（无匹配游标）', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = '<div class="page"></div>' // 空 div——游标在 div 后
  const Page = async (_init: any) => () =>
    h('div', { class: 'page' }, h('span', {}, 'a'), 'extra', h('span', {}, 'b'))
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Page, {})
  await hydrateVNode(el, vnode, vctx)
  assert.equal(el.querySelectorAll('span').length, 2, '两个 span 收养')
  assert.ok(el.textContent?.includes('extra'), '游离文本 cursorInsert 插入')
})

test('hydration: cursorReplace——tag 不匹配替换（服务端 div → 客户端 span）', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = '<div class="wrap"><div class="old-tag">x</div></div>'
  const Page = async (_init: any) => () =>
    h('div', { class: 'wrap' }, h('span', { class: 'new-tag' }, 'y'))
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Page, {})
  await hydrateVNode(el, vnode, vctx)
  const span = el.querySelector('.new-tag') as HTMLElement
  assert.ok(span, '替换后的 span 存在')
  assert.equal(span?.textContent, 'y')
  assert.ok(!el.querySelector('.old-tag'), '旧 div 被替换')
})

test('hydration: Portal/Fragment 内联收养 + 数组渲染', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = '<div class="wrap"><span class="a">1</span><span class="b">2</span></div>'
  const Page = async (_init: any) => () =>
    h('div', { class: 'wrap' }, createPortal(h(Fragment, {}, [h('span', { class: 'a' }, '1'), h('span', { class: 'b' }, '2')]), 'k'))
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Page, {})
  await hydrateVNode(el, vnode, vctx)
  assert.equal(el.querySelectorAll('span').length, 2, 'Portal/Fragment 内联收养')
  assert.equal(el.querySelector('.a')?.textContent, '1')
})

test('hydration: 组件输出 null（构建为 null）+ innerHTML + select value + ref', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = '<div class="page"><div class="html">old</div><select id="sel"><option value="a">A</option><option value="b">B</option></select></div>'
  let refCalled = 0
  const NullComp = async (_init: any) => () => null
  const Page = async (_init: any) => () =>
    h('div', { class: 'page' },
      h(NullComp, {}),
      h('div', { class: 'html', innerHTML: '<b>new</b>' } as any),
      h('select', { id: 'sel', value: 'b' } as any, [h('option', { value: 'a' } as any, 'A'), h('option', { value: 'b' } as any, 'B')]),
      h('div', { id: 'refd', ref: () => { refCalled++ } } as any, 'r'),
    )
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Page, {})
  await hydrateVNode(el, vnode, vctx)
  assert.equal((el.querySelector('.html') as HTMLElement)?.innerHTML, 'old', 'innerHTML 收养信任服务端输出（wireProps 跳过）')
  assert.equal((el.querySelector('#sel') as HTMLSelectElement)?.value, 'b', 'select value 延后设置')
  assert.equal(refCalled, 1, 'ref(el) 只调一次（wireProps→setProp；与 render.ts 一致）')
})

test('hydration: 文本节点更新（服务端文本 → 客户端不同文本 patch）', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = '<div class="page"><span>server</span></div>'
  const Page = async (_init: any) => () =>
    h('div', { class: 'page' }, h('span', {}, 'client'))
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Page, {})
  await hydrateVNode(el, vnode, vctx)
  assert.equal(el.querySelector('span')?.textContent, 'client', '文本更新')
})

test('hydration: ensureHydrationId 分配 id（注册表写入）', async () => {
  const b = createClientBrowser()
  const ctx = makeCtx()
  const v = h('div', {}) as VNode
  ensureHydrationId(v, ctx)
  assert.ok(v._id, 'id 已分配')
  assert.equal(ctx.__registry.idRegistry.get(v._id), v, '注册表写入')
  // 已有 id 不重复
  const id1 = v._id
  ensureHydrationId(v, ctx)
  assert.equal(v._id, id1, '复用 id')
})

test('hydration: 子组件 _parentNode 接线（hydrate 嵌套组件）', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = '<div class="page"><span class="inner">i</span></div>'
  const Inner = async (_init: any) => () => h('span', { class: 'inner' }, 'i')
  const Page = async (_init: any) => () => h('div', { class: 'page' }, h(Inner, {}))
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Page, {})
  await hydrateVNode(el, vnode, vctx)
  assert.equal(el.querySelector('.inner')?.textContent, 'i')
})

test('hydration: 顶层数组渲染（组件返回数组）', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = '<span class="x1">1</span><span class="x2">2</span>'
  const Page = async (_init: any) => () => [h('span', { class: 'x1' }, '1'), h('span', { class: 'x2' }, '2')]
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Page, {})
  await hydrateVNode(el, vnode, vctx)
  assert.equal(el.querySelectorAll('span').length, 2, '数组项各自收养')
  assert.equal(el.querySelector('.x1')?.textContent, '1')
  assert.equal(el.querySelector('.x2')?.textContent, '2')
})

test('hydration: 顶层容器残留清理（root 多余子节点移除）', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  // root 下两个顶层节点：第一个被收养，第二个是残留
  el.innerHTML = '<div class="page">p</div><div class="leftover">x</div>'
  const Page = async (_init: any) => () => h('div', { class: 'page' }, 'p')
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Page, {})
  await hydrateVNode(el, vnode, vctx)
  assert.equal(el.querySelectorAll('div').length, 1, '残留 .leftover 移除')
  assert.equal(el.querySelector('.page')?.textContent, 'p')
})

// ═══════════════ serve 错误页 ═══════════════

test('serve: 组件工厂抛错 → 错误页兜底（buildVNode catch）', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('err-page-root')
  const router = new UIRouter()
  const Boom = async (_init: any) => { throw new Error('factory boom') }
  router.get('/', () => h(Boom, {}))
  const handle = uiServe(router, { root: '#err-page-root' })
  await flush(10)
  const errEl = el.querySelector('.ui-dom-error')
  assert.ok(errEl, '错误页渲染')
  assert.ok(errEl?.textContent?.includes('factory boom'), '错误信息展示')
  handle.close()
})

test('scheduler: 顺序执行——同 id 连续触发按序落地（无互斥锁）', async () => {
  const reg = createRegistry()
  const ctx = { browser: createClientBrowser(), ui: { _selfId: '_wf_root' } } as any
  const root = mount('w-root')
  const s = createScheduler({ registry: reg, ctx, rootEl: root })
  let renders = 0
  const vnode = { type: () => {}, props: {}, _id: '_wf_re', _render: () => { renders++; return h('div', { class: 're' }, String(renders)) }, _parentNode: root } as any
  reg.idRegistry.set('_wf_re', vnode)
  vnode._child = vnode._render() // 首帧渲染（renders=1）
  const node = renderValue(vnode._child, ctx, ctx.browser)!
  root.appendChild(node)
  vnode._refNode = node
  // 连续触发两次：顺序执行，都落地（await 拿到最终 DOM）
  await s.render(['_wf_re'])
  await s.render(['_wf_re'])
  assert.equal(renders, 3, '首帧 1 + 两次 render')
  assert.equal(root.querySelector('.re')?.textContent, '3', '最终 DOM 最新')
})

// ═══════════════ serve.ts ═══════════════

test('serve: loading 模式不清空 root（骨架屏保留 → 首帧原子替换）', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('loading-root')
  el.innerHTML = '<div class="skeleton">loading...</div>' // 预置骨架屏
  const router = new UIRouter()
  router.get('/', () => h('div', { id: 'done' }, 'content'))
  const handle = uiServe(router, { root: '#loading-root', loading: true })
  await flush(10)
  assert.equal(el.querySelector('#done')?.textContent, 'content', '首帧替换骨架屏')
  handle.close()
})

// ═══════════════ scheduler.ts ═══════════════

test('scheduler: 未挂载/挂载中组件 render → 同步跳过（不排队、立即 resolve）', async () => {
  const reg = createRegistry()
  const ctx = { browser: createClientBrowser(), ui: { _selfId: '_wf_root' } } as any
  const s = createScheduler({ registry: reg, ctx })
  // 未注册 id
  await s.render(['_wf_nonexistent'])
  // 已注册但 _render 未设（工厂执行中——mountCommand 挂载期）
  const vnode = { type: () => {}, props: {}, _id: '_wf_pending' } as any
  reg.idRegistry.set('_wf_pending', vnode)
  await s.render(['_wf_pending'])
})

test('scheduler: 顺序队列——连续 render await 后 DOM 为最终状态', async () => {
  const reg = createRegistry()
  const ctx = { browser: createClientBrowser(), ui: { _selfId: '_wf_root' } } as any
  const root = mount('sch-root')
  const s = createScheduler({ registry: reg, ctx, rootEl: root })
  const renderFn = (props: any) => h('div', { class: 'v' }, String(props.n))
  const vnode = { type: () => {}, props: {}, _id: '_wf_a', _render: renderFn, _parentNode: root } as any
  reg.idRegistry.set('_wf_a', vnode)
  vnode._child = renderFn({ n: 0 })
  const node = renderValue(vnode._child, ctx, ctx.browser)!
  root.appendChild(node)
  vnode._refNode = node
  // 连续 render（不 await 第一个）：顺序队列保证第二个在前一个完成后执行
  let n = 0
  vnode._render = () => h('div', { class: 'v' }, String(++n))
  const p1 = s.render(['_wf_a'])
  const p2 = s.render(['_wf_a'])
  await Promise.all([p1, p2])
  assert.equal(root.querySelector('.v')?.textContent, '2', '顺序执行最终 DOM 最新')
})

test('scheduler: 渲染抛错 → onError 回调（不吞）', async () => {
  const reg = createRegistry()
  const ctx = { browser: createClientBrowser(), ui: { _selfId: '_wf_root' } } as any
  const root = mount('err-root')
  let got: unknown
  const s = createScheduler({ registry: reg, ctx, rootEl: root, onError: (e) => { got = e } })
  const vnode = { type: () => {}, props: {}, _id: '_wf_e', _render: () => { throw new Error('boom') }, _parentNode: root, _refNode: root.firstChild } as any
  reg.idRegistry.set('_wf_e', vnode)
  await s.render(['_wf_e'])
  assert.ok(got instanceof Error, `onError 收到错误（实际 ${got}）`)
})

test('scheduler: render() 无参 → 当前 selfId 渲染', async () => {
  const reg = createRegistry()
  const ctx = { browser: createClientBrowser(), ui: { _selfId: '_wf_root' } } as any
  const root = mount('noself-root')
  const s = createScheduler({ registry: reg, ctx, rootEl: root })
  // 无 _selfId（root ui）→ 直接 resolve
  await s.render()
})

// ═══════════════ diff.ts ═══════════════

test('diff: 顶层数组 patch（fragment 语义——含 replaceChild 分支）', async () => {
  const ctx = makeCtx()
  const el = mount('arr-root')
  const v1 = [h('span', { class: 'a' }, '1'), h('span', { class: 'b' }, '2')]
  const n1 = renderValue(v1, ctx, ctx.browser)!
  el.appendChild(n1)
  const v2 = [h('span', { class: 'a' }, '1'), h('span', { class: 'b' }, '2'), h('span', { class: 'c' }, '3')]
  patchValue(el, el.firstChild, v1, v2, ctx)
  assert.equal(el.querySelectorAll('span').length, 3, '顶层数组 patch 落地')
})

test('patchProps: 移除分支——class/on/ref/value/普通属性', async () => {
  const el = document.createElement('div') as any
  // class 移除
  el.className = 'a'
  patchProps(el, { class: 'a' }, {})
  assert.equal(el.getAttribute('class'), null, 'class 移除')
  // on 移除（旧 handler removeEventListener）
  let clicks = 0
  const handler = () => { clicks++ }
  el.addEventListener('click', handler)
  patchProps(el, { onClick: handler }, {})
  el.click()
  assert.equal(clicks, 0, '事件移除后不触发')
  // ref 移除 → ref(null) 调用
  let cleaned = 0
  const ref = () => { cleaned++ }
  patchProps(el, { ref }, {})
  assert.equal(cleaned, 1, 'ref(null) 调用')
  // value 移除
  el.value = 'v'
  patchProps(el, { value: 'v' }, {})
  assert.equal(el.value, '', 'value 清空')
  // 普通属性删除
  el.setAttribute('data-x', '1')
  patchProps(el, { 'data-x': '1' }, {})
  assert.equal(el.getAttribute('data-x'), null, '普通属性移除')
  // 移除时 ov 为函数但新值 undefined → 不 setProp
})

// ═══════════════ mount.ts ═══════════════

test('mount: selfId 校验——空字符串 throw / 重复 throw / 正常注册', async () => {
  const root = mount('selfid-root')
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const { ctx } = handle
  // 空字符串
  assert.throws(() => (ctx.ui as any).selfId(''), /non-empty string/)
  assert.throws(() => (ctx.ui as any).selfId(undefined), /non-empty string/)
  // 正常注册（组件内）
  const C1 = async (_init: any, c: any) => { c.ui.selfId('stats'); return () => h('div', { id: 's1' }, 'x') }
  const C2 = async (_init: any, c: any) => { c.ui.selfId('stats'); return () => h('div', {}, 'y') }
  await handle.mount(h('div', {}, h(C1, {})))
  assert.ok(root.querySelector('#s1'), '正常注册渲染')
  // 重复 id（新 mount 同 id）→ throw
  await assert.rejects(handle.mount(h('div', {}, h(C2, {}))), /Duplicate component ID/)
  handle.unmount()
})

test('mount: createCommandContainer → body 下 div', () => {
  const c = createCommandContainer()
  assert.ok(c, '容器创建')
  assert.equal(c?.parentNode, document.body, '挂到 body')
  c?.remove()
})

// ═══════════════ vnode.ts ═══════════════

test('vnode: isNative/isComponent/isFragment/isPortal 断言', () => {
  assert.ok(isNative(h('div', {})))
  assert.ok(!isNative(h(() => null as any, {})))
  assert.ok(isComponent(h(() => null as any, {})))
  assert.ok(!isComponent(h('div', {})))
  assert.ok(isFragment({ type: Fragment, props: {} } as VNode))
  assert.ok(!isFragment(h('div', {})))
  assert.ok(isPortal(createPortal('x', 'k')))
  assert.ok(!isPortal(h('div', {})))
  assert.equal((createPortal('x', 'k') as any)._placement, 'remote', 'portal remote 标记')
})
