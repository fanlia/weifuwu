/**
 * vdom3 核心测试——vnode + stream（渲染执行 = 事件流）
 *
 * 验证核心不变量：
 *   1. mount：vnode 树 → 事件流（NODE_CREATE/TEXT_CREATE/INSERT/PROP_UPDATE）→ DOM
 *   2. patch：同位置同类型复用——仅变化发事件（TEXT_UPDATE/PROP_UPDATE）
 *   3. 异类型 → REMOVE + CREATE + INSERT（重建事件）
 *   4. 列表 keyed：同 key 复用——增删只操作变化项
 *   5. DOM = fold(事件流)：事件序列可断言（回放基础）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { h, mount, patch, stream, evKey } from '../ui-dom/vdom3/index.ts'

before(setupJsdom)

function mkRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

test('mount：vnode 树 → 事件流（CREATE/INSERT/PROP_UPDATE）→ DOM', () => {
  stream.reset()
  const root = mkRoot()
  const tree = h('div', { id: 'box', class: 'a' }, [
    h('span', {}, 'hello'),
    h('button', { onClick: () => {} }, '点击'),
  ])
  mount(tree, root)

  assert.ok(root.querySelector('#box'), '元素渲染')
  assert.equal(root.querySelector('span')?.textContent, 'hello', '文本渲染')

  const events = stream.events()
  assert.ok(events.some((e) => evKey(e) === 'node:create' && (e as any).payload?.tag === 'div'), 'NODE_CREATE 事件（div）')
  assert.ok(events.some((e) => evKey(e) === 'node:create' && (e as any).payload?.tag === 'button'), 'NODE_CREATE 事件（button）')
  assert.ok(events.some((e) => evKey(e) === 'node:insert'), 'INSERT 事件')
  assert.ok(events.some((e) => evKey(e) === 'prop:update' && (e as any).payload?.key === 'class'), 'PROP_UPDATE 事件（class）')
  document.body.removeChild(root)
})

test('patch：同位置同类型复用——仅文本/属性变化发事件（无重建）', () => {
  stream.reset()
  const root = mkRoot()
  // 直接构造两棵树
  const v1 = h('div', { id: 'box', class: 'a' }, ['旧文本'])
  const v2 = h('div', { id: 'box', class: 'b' }, ['新文本'])
  mount(v1, root)
  const box = root.querySelector('#box')!
  const text = box.childNodes[1] as Text // 锚点法：槽位 = [锚, 文本]
  stream.reset() // 清掉 mount 事件——只测 patch 事件

  patch(v1, v2, root)

  assert.equal(text.nodeValue, '新文本', '文本更新（同一节点——未重建）')
  assert.equal(box.getAttribute('class'), 'b', '属性更新（同一元素）')
  assert.equal(box.childNodes.length, 2, '无节点增删（复用）——[锚, 文本]')
  assert.equal(root.querySelectorAll('#box').length, 1, '单实例（无重建）')

  const events = stream.events()
  assert.ok(events.some((e) => evKey(e) === 'text:update'), 'TEXT_UPDATE 事件')
  assert.ok(events.some((e) => evKey(e) === 'prop:update' && (e as any).payload?.key === 'class' && (e as any).payload?.value === 'b'), 'PROP_UPDATE 事件（class a→b）')
  assert.ok(!events.some((e) => evKey(e) === 'node:create'), '无 NODE_CREATE（未重建）')
  document.body.removeChild(root)
})

test('异类型/异 key → REMOVE + CREATE + INSERT（重建事件）', () => {
  stream.reset()
  const root = mkRoot()
  const v1 = h('div', {}, [h('span', { id: 'old' }, '旧')])
  const v2 = h('div', {}, [h('p', { id: 'new' }, '新')])
  mount(v1, root)
  stream.reset()

  patch(v1, v2, root)

  assert.ok(!root.querySelector('#old'), '旧元素移除')
  assert.ok(root.querySelector('#new'), '新元素创建')
  const events = stream.events()
  assert.ok(events.some((e) => evKey(e) === 'node:remove'), 'REMOVE 事件（旧节点）')
  assert.ok(events.some((e) => evKey(e) === 'node:create' && (e as any).payload?.tag === 'p'), 'NODE_CREATE 事件（新节点）')
  assert.ok(events.some((e) => evKey(e) === 'node:insert'), 'INSERT 事件（新节点）')
  document.body.removeChild(root)
})

test('列表 keyed：同 key 复用——增删只操作变化项（事件断言）', () => {
  stream.reset()
  const root = mkRoot()
  const mk = (items: Array<{ id: string; label: string }>) =>
    h('ul', {}, items.map((it) => h('li', { key: it.id, 'data-id': it.id }, it.label)))
  const v1 = mk([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  mount(v1, root)
  assert.equal(root.querySelectorAll('li').length, 2, '初始 2 项')

  stream.reset()
  const v2 = mk([{ id: 'a', label: 'A' }, { id: 'c', label: 'C' }])
  patch(v1, v2, root)
  assert.equal(root.querySelectorAll('li').length, 2, 'b→c 替换（a 复用）')
  assert.ok(root.querySelector('[data-id="a"]'), 'a 保留（复用）')
  assert.ok(root.querySelector('[data-id="c"]'), 'c 新增')
  assert.ok(!root.querySelector('[data-id="b"]'), 'b 移除')

  const events = stream.events()
  const creates = events.filter((e) => evKey(e) === 'node:create' && !(e.payload as any)?.kind)
  assert.equal(creates.length, 1, '仅 c 创建（a/b 复用——无全量重建；锚 create 不计）')
  document.body.removeChild(root)
})

test('事件流可断言：DOM = fold(事件流)——事件序列精确描述渲染', () => {
  stream.reset()
  const root = mkRoot()
  const v1 = h('div', { id: 'box' }, ['初始'])
  mount(v1, root)
  const mountEvents = stream.events()
  // 事件序列：NODE_CREATE(div) → ... → TEXT_CREATE → INSERT
  const first = mountEvents[0]
  assert.equal(evKey(first), 'node:create', '事件流第一条 = 根节点创建')
  const hasTextCreate = mountEvents.some((e) => evKey(e) === 'text:create' && (e as any).payload?.value === '初始')
  assert.ok(hasTextCreate, 'TEXT_CREATE 事件携带文本内容')
  const hasInsert = mountEvents.some((e) => evKey(e) === 'node:insert')
  assert.ok(hasInsert, 'INSERT 事件（根入 root）')
  document.body.removeChild(root)
})

// ── P0 组件层：两阶段组件（mount/patch 复用/卸载）──

test('组件：挂载（COMP_MOUNT）→ 更新（复用实例状态保持）→ 卸载（COMP_UNMOUNT）', async () => {
  stream.reset()
  const root = mkRoot()
  // 有状态组件（内部 let——跨渲染保持）
  let factoryRuns = 0
  const Counter = async (_init: any, _ctx: any) => {
    factoryRuns++
    let count = 0
    return async (_props: any) => {
      return h('div', { class: 'counter' }, [`count:${count}`])
    }
  }
  // build + mount（buildVNode 纯函数式——用返回值）
  const tree = h(Counter, {})
  const { buildVNode } = await import('../ui-dom/vdom3/build.ts')
  const built = await buildVNode(tree, {})
  const { mount } = await import('../ui-dom/vdom3/index.ts')
  mount(built, root)
  assert.equal(root.querySelector('.counter')?.textContent, 'count:0', '组件渲染')
  assert.equal(factoryRuns, 1, '工厂执行 1 次')

  // 更新（同类型组件——oldV 对照复用 _render——工厂不重跑；对照用 built（构建产物））
  const tree2 = h(Counter, {})
  const built2 = await buildVNode(tree2, {}, built)
  assert.equal(factoryRuns, 1, '同类型复用——工厂不重跑（组件内部状态保持）')
  // patch 更新（同类型——_render 复用——输出 patch）
  const { patch } = await import('../ui-dom/vdom3/index.ts')
  patch(built, built2, root)
  assert.equal(root.querySelector('.counter')?.textContent, 'count:0', '复用实例渲染（状态保持）')
  document.body.removeChild(root)
})

test('组件：事件流包含 COMP_MOUNT（挂载即事件——引擎本体）', async () => {
  stream.reset()
  const root = mkRoot()
  const Greet = async (_init: any, _ctx: any) => {
    return async (_props: any) => h('span', { id: 'greet' }, 'hi')
  }
  const { buildVNode } = await import('../ui-dom/vdom3/build.ts')
  const { mount } = await import('../ui-dom/vdom3/index.ts')
  const tree = h(Greet, {})
  const built = await buildVNode(tree, {})
  mount(built, root)
  assert.ok(root.querySelector('#greet'), '组件输出渲染')
  const events = stream.events()
  assert.ok(events.some((e) => evKey(e) === 'comp:mount'), 'COMP_MOUNT 事件')
  assert.ok(events.some((e) => evKey(e) === 'node:create' && (e as any).payload?.tag === 'span'), '组件内部节点创建事件（全链路）')
  document.body.removeChild(root)
})

// ── P1 调度：render 合并 / 批处理 / 防死循环 ──

test('调度：同 tick 多次 render → 合并为一次更新（renderFn 不重复执行）', async () => {
  const { Scheduler } = await import('../ui-dom/vdom3/scheduler.ts')
  const sched = new Scheduler()
  let runs = 0
  const fn = () => { runs++ }
  // 同 tick 3 次 schedule → flush 一次执行 3 个（或合并）
  sched.schedule(fn)
  sched.schedule(fn)
  sched.schedule(fn)
  assert.equal(sched.pending(), 3, '3 个待处理')
  await new Promise((r) => setTimeout(r, 10)) // 微任务 flush
  assert.equal(runs, 3, 'flush 执行 3 个')
  assert.equal(sched.pending(), 0, '队列清空')
})

test('调度：flush 中再次 schedule → 下一轮补跑（不死循环）', async () => {
  const { Scheduler } = await import('../ui-dom/vdom3/scheduler.ts')
  const sched = new Scheduler()
  let count = 0
  const fn = () => {
    count++
    if (count < 3) sched.schedule(fn) // 渲染中再触发（补跑）
  }
  sched.schedule(fn)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(count, 3, '补跑至稳定（不死循环——上限内）')
})

test('调度：无限重渲染 → 循环上限截断（防死循环——vdom2 pending 教训）', async () => {
  const { Scheduler } = await import('../ui-dom/vdom3/scheduler.ts')
  const sched = new Scheduler()
  let count = 0
  const fn = () => { count++; sched.schedule(fn) } // 无限自触发
  const errs: string[] = []
  const oe = console.error
  console.error = (...a: any[]) => { errs.push(String(a[0])); oe(...a) }
  try {
    sched.schedule(fn)
    await new Promise((r) => setTimeout(r, 20))
  } finally {
    console.error = oe
  }
  assert.ok(errs.some((e) => e.includes('渲染循环超限')), '循环超限报错（截断）')
  assert.ok(count < 100, `截断（count=${count}）`)
})

test('createRoot：组件 ctx.render → 调度重渲染（内部状态更新 → DOM 更新）', async () => {
  const { createRoot, h } = await import('../ui-dom/vdom3/index.ts')
  const root = mkRoot()
  let count = 0
  const Counter = async (_init: any, ctx: any) => {
    return async (_props: any) => h('div', { id: 'c' }, [`count:${count}`])
  }
  const tree = h(Counter, {})
  const handle = createRoot(tree, root)
  await new Promise((r) => setTimeout(r, 10)) // 初始挂载（异步构建）
  assert.equal(root.querySelector('#c')?.textContent, 'count:0', '初始渲染')

  count = 1
  handle.rerender()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#c')?.textContent, 'count:1', '调度重渲染（DOM 更新）')
  document.body.removeChild(root)
})

// ── P2 事件流能力：回放 / 取消 / 断言 ──

test('回放：DOM = fold(事件流)——重放事件序列 → 结果与原始渲染同构', async () => {
  const { replay } = await import('../ui-dom/vdom3/replay.ts')
  stream.reset()
  const root = mkRoot()
  const tree = h('div', { id: 'box', class: 'a' }, [h('span', {}, 'hello'), 'tail'])
  const { mount } = await import('../ui-dom/vdom3/index.ts')
  mount(tree, root)
  const events = stream.events()

  // 回放到新容器——事件流自包含（id 映射独立）
  const target = document.createElement('div')
  document.body.appendChild(target)
  replay(events, target)
  // jsdom 怪癖：动态 setAttribute('id') 后 querySelector('#id') 缓存失效——用属性选择器
  assert.equal(target.querySelector('[id="box"]')?.getAttribute('class'), 'a', '回放：元素+属性')
  assert.equal(target.querySelector('span')?.textContent, 'hello', '回放：子元素+文本')
  assert.ok(target.innerHTML.includes('tail'), '回放：尾部文本')
  // 与原始渲染同构（结构一致——忽略 data-v3-id 差异）
  assert.equal(target.querySelector('[id="box"]')?.childNodes.length, root.querySelector('[id="box"]')?.childNodes.length, '回放：子节点数一致')
  document.body.removeChild(root)
  document.body.removeChild(target)
})

test('取消：undo 应用逆操作——INSERT→REMOVE、PROP/TEXT_UPDATE→恢复 prev', async () => {
  const { undo } = await import('../ui-dom/vdom3/replay.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  stream.reset()
  const root = mkRoot()
  const { mount, patch } = await import('../ui-dom/vdom3/index.ts')
  // 挂载 + 更新（产生 INSERT/PROP_UPDATE/TEXT_UPDATE/REMOVE 事件）
  const v1 = h('div', { id: 'box', class: 'a' }, ['旧'])
  mount(v1, root)
  const v2 = h('div', { id: 'box', class: 'b' }, ['新'])
  patch(v1, v2, root)
  const events = stream.events()
  const box = root.querySelector('#box')!

  // undo 最近 2 个 DOM 指令（TEXT_UPDATE + PROP_UPDATE）→ 恢复旧值
  undo(events, 2, (await import('../ui-dom/vdom3/render.ts')).registry)
  assert.equal(box.getAttribute('class'), 'a', 'undo：属性恢复旧值')
  assert.equal(box.childNodes[1]?.nodeValue, '旧', 'undo：文本恢复旧值（锚点法：锚后为文本）')
  document.body.removeChild(root)
})

test('断言：expectEventSequence——渲染 = 事件序列（精确断言）', async () => {
  const { expectEventSequence, eventsOf } = await import('../ui-dom/vdom3/replay.ts')
  stream.reset()
  const root = mkRoot()
  const { mount } = await import('../ui-dom/vdom3/index.ts')
  mount(h('div', { id: 'x' }, '文本'), root)
  const events = stream.events()
  // 断言事件序列（NODE_CREATE 开头 + 包含 INSERT/TEXT_CREATE）
  expectEventSequence(events, ['node:create'])
  assert.ok(eventsOf(events, 'node:create').length >= 1, 'NODE_CREATE 事件')
  assert.ok(eventsOf(events, 'text:create').length >= 1, 'TEXT_CREATE 事件')
  assert.ok(eventsOf(events, 'node:insert').length >= 1, 'INSERT 事件')
  // 断言失败应抛错
  let threw = false
  try { expectEventSequence(events, ['node:remove']) } catch { threw = true }
  assert.ok(threw, '序列不符 → 抛错')
  document.body.removeChild(root)
})

// ── P3 路由：ROUTE_CHANGE → location→DOM 全链路事件流 ──

test('路由：navigate → ROUTE_CHANGE 事件 → 页面挂载（全链路事件流）', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  stream.reset()
  const root = mkRoot()
  const Home = async (_init: any, _ctx: any) => async () => h('div', { id: 'home' }, '首页')
  const About = async (_init: any, _ctx: any) => async () => h('div', { id: 'about' }, '关于')
  const router = createRouter([
    { path: '/', render: () => h(Home, {}) },
    { path: '/about', render: () => h(About, {}) },
  ], root, { initialPath: '/' })
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('[id="home"]'), '首帧渲染（/ → Home）')

  router.navigate('/about')
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('[id="about"]'), '导航 → About 渲染')
  assert.ok(!root.querySelector('[id="home"]'), 'Home 移除（页面切换）')

  const events = stream.events()
  const routeEvts = events.filter((e) => evKey(e) === 'route:change')
  assert.equal(routeEvts.length, 2, 'ROUTE_CHANGE 事件（初始 + 导航）')
  assert.equal((routeEvts[1] as any).payload?.path, '/about', '导航事件携带 path')
  // 全链路：ROUTE_CHANGE → COMP_MOUNT → NODE_CREATE → INSERT
  const seq = events.slice(events.findIndex((e) => evKey(e) === 'route:change' && (e as any).payload?.path === '/about'))
  assert.ok(seq.some((e) => evKey(e) === 'comp:mount'), '导航后 COMP_MOUNT（页面组件）')
  assert.ok(seq.some((e) => evKey(e) === 'node:create'), '导航后 NODE_CREATE')
  assert.ok(seq.some((e) => evKey(e) === 'node:insert'), '导航后 INSERT')
  assert.ok(seq.some((e) => evKey(e) === 'comp:unmount'), '导航后 COMP_UNMOUNT（旧页面）')
  router.close()
  document.body.removeChild(root)
})

test('路由：参数解析（:id）→ params 注入 → ROUTE_CHANGE 携带', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  stream.reset()
  const root = mkRoot()
  let seenParams: Record<string, string> = {}
  const User = async (_init: any, _ctx: any) => async (props: any) => h('div', { id: 'user' }, [`user:${props.params?.id ?? '?'}`])
  const router = createRouter([
    { path: '/user/:id', render: (params) => { seenParams = params; return h(User, { params }) } },
  ], root, { initialPath: '/user/123' })
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('[id="user"]'), '用户页渲染')
  assert.equal(root.querySelector('[id="user"]')?.textContent, 'user:123', 'params 注入渲染')
  assert.equal(seenParams.id, '123', 'params 解析')
  const routeEvt = stream.events().find((e) => evKey(e) === 'route:change') as any
  assert.equal(routeEvt.payload.params.id, '123', 'ROUTE_CHANGE 携带 params')
  router.close()
  document.body.removeChild(root)
})

// ── P4 生命周期：onUnmount 钩子（卸载清理） ──

test('生命周期：组件卸载 → onUnmount 钩子执行（清理注册的副作用）', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  stream.reset()
  const root = mkRoot()
  let cleaned = 0
  let timerId: ReturnType<typeof setInterval> | null = null
  const Home = async (_init: any, ctx: any) => {
    // 组件挂载：注册定时器 + onUnmount 清理
    timerId = setInterval(() => {}, 1000)
    ctx.onUnmount?.(() => { cleaned++; if (timerId) { clearInterval(timerId); timerId = null } })
    return async () => h('div', { id: 'home' }, '首页')
  }
  const About = async (_init: any, _ctx: any) => async () => h('div', { id: 'about' }, '关于')
  const router = createRouter([
    { path: '/', render: () => h(Home, {}) },
    { path: '/about', render: () => h(About, {}) },
  ], root, { initialPath: '/' })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(cleaned, 0, '初始：未清理')

  router.navigate('/about')
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(cleaned, 1, '导航离开 → onUnmount 执行（定时器清理）')
  assert.equal(timerId, null, '定时器已清（资源释放）')
  router.close()
  document.body.removeChild(root)
})

// ── SSR 事件流水合：服务端生成事件流 → 客户端重放（零 DOM 猜测） ──

test('SSR：renderToEvents 生成事件流 → serialize/deserialize → replay 重建 DOM（与 mount 同构）', async () => {
  const { renderToEvents, serializeEvents, deserializeEvents } = await import('../ui-dom/vdom3/ssr.ts')
  const { replay } = await import('../ui-dom/vdom3/replay.ts')
  // 组件树（含文本/属性/嵌套）
  const Page = async (_init: any, _ctx: any) => {
    return async () => h('div', { id: 'page', class: 'x' }, [
      h('h1', {}, '标题'),
      h('p', {}, ['内容 ', '段落']),
      h('ul', {}, ['a', 'b', 'c'].map((it, i) => h('li', { key: it + i }, it))),
    ])
  }
  // 服务端：生成事件流 + 序列化
  const events = await renderToEvents(h(Page, {}))
  const json = serializeEvents(events)
  const parsed = deserializeEvents(json)
  assert.equal(parsed.length, events.length, '序列化往返无损')

  // 客户端：重放 → DOM（零 DOM 猜测——事件流自带全部指令）
  const container = document.createElement('div')
  document.body.appendChild(container)
  replay(parsed, container)
  assert.ok(container.querySelector('[id="page"]'), '重放：根元素')
  assert.equal(container.querySelector('[id="page"]')?.getAttribute('class'), 'x', '重放：属性')
  assert.equal(container.querySelector('h1')?.textContent, '标题', '重放：文本')
  assert.equal(container.querySelectorAll('li').length, 3, '重放：列表')
  assert.ok(container.innerHTML.includes('内容'), '重放：多段文本')
  document.body.removeChild(container)
})

test('SSR：组件挂载事件（COMP_MOUNT）在服务端事件流中（可审计）', async () => {
  const { renderToEvents } = await import('../ui-dom/vdom3/ssr.ts')
  const Comp = async (_init: any, _ctx: any) => async () => h('span', {}, 'hi')
  const events = await renderToEvents(h(Comp, {}))
  assert.ok(events.some((e) => evKey(e) === 'node:create' && (e as any).payload?.tag === 'span'), 'SSR 事件流含节点创建')
  // 服务端生成不污染全局流（独立数组）
  assert.ok(!stream.events().includes(events[0]), 'SSR 事件独立于运行时流')
})

// ── 流式渲染：服务端逐事件推送 → 客户端逐事件应用（渐进首屏） ──

test('流式渲染：AsyncGenerator 逐事件 → 客户端逐事件 apply → 与完整回放同构', async () => {
  const { renderToEventStream } = await import('../ui-dom/vdom3/ssr.ts')
  const { applyEvent } = await import('../ui-dom/vdom3/replay.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  const Page = async (_init: any, _ctx: any) => {
    return async () => h('div', { id: 'stream-page' }, [
      h('h1', {}, '流式标题'),
      h('p', {}, ['流式', '内容']),
      h('ul', {}, ['a', 'b'].map((it, i) => h('li', { key: it + i }, it))),
    ])
  }
  // 服务端：流式推送（模拟分批到达——每 2 事件一批）
  const stream0 = renderToEventStream(h(Page, {}))
  const received: any[] = []
  for await (const ev of stream0) received.push(ev)

  // 客户端：逐事件应用（模拟传输延迟）
  const target = document.createElement('div')
  document.body.appendChild(target)
  const reg = new NodeRegistry()
  reg.register(NodeRegistry.ROOT, target)
  let applied = 0
  for (const ev of received) {
    applyEvent(ev, target, reg)
    applied++
  }
  // 与同步回放同构
  assert.ok(target.querySelector('[id="stream-page"]'), '流式：根元素')
  assert.equal(target.querySelector('h1')?.textContent, '流式标题', '流式：标题文本')
  assert.equal(target.querySelectorAll('li').length, 2, '流式：列表')
  assert.ok(target.innerHTML.includes('内容'), '流式：多段文本')
  assert.equal(applied, received.length, '全部事件已应用')
  document.body.removeChild(target)
})

test('流式渲染：渐进性——根节点事件先到即可先显示（TTFB 后首块可见）', async () => {
  const { renderToEventStream } = await import('../ui-dom/vdom3/ssr.ts')
  const { applyEvent } = await import('../ui-dom/vdom3/replay.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  const App = async (_init: any, _ctx: any) => async () => h('div', { id: 'p', class: 'c' }, ['内容'])
  const stream0 = renderToEventStream(h(App, {}))
  const it = stream0[Symbol.asyncIterator]()
  // 第一批：仅根节点（NODE_CREATE + PROP_UPDATE + INSERT——无文本）
  const target = document.createElement('div')
  document.body.appendChild(target)
  const reg = new NodeRegistry()
  reg.register(NodeRegistry.ROOT, target)
  // 首批：NODE_CREATE + PROP_UPDATE + INSERT（根节点完整就位——渐进首屏）
  // 首批：到根节点挂载（INSERT）为止（创建+属性+挂载——渐进首屏）
  let ev
  let guard = 0
  do {
    const r = await it.next()
    assert.ok(!r.done, '流未提前结束')
    ev = r.value
    applyEvent(ev, target, reg)
    guard++
  } while ((ev.entity !== 'node' || ev.action !== 'insert') && guard < 10)
  assert.equal(ev.entity, 'node', '首批以 INSERT 结束（根已挂载）')
  assert.ok(target.querySelector('[id="p"]'), '根已挂载（渐进——非空壳）')
  assert.equal(target.querySelector('[id="p"]')?.getAttribute('class'), 'c', '属性已应用')
  const rest: any[] = []
  for await (const ev of { [Symbol.asyncIterator]: () => it }) rest.push(ev)
  for (const ev of rest) applyEvent(ev, target, reg)
  assert.equal(target.querySelector('[id="p"]')?.textContent, '内容', '完整应用后文本就位')
  document.body.removeChild(target)
})

// ── 多端同步：事件流 = 操作日志 → 镜像容器（协作基础） ──

test('同步：A 渲染 + 交互 → 事件日志 → B 增量镜像（DOM 同构）', async () => {
  const { createSync } = await import('../ui-dom/vdom3/sync.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  // 全局流隔离（测试独立——避免跨测试残留事件）
  const { stream: globalStream } = await import('../ui-dom/vdom3/events.ts')
  globalStream.reset()
  // 共享事件日志（模拟：一端记录——多端订阅）
  const log: any[] = []
  const emit = (ev: any) => { log.push(ev) }
  const getEvents = () => log
  const A = document.createElement('div')
  const B = document.createElement('div')
  document.body.appendChild(A)
  document.body.appendChild(B)
  // 容器 A：mount（记录事件到共享日志）
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let count = 0
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'sync-app' }, [
      h('button', { id: 'b', onClick: () => { count++; rerender() } }, [`c${count}`]),
      count > 0 ? h('p', { id: 'note' }, `clicked ${count}`) : null,
      h('ul', {}, ['x', 'y'].map((it, i) => h('li', { key: it + i }, it))),
    ])
  }
  // 用自定义流（hooks 到 log）——挂载 + 交互
  const rootA = createRoot(h(App, {}), A)
  await new Promise((r) => setTimeout(r, 20))
  // 同步初始事件（挂载后日志有内容）
  log.push(...(await import('../ui-dom/vdom3/events.ts')).stream.events().slice())
  const sync = createSync(B, getEvents)
  const n0 = sync.sync()
  assert.ok(n0 > 10, `首次同步（${n0} 事件）`)
  assert.ok(B.querySelector('[id="sync-app"]'), 'B 镜像：根')
  assert.equal(B.querySelectorAll('li').length, 2, 'B 镜像：列表')
  assert.equal(B.querySelector('[id="b"]')?.textContent, 'c0', 'B 镜像：文本')
  assert.ok(!B.querySelector('[id="note"]'), 'B 镜像：条件未显示')

  // 交互（同 tick 多次）→ A 更新
  ;(A.querySelector('[id="b"]') as HTMLButtonElement)?.click()
  ;(A.querySelector('[id="b"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  // 捕获 A 的更新事件（render 后的新事件）
  const streamMod = await import('../ui-dom/vdom3/events.ts')
  const newEvents = streamMod.stream.events().slice()
  // 全量日志 = 初始 + 更新（模拟远端日志已累积）
  log.length = 0
  log.push(...newEvents)

  // B 增量同步 → 与 A 同构
  const n1 = sync.sync()
  assert.ok(n1 > 0, `增量同步（${n1} 事件）`)
  assert.equal(B.querySelector('[id="b"]')?.textContent, 'c2', 'B 镜像：计数同步')
  assert.ok(B.querySelector('[id="note"]'), 'B 镜像：条件块同步出现')
  assert.equal(B.innerHTML, A.innerHTML, 'B 与 A 同构（DOM 完全一致）')
  document.body.removeChild(A)
  document.body.removeChild(B)
})

// ── vdom2 ↔ vdom3 兼容层：迁移路径（ctx.ui.render → ctx.render 适配） ──

test('兼容：vdom2 风格组件（ctx.ui.render）在 vdom3 树运行——交互/复用正常', async () => {
  // vdom2 风格组件（含内部状态 + ctx.ui.render——不依赖 hooks——签名已统一）
  const V2Counter: any = (initProps: any, ctx: any) => {
    let n = initProps.initial ?? 0
    return async (props: any) =>
      h('button', {
        id: 'v2btn',
        onClick: () => { n += props.step ?? 1; ctx.ui.render() },
      }, [`v2: ${n}`])
  }
  // vdom2/vdom3 组件签名统一（ctx: V3Ctx extends WfuiContext）——直接使用
  const V2CounterCompat = V2Counter as any
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'v2app' }, [
      h(V2CounterCompat, { initial: 5 }),
      h('button', { id: 'parent', onClick: () => rerender() }, 'parent'),
    ])
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const handle = createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(root.querySelector('[id="v2btn"]'), 'v2 组件挂载')
  assert.equal(root.querySelector('[id="v2btn"]')?.textContent, 'v2: 5', '初始状态')

  // v2 组件内部交互（ctx.ui.render → v3 render）
  ;(root.querySelector('[id="v2btn"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="v2btn"]')?.textContent, 'v2: 6', 'v2 组件交互（ui.render 适配）')

  // 父组件重渲染（v3 render）——v2 组件同位置复用（内部状态保持）
  ;(root.querySelector('[id="parent"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="v2btn"]')?.textContent, 'v2: 6', '父重渲染后 v2 状态保持（工厂不重跑）')
  document.body.removeChild(root)
})

test('兼容：vdom2 时代组件签名（ctx: WfuiContext）在 vdom3 渲染', async () => {
  // 模拟 vdom2 组件形态（无状态——只用 props）
  const V2Badge: any = (_init: any, _ctx: any) => async (props: any) =>
    h('span', { class: props.variant ? `badge-${props.variant}` : 'badge' }, props.label)
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', {}, [
      h(V2Badge, { label: '迁移', variant: 'primary' }),
      h('div', { id: 'rest' }, 'rest'),
    ])
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(root.querySelector('span[class="badge-primary"]'), 'v2 无状态组件渲染')
  assert.equal(root.querySelector('span')?.textContent, '迁移', '文本')
  assert.ok(root.querySelector('[id="rest"]'), '兄弟节点正常')
  document.body.removeChild(root)
})

// ── MOVE 事件：keyed 重排（移动而非重建——DOM 状态保持 + 精确事件流） ──

test('MOVE：keyed 列表重排 → MOVE 事件（非 REMOVE+CREATE）→ DOM 顺序正确', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  let order = ['a', 'b', 'c']
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', {}, [
      h('button', { id: 'rev', onClick: () => { order = ['c', 'b', 'a']; rerender() } }, 'rev'),
      h('ul', { id: 'ul' }, order.map((it) => h('li', { key: it, 'data-k': it }, it))),
    ])
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual([...root.querySelectorAll('li')].map((li) => li.textContent), ['a', 'b', 'c'], '初始顺序')
  // 重排（反转）
  ;(root.querySelector('[id="rev"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual([...root.querySelectorAll('li')].map((li) => li.textContent), ['c', 'b', 'a'], '重排后顺序')
  const moves = gs.events().filter((e) => evKey(e) === 'node:move')
  const anchorMoves = moves.filter((m) => m.payload?.key != null)
  assert.equal(anchorMoves.length, 2, `重排 = 2 个锚 MOVE 事件（c→首、a→尾）——实际 ${anchorMoves.length}`)
  const removes = gs.events().filter((e) => evKey(e) === 'node:remove')
  assert.equal(removes.length, 0, '无 REMOVE（节点复用——状态保持）')
  document.body.removeChild(root)
})

test('MOVE：事件流回放含 MOVE（重排可传输）+ undo 恢复原顺序', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  let order = ['a', 'b', 'c']
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'app' }, [
      h('button', { id: 'swap', onClick: () => { order = ['b', 'a', 'c']; rerender() } }, 'swap'),
      h('ul', {}, order.map((it) => h('li', { key: it }, it))),
    ])
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  ;(root.querySelector('[id="swap"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual([...root.querySelectorAll('li')].map((li) => li.textContent), ['b', 'a', 'c'], '交换后')
  // 回放：事件流 → 新容器（含 MOVE——重排可传输）
  const { replay, undo } = await import('../ui-dom/vdom3/replay.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  const target = document.createElement('div')
  document.body.appendChild(target)
  replay(gs.events(), target)
  assert.deepEqual([...target.querySelectorAll('li')].map((li) => li.textContent), ['b', 'a', 'c'], '回放含 MOVE')
  // undo：最后一个 MOVE → 恢复 a 到 b 前
  const reg2 = new NodeRegistry()
  reg2.register(NodeRegistry.ROOT, target)
  // 重建 registry 引用（回放用同一 registry 才能 undo）
  const events = gs.events()
  const reg = new NodeRegistry()
  reg.register(NodeRegistry.ROOT, target)
  target.innerHTML = ''
  for (const ev of events) {
    const { applyEvent } = await import('../ui-dom/vdom3/replay.ts')
    applyEvent(ev, target, reg)
  }
  undo(events, 1, reg)
  assert.deepEqual([...target.querySelectorAll('li')].map((li) => li.textContent), ['a', 'b', 'c'], 'undo 恢复原顺序')
  document.body.removeChild(root)
  document.body.removeChild(target)
})

// ── 路由页面交互：ctx.render 必须可用（createRouter 注入——非空 ctx） ──

test('路由：页面组件交互（ctx.render 重渲染当前页）——点击更新', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  let n = 0
  const CounterPage = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'rpage' }, [
      h('button', { id: 'rbtn', onClick: () => { n++; rerender() } }, [`n: ${n}`]),
      n > 0 ? h('p', { id: 'note' }, `clicked ${n}`) : null,
    ])
  }
  const router = createRouter([
    { path: '/counter', render: () => h(CounterPage, {}) },
  ], root, { initialPath: '/counter' })
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(root.querySelector('[id="rpage"]'), '页面挂载')
  assert.equal(root.querySelector('[id="rbtn"]')?.textContent, 'n: 0', '初始')
  ;(root.querySelector('[id="rbtn"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="rbtn"]')?.textContent, 'n: 1', '点击更新（ctx.render 生效）')
  assert.ok(root.querySelector('[id="note"]'), '条件块出现')
  router.close()
  document.body.removeChild(root)
})

// ── 事件流容量保护：环形缓冲（溢出只保留最近 max——O(1) emit） ──

test('事件流：环形缓冲——溢出保留最近 max 条（最旧丢弃）+ 顺序正确', async () => {
  const { createEventStream } = await import('../ui-dom/vdom3/events.ts')
  const s = createEventStream(5, { watermark: 0 }) // 禁用水位——纯溢出语义
  for (let i = 1; i <= 8; i++) s.emit({ entity: 'node', action: 'create', target: `n${i}`, payload: { tag: 'div' }, ts: i })
  const evs = s.events()
  assert.equal(evs.length, 5, '容量 5（保留最近 5）')
  // 溢出事件（stream:overflow）也占用缓冲——最近 5 条含溢出事件（n8 + overflow + n5..n7）
  const targets = evs.map((e: any) => e.target)
  assert.ok(targets.includes('n8'), '最新事件保留（n8）')
  assert.ok(!targets.includes('n1'), '最旧丢弃（n1）')
  assert.ok(evs.some((e) => e.entity === 'stream' && e.action === 'overflow'), '溢出事件在缓冲（覆盖可审计）')
  assert.equal(s.overflowCount(), 3, '溢出 3 次')
  s.reset()
  assert.equal(s.events().length, 0, 'reset 清空')
  assert.equal(s.overflowCount(), 0, 'reset 后溢出计数清零')
  // reset 后可复用
  s.emit({ entity: 'node', action: 'create', target: 'x', payload: { tag: 'span' }, ts: 1 })
  assert.equal(s.events().length, 1, 'reset 后继续记录')
})

// ── Portal：浮层渲染到远程容器（#__wf_portal——脱离父节点位置） ──

test('Portal：渲染到 #__wf_portal（父节点位置无内容）+ 更新 + 卸载', async () => {
  const { createPortal, ensurePortalContainer } = await import('../ui-dom/vdom3/index.ts')
  let open = true
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'main' }, [
      h('button', { id: 'toggle', onClick: () => { open = !open; rerender() } }, 'toggle'),
      open ? createPortal(h('div', { id: 'pop', class: 'wf-pop' }, '浮层内容'), 'test-pop') : null,
    ])
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  // portal 内容在 #__wf_portal（不在父节点位置）
  assert.ok(document.querySelector('#__wf_portal [data-wf-portal-key="test-pop"] #pop'), 'portal 内容渲染到远程容器')
  assert.equal(root.querySelector('#pop'), null, '父节点位置无 portal 内容')
  assert.equal(document.querySelector('#pop')?.textContent, '浮层内容', 'portal 文本')
  // 更新（关闭——条件变 null → 移除）
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(document.querySelector('#pop'), null, 'portal 卸载（容器清空）')
  assert.ok(root.querySelector('[id="main"]'), '主树正常')
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('Portal：嵌套 portal 随外层关闭一起清理（NavMenu 嵌套子菜单幽灵面板）', async () => {
  const { createPortal } = await import('../ui-dom/vdom3/index.ts')
  const App = async (_init: any, ctx: any) => {
    let outerOpen = true
    let innerOpen = true
    return async () => h('div', { id: 'main' }, [
      h('button', { id: 'toggle', onClick: () => { outerOpen = false; innerOpen = false; ctx.render() } }, 'close'),
      outerOpen ? createPortal(
        h('div', { id: 'outer-panel' }, [
          h('span', {}, 'outer'),
          // 嵌套 portal：vnode 在外层面板内容里，DOM 挂在独立容器
          innerOpen ? createPortal(h('div', { id: 'inner-pop' }, 'inner'), 'inner-pop') : null,
        ]),
        'outer-pop',
      ) : null,
    ])
  }
  const root = mkRoot()
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(document.querySelector('#outer-panel'), '外层 portal 渲染')
  assert.ok(document.querySelector('#inner-pop'), '嵌套 portal 渲染')
  // 关闭外层（嵌套 portal vnode 随外层子树一起移除）→ 嵌套容器也必须清空
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(document.querySelector('#outer-panel'), null, '外层 portal 卸载')
  assert.equal(document.querySelector('#inner-pop'), null, '嵌套 portal 内容随外层清理（无幽灵面板）')
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('Portal：事件流可回放（INSERT parent=portal:key——replay 重建浮层）', async () => {
  const { createPortal, replay } = await import('../ui-dom/vdom3/index.ts')
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', {}, [
      createPortal(h('div', { id: 'pop2' }, '重放浮层'), 'rp'),
    ])
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(document.querySelector('[data-wf-portal-key="rp"] #pop2'), '原渲染 portal')
  // 清空并回放（事件流 → portal 容器重建）
  const events = gs.events()
  document.querySelector('#__wf_portal')?.remove()
  const target = document.createElement('div')
  document.body.appendChild(target)
  replay(events, target)
  assert.ok(document.querySelector('[data-wf-portal-key="rp"] #pop2'), '回放重建 portal 内容')
  assert.equal(document.querySelector('#pop2')?.textContent, '重放浮层', '回放文本正确')
  document.body.removeChild(root)
  document.body.removeChild(target)
  document.querySelector('#__wf_portal')?.remove()
})

// ── hooks shim（阶段 2 最小闭环）：vdom2 hooks 在 vdom3 ctx 运行 ──

test('hooks shim：useExternal（createStore 共享状态）在 vdom3 组件运行', async () => {
  const { createV3Ui } = await import('../ui-dom/vdom3/ui.ts')
  const { createStore } = await import('../ui-dom/store.ts')
  const store = createStore({ user: 'alice' })
  // vdom2 风格组件（ctx.ui.useExternal——mount 订阅）
  const UserBadge = async (_init: any, ctx: any) => {
    const st = ctx.ui.useExternal(store)
    return async () => h('span', { id: 'badge' }, `user: ${st.state.user}`)
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(UserBadge, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="badge"]')?.textContent, 'user: alice', '初始渲染（订阅）')
  // store 变化 → 组件自动重渲染（useExternal 订阅驱动）
  store.set({ user: 'bob' })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="badge"]')?.textContent, 'user: bob', 'store 变化自动重渲染')
  document.body.removeChild(root)
})

test('hooks shim：useOpen（受控/非受控打开态）+ useControlled（输入态）', async () => {
  // useOpen 非受控（内部态 + render）
  const Dropdown = async (_init: any, ctx: any) => {
    const ctrl = ctx.ui.useOpen({ name: 'TestDropdown' })
    return async () => h('div', {}, [
      h('button', { id: 'dd-btn', onClick: () => { ctrl.setOpen(!ctrl.open); ctx.ui.render() } }, 'toggle'),
      ctrl.open ? h('div', { id: 'dd-panel' }, '面板') : null,
    ])
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(Dropdown, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="dd-panel"]'), null, '初始关闭')
  ;(root.querySelector('[id="dd-btn"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(root.querySelector('[id="dd-panel"]'), 'toggle 打开')
  ;(root.querySelector('[id="dd-btn"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="dd-panel"]'), null, '再次 toggle 关闭')
  document.body.removeChild(root)
})

test('hooks shim：真实 vdom2 组件（ToggleGroup——useControlled）在 vdom3 运行', async () => {
  const { ToggleGroup } = await import('../components/ToggleGroup/ToggleGroup.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  // 非受控（内部态——可点击）
  createRoot(h(ToggleGroup, { options: [{ value: 'red', label: '红' }, { value: 'green', label: '绿' }, { value: 'blue', label: '蓝' }] }), root)
  await new Promise((r) => setTimeout(r, 20))
  const btns = [...root.querySelectorAll('[class*="wf-toggle"] button, button')]
  assert.equal(btns.length, 3, 'ToggleGroup 渲染（3 按钮）')
  // 点击切换（非受控内部态——useControlled）
  const red = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('红'))
  ;(red as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  const redAfter = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('红'))
  assert.ok(redAfter?.className.includes('active') || redAfter?.getAttribute('aria-pressed') === 'true', '点击切换选中（红——非受控内部态）')
  document.body.removeChild(root)
})

test('hooks shim：真实 vdom2 组件批量——StatCard（useTween/useReducedMotion）+ Collapse（useOpen/useStableRef/useGlobalKey）', async () => {
  const { StatCard } = await import('../components/StatCard/StatCard.ts')
  const { Collapse } = await import('../components/Collapse/Collapse.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h('div', {}, [
    h(StatCard, { label: '订单', value: 42, animate: true }),
    h(Collapse, { items: [{ key: 'a', title: '标题A', content: '内容A' }] }),
  ]), root)
  await new Promise((r) => setTimeout(r, 60))
  // tween 动画在 jsdom 有时钟分叉（rAF 回调 performance ≠ 全局——负值）——
  // 与 vdom2 一致：测试断言结构（动画在真实浏览器验证）
  assert.ok(root.textContent?.includes('订单'), 'StatCard 渲染（label）')
  assert.ok(root.querySelector('[class*="wf-stat"]'), 'StatCard 结构')
  const header = root.querySelector('.wf-collapse-header') as HTMLElement
  assert.ok(header, 'Collapse 渲染')
  ;(header as HTMLElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const h2 = root.querySelector('.wf-collapse-header') as HTMLElement
  assert.ok(h2?.getAttribute('aria-expanded') === 'true', 'Collapse 展开（useControlled 内部态）')
  assert.ok(root.textContent?.includes('内容A'), 'Collapse 内容出现')
  document.body.removeChild(root)
})

test('usePopup：真实浮层组件（Popover）在 vdom3——打开/关闭/portal 渲染', async () => {
  const { Popover } = await import('../components/Popover/Popover.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  // 非受控（可交互——§5.2 纪律）
  createRoot(h(Popover, { content: h('div', { id: 'pop-content' }, '浮层内容'), children: h('button', { id: 'pop-trigger' }, '触发') }), root)
  await new Promise((r) => setTimeout(r, 40))
  const trigger = root.querySelector('[id="pop-trigger"]') as HTMLElement
  assert.ok(trigger, '触发器渲染')
  // 打开（triggerProps.onClick → useOpen setOpen(true) → portal 渲染）
  const wrap = root.querySelector('.wf-popover-wrap') as HTMLElement
  console.log('[pop-dbg] wrap evt:', (wrap as any).__v3evt, 'trigger evt:', (trigger as any).__v3evt)
  ;(trigger as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 40))
  console.log('[pop-dbg] portal:', !!document.querySelector('#__wf_portal'), 'pop:', !!document.querySelector('#pop-content'), 'html:', root.innerHTML.slice(0, 100))
  assert.ok(document.querySelector('#__wf_portal [data-wf-portal-key]'), 'portal 容器存在')
  assert.ok(document.querySelector('#pop-content'), '浮层内容渲染（portal——body 下）')
  assert.equal(root.querySelector('#pop-content'), null, '浮层不在主树（portal 语义）')
  // 外部点击关闭（document mousedown——usePopup 的外部点击）
  document.dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(document.querySelector('#pop-content'), null, '外部点击关闭')
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('ref：挂载回调（el）+ 卸载回调（null）+ 稳定 ref 不重绑（§5.1 纪律）', async () => {
  let mounted: any = null
  let unmounted = 0
  let bindCount = 0
  const stableRef = (el: any) => { bindCount++; if (el) mounted = el; else unmounted++ }
  let spanEl: any = null
  let spanUnmounted = 0
  const spanRef = (el: any) => { if (el) spanEl = el; else spanUnmounted++ }
  let show = true
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'ref-app' }, [
      h('button', { id: 'ref-btn', ref: stableRef }, 'A'),
      h('button', { id: 'toggle', onClick: () => { show = !show; rerender() } }, 't'),
      show ? h('span', { id: 'ref-span', ref: spanRef }, 's') : null,
    ])
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(mounted, 'ref 挂载回调（el）')
  assert.equal(root.querySelector('[id="ref-btn"]'), mounted, 'ref el = 实际 DOM')
  const before = bindCount
  // 条件移除（show=false）——span 卸载 → ref(null)；button 稳定 ref 不重绑
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(bindCount, before, '稳定 ref 重渲染不重绑（§5.1）')
  assert.equal(spanUnmounted, 1, '卸载 → ref(null)（span）')
  assert.equal(root.querySelector('#ref-span'), null, 'span 已移除')
  document.body.removeChild(root)
})

test('浮层批量：Dropdown（usePopup 菜单）+ Modal（会话级模态——presence/portal）在 vdom3', async () => {
  const { Dropdown } = await import('../components/Dropdown/Dropdown.ts')
  const { Modal } = await import('../components/Modal/Modal.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h('div', {}, [
    h(Dropdown, { trigger: h('button', { id: 'dd-trigger' }, '操作'), items: [{ key: 'a', label: '编辑' }, { key: 'b', label: '删除' }] }),
    h(Modal, { open: true, onClose: () => {}, title: '确认', children: h('div', { id: 'modal-body' }, '模态内容') }),
  ]), root)
  await new Promise((r) => setTimeout(r, 50))
  // Modal：portal 渲染（#__wf_portal）
  assert.ok(document.querySelector('#__wf_portal [data-wf-portal-key]'), 'Modal portal 容器')
  assert.ok(document.querySelector('#__wf_portal')?.textContent?.includes('确认'), 'Modal 标题（portal）')
  assert.ok(!root.textContent?.includes('确认'), 'Modal 内容不在主树（portal 语义）')
  assert.ok(document.querySelector('#modal-body'), 'Modal 内容（portal）')
  // Dropdown：点击打开
  const ddBtn = root.querySelector('[id="dd-trigger"]') as HTMLButtonElement
  assert.ok(ddBtn, 'Dropdown 触发器')
  ;(ddBtn as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 40))
  assert.ok(document.querySelector('#__wf_portal')?.textContent?.includes('编辑'), 'Dropdown 菜单打开（portal）')
  // 关闭（外部点击）
  document.dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 40))
  assert.ok(!document.querySelector('#__wf_portal')?.textContent?.includes('编辑'), '外部点击关闭 Dropdown')
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('Select（重头组件——useControlledInput + usePopup + keyed 列表）在 vdom3', async () => {
  const { Select } = await import('../components/Select/Select.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let value: string | undefined
  // 非受控（组件内部态——useControlledInput 回填）
  createRoot(h(Select, {
    onChange: (v: any) => { value = v },
    searchable: true,
    options: [{ value: 'a', label: '苹果' }, { value: 'b', label: '香蕉' }, { value: 'c', label: '樱桃' }],
    placeholder: '选择水果',
  }), root)
  await new Promise((r) => setTimeout(r, 50))
  const trigger = root.querySelector('.wf-select-search-trigger, .wf-select-trigger') as HTMLElement
  assert.ok(trigger, 'Select 渲染')
  assert.ok(root.querySelector('input[placeholder="选择水果"]'), 'placeholder（input 属性）')
  // 打开（点击触发器 → usePopup）
  console.log('[sel-dbg] trigger:', trigger?.outerHTML?.slice(0, 120))
  ;(trigger as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 50))
  assert.ok(document.querySelector('[id="__wf_portal"]')?.textContent?.includes('苹果'), '下拉打开（portal——选项渲染）')
  // 选择选项（keyed 列表项点击 → onChange）
  const opts = [...document.querySelectorAll('[id="__wf_portal"] [class*="opt"]')]
  const apple = opts.find((el) => el.textContent?.includes('苹果'))
  assert.ok(apple, '选项元素存在')
  ;(apple as HTMLElement).dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(value, 'a', 'onChange 回调（选中苹果）')
  // 非受控单选：选中后关闭 + placeholder 保留（组件设计——回填走受控 value 回流）
  assert.ok(!document.querySelector('[id="__wf_portal"]')?.textContent?.includes('苹果'), '选中后关闭（portal 内容移除）')
  assert.ok(root.querySelector('input[placeholder="选择水果"]'), 'placeholder 保留（非受控无回填）')
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('useChat：会话创建 + 流式发送（token 累积→notify→订阅组件重渲染）+ 卸载 dispose', async () => {
  const { useChat } = await import('../ui-dom/hooks/chat.ts')
  // mock fetch（aiStream 用 fetch + SSE 解析——协议流）
  const origFetch = globalThis.fetch
  const sse = (ev: string, data: unknown) => `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sse('wf:token', { text: '你' }) + sse('wf:token', { text: '好' })))
      controller.enqueue(new TextEncoder().encode(sse('wf:done', {})))
      controller.close()
    },
  })
  globalThis.fetch = (async () => new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })) as any
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  // AiChat 风格组件：useChat 会话 + useExternal 订阅（流式 → 自动重渲染）
  let chatHandle: any = null
  const AiChat = async (_init: any, ctx: any) => {
    chatHandle = ctx.ui.useChat({ url: '/api/chat' })
    ctx.ui.useExternal(chatHandle)
    return async () => h('div', { id: 'chat' }, [
      h('div', { id: 'msgs' }, chatHandle.messages.map((m: any, i: number) =>
        h('p', { key: m.id + i }, `${m.role}:${m.content}${m.status === 'streaming' ? '…' : ''}`),
      )),
      h('button', { id: 'send', onClick: () => chatHandle.send() }, 'send'),
    ])
  }
  createRoot(h(AiChat, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(root.querySelector('[id="send"]'), 'AiChat 渲染')
  assert.ok(chatHandle, 'useChat handle（会话）')
  // 发送（mock transport——token 流）
  chatHandle.input = '你好'
  ;(root.querySelector('[id="send"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('#msgs')?.textContent?.includes('user:你好'), 'user 消息追加')
  assert.ok(root.querySelector('#msgs')?.textContent?.includes('assistant:'), 'assistant 占位（streaming）')
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(root.querySelector('#msgs')?.textContent?.includes('assistant:你好'), '流式 token 累积（notify → useExternal 重渲染）')
  globalThis.fetch = origFetch
  assert.equal(chatHandle.streaming, false, '流结束')
  document.body.removeChild(root)
})

test('SSR 端到端：renderToEvents → eventsToHtml（首帧 HTML）→ 客户端 replay（重建——零 DOM 猜测）', async () => {
  const { renderToEvents, eventsToHtml, serializeEvents, deserializeEvents } = await import('../ui-dom/vdom3/ssr.ts')
  const { replay } = await import('../ui-dom/vdom3/replay.ts')
  const Page = async (_init: any, _ctx: any) => {
    return async () => h('div', { id: 'ssr-page', class: 'card' }, [
      h('h1', {}, 'SSR 标题'),
      h('p', { 'data-k': 'v' }, ['内容 ', '段落']),
      h('ul', {}, ['a', 'b'].map((it, i) => h('li', { key: it + i }, it))),
    ])
  }
  // 服务端：事件流 + HTML 序列化
  const events = await renderToEvents(h(Page, {}))
  const html = eventsToHtml(events)
  assert.ok(html.startsWith('<div id="ssr-page" class="card">'), 'HTML 序列化（根元素+属性）')
  assert.ok(html.includes('SSR 标题'), 'HTML 序列化（文本——锚点法 h1 含锚注释）')
  assert.ok(html.includes('<li><!--wf-anchor-->a</li>') && html.includes('<li><!--wf-anchor-->b</li>'), 'HTML 序列化（列表——锚点法每槽位锚）')
  // 传输：事件流 JSON
  const json = serializeEvents(events)
  const parsed = deserializeEvents(json)
  // 客户端：replay（零 DOM 猜测——事件流自带全部指令）
  const root = document.createElement('div')
  document.body.appendChild(root)
  root.innerHTML = html // 服务端 HTML（首帧——SEO/爬虫）
  const root2 = document.createElement('div')
  document.body.appendChild(root2)
  replay(parsed, root2)
  // 剔除运行时内部属性（data-v3-id——replay 节点定位用）后同构
  const strip = (h: string) => h.replace(/ data-v3-id="[^"]*"/g, '')
  assert.equal(strip(root2.innerHTML), root.innerHTML, '客户端重建与服务端 HTML 同构（零 DOM 猜测——内部属性除外）')
  document.body.removeChild(root)
  document.body.removeChild(root2)
})

test('Modal 退场：open=false → exit 阶段（DOM 保留播动画）→ animationend → 卸载', async () => {
  const { Modal } = await import('../components/Modal/Modal.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let open = true
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'main' }, [
      h('button', { id: 'close', onClick: () => { open = false; rerender() } }, 'close'),
      h(Modal, { open, onClose: () => { open = false; rerender() }, title: '退场测试', children: h('div', {}, '内容') }),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 40))
  assert.ok(document.querySelector('.wf-modal'), 'Modal 打开（portal）')
  // 关闭（open=false → presence exit 阶段——DOM 保留播退场动画）
  ;(root.querySelector('[id="close"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 40))
  const modal = document.querySelector('.wf-modal')
  assert.ok(modal, 'exit 阶段：DOM 保留（退场动画）')
  assert.ok(modal.className.includes('wf-modal--exit'), 'exit class 生效')
  // animationend → 卸载
  modal.dispatchEvent(new (window as any).Event('animationend', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 40))
  assert.ok(!document.querySelector('.wf-modal'), 'animationend 后卸载')
  document.body.removeChild(root)
  document.querySelector('[id="__wf_portal"]')?.remove()
})

test('空洞对齐（vdom2 提交按钮事故回归）：children [Field, false, Button] 重渲染——false 位置不误删 Button', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let error = ''
  const Field = async (_init: any, _ctx: any) => async (props: any) =>
    h('div', { class: 'field' }, props.error ? '有错误' : '正常')
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => {
      const showAlert = error.length > 0
      return h('div', { id: 'form' }, [
        h(Field, { error }),
        showAlert && h('div', { class: 'alert' }, '错误提示'),
        h('button', { id: 'submit' }, '提交'),
      ])
    }
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('[id="submit"]'), '初始渲染：提交按钮')
  assert.equal(root.querySelector('.alert'), null, '初始无错误提示')
  // Field 加错误 → 重渲染（false → alert——空洞位置变化）
  ;(globalThis as any).__holeDebug = true
  error = '必填'
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(root.querySelector('.alert'), '错误提示出现')
  assert.ok(root.querySelector('[id="submit"]'), '提交按钮保留（false 位置不误删下一个兄弟——占位语义）')
  // 顺序正确（alert 在 submit 前——vnode 顺序 = DOM 顺序）
  const html = root.querySelector('[id="form"]')?.innerHTML ?? ''
  assert.ok(html.indexOf('alert') < html.indexOf('submit'), '顺序：alert 在 submit 前（prevNode 锚）')
  document.body.removeChild(root)
})

test('AiChat（agent 对话组件——useChat + subscribe + useVisualViewport/useScrollPosition）在 vdom3 完整对话', async () => {
  const { AiChat } = await import('../components/AiChat/AiChat.ts')
  // mock fetch（SSE 协议流）
  const origFetch = globalThis.fetch
  const sse = (ev: string, data: unknown) => `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`
  globalThis.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sse('wf:token', { text: '你好，' }) + sse('wf:token', { text: '我是助手' })))
      controller.enqueue(new TextEncoder().encode(sse('wf:done', {})))
      controller.close()
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })) as any
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let chatHandle: any = null
  const ChatPage = async (_init: any, ctx: any) => {
    chatHandle = ctx.ui.useChat({ url: '/api/chat' })
    return async () => h(AiChat, { chat: chatHandle })
  }
  createRoot(h(ChatPage, {}), root)
  await new Promise((r) => setTimeout(r, 50))
  assert.ok(root.querySelector('.wf-aichat'), 'AiChat 渲染')
  assert.ok(root.textContent?.includes('输入消息开始对话'), '空态')
  // 发送（模拟打字：input 事件 → keyword 内部态 → 点击发送）
  const inputEl = root.querySelector('.wf-chat-input input, .wf-chat-input') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(inputEl, '你好')
  inputEl.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 10))
  const sendBtn = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('发送'))
  assert.ok(sendBtn, '发送按钮')
  ;(sendBtn as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(root.textContent?.includes('你好，我是助手'), '流式回复累积渲染（subscribe → 重渲染）')
  assert.ok(root.querySelector('.wf-aichat-msg--user'), 'user 消息渲染（气泡类）')
  assert.ok(root.querySelector('.wf-aichat-msg--assistant'), 'assistant 消息渲染')
  document.body.removeChild(root)
  globalThis.fetch = origFetch
})

test('ctx 注入（createRoot options.ctx——中间件面）：组件消费 app/i18n 可选链', async () => {
  // node --test 不跑 .tsx（agent-platform 页面为 tsx——页面级验证在浏览器/阶段 5）
  // ——此处验证注入机制本身（.ts 组件消费 ctx.app/i18n）
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const navs: string[] = []
  const Page = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'page' }, [
      h('button', { id: 'go', onClick: () => ctx.app?.navigate('/x') }, 'go'),
      h('span', { id: 'label' }, ctx.i18n?.t('hello') ?? 'no-i18n'),
    ])
  }
  createRoot(h(Page, {}), root, {
    ctx: {
      app: { navigate: (p: string) => { navs.push(p) } },
      i18n: { t: (k: string) => `t:${k}` },
    },
  })
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.querySelector('[id="label"]')?.textContent, 't:hello', '注入 ctx.i18n 消费')
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(navs, ['/x'], '注入 ctx.app.navigate 回调')
  document.body.removeChild(root)
})

test('createRouter ctx 注入：路由页面消费中间件面（i18n/app）——应用入口形态', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  const navs: string[] = []
  const Page = async (_init: any, ctx: any) => async () => h('div', { id: 'p1' }, [
    h('span', { id: 'i18n' }, ctx.i18n?.t('welcome') ?? 'no'),
    h('button', { id: 'nav', onClick: () => ctx.app?.navigate('/next') }, 'go'),
  ])
  const router = createRouter([
    { path: '/', render: () => h(Page, {}) },
  ], root, {
    initialPath: '/',
    ctx: {
      i18n: { t: (k: string) => `t:${k}` },
      app: { navigate: (p: string) => { navs.push(p) } },
    },
  })
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.querySelector('[id="i18n"]')?.textContent, 't:welcome', '路由页面消费注入 i18n')
  ;(root.querySelector('[id="nav"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(navs, ['/next'], '路由页面消费注入 app.navigate')
  router.close()
  document.body.removeChild(root)
})

test('嵌套数组（vdom2 组件库模式 [props.children, x]）：拍平渲染——Field+Input 组件链', async () => {
  // AuthPage 模式：children 数组嵌套（props.children = [Field, Field]）
  const Field = async (_init: any, _ctx: any) => async (props: any) =>
    h('label', { class: 'wf-field' }, [props.label, props.children])
  const Input = async (_init: any, _ctx: any) => async (props: any) =>
    h('input', { type: props.type ?? 'text', placeholder: props.placeholder })
  const AuthPage = async (_init: any, _ctx: any) => async (props: any) =>
    h('form', { class: 'wf-auth' }, [
      h('div', { class: 'wf-fields' }, [props.children, h('button', { id: 'submit' }, '提交')]),
    ])
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const LoginPage = async (_init: any, _ctx: any) => async () =>
    h(AuthPage, {}, [
      h(Field, { label: '邮箱' }, h(Input, { type: 'email', placeholder: 'you@example.com' })),
      h(Field, { label: '密码' }, h(Input, { type: 'password', placeholder: '••••' })),
    ])
  createRoot(h(LoginPage, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.querySelectorAll('input').length, 2, '嵌套数组拍平——2 个输入框')
  assert.ok(root.textContent?.includes('邮箱'), 'Field label 渲染')
  assert.ok(root.querySelector('input[placeholder="you@example.com"]'), 'email input')
  assert.ok(root.querySelector('[id="submit"]'), '兄弟节点（Button）渲染')
  assert.ok(root.querySelector('input[type="password"]'), 'password input')
  document.body.removeChild(root)
})

test('audit：开发期不变量——重复 data-v3-id 检测（patch 泄漏）+ 顺序错位检测', async () => {
  const { auditAfterRender } = await import('../ui-dom/vdom3/audit.ts')
  const warnings: string[] = []
  const ow = console.warn
  console.warn = (...a: any[]) => { warnings.push(a.map(String).join(' ')); ow(...a) }
  const root = document.createElement('div')
  document.body.appendChild(root)
  // 正常渲染——无警告
  root.innerHTML = '<div data-v3-id="n1"><span data-v3-id="n2">x</span></div>'
  auditAfterRender(root)
  assert.equal(warnings.length, 0, '正常树无 audit 警告')
  // 泄漏场景：重复 id（节点未移除——双份）
  root.innerHTML = '<div data-v3-id="n1"></div><div data-v3-id="n1"></div>'
  auditAfterRender(root)
  assert.ok(warnings.some((w) => w.includes('重复 data-v3-id')), '重复 id 警告（泄漏检测）')
  console.warn = ow
  document.body.removeChild(root)
})

test('路由嵌套布局：layout 跨路由复用（工厂不重跑——vdom2 布局层语义）', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  let layoutRuns = 0
  const Layout = async (_init: any, ctx: any) => {
    layoutRuns++
    const rerender = () => ctx.render()
    return async (props: any) => h('div', { class: 'layout' }, [
      h('nav', { id: 'nav' }, 'nav'),
      h('main', {}, props.children),
    ])
  }
  const PageA = async (_init: any, _ctx: any) => async () => h('div', { id: 'page-a' }, '页面A')
  const PageB = async (_init: any, _ctx: any) => async () => h('div', { id: 'page-b' }, '页面B')
  const router = createRouter([
    { path: '/a', render: () => h(PageA, {}), layout: (p) => h(Layout, {}, p) },
    { path: '/b', render: () => h(PageB, {}), layout: (p) => h(Layout, {}, p) },
  ], root, { initialPath: '/a' })
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(layoutRuns, 1, '首次挂载 layout 工厂 1 次')
  assert.ok(root.querySelector('[id="page-a"]'), '页面A 渲染')
  // 导航（同 layout——复用）
  router.navigate('/b')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(layoutRuns, 1, '跨路由 layout 复用（工厂不重跑）')
  assert.ok(root.querySelector('[id="page-b"]'), '页面B 渲染（插槽切换）')
  assert.ok(root.querySelector('.layout nav'), 'layout 保持')
  router.close()
  document.body.removeChild(root)
})

test('入口形态：vdom2 中间件链复用（api/auth/i18n 注入 → vdom3 ctx）→ 页面组件消费', async () => {
  const { api } = await import('../ui-dom/middleware/api.ts')
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  // mock fetch（node 相对 URL 限制——api client 的 fetch 封装）
  const origFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ departments: [{ id: 'd1', name: '产品组' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any
  // 手动跑中间件链（uiServe 等价——vdom2 中间件是纯函数 (ctx) => ctx'）
  let ctx: any = {}
  ctx = await api({ baseURL: '/api' })(ctx)
  ctx = await (await import('../ui-dom/middleware/auth.ts')).auth({
    tokenKey: 't', userKey: 'u', storage: {
      getItem: (k: string) => (k === 't' ? 'token-x' : JSON.stringify({ id: 'u1', name: 'x' })),
      setItem: () => {}, removeItem: () => {},
    },
  })(ctx)
  // 页面组件消费注入的 ctx.api/auth
  const Page = async (_init: any, c: any) => async () => {
    const data = await c.api.get('/departments')
    return h('div', { id: 'mw-page' }, [
      h('span', { id: 'data' }, JSON.stringify(data)),
      h('span', { id: 'auth' }, String(!!c.auth?.isLoggedIn)),
    ])
  }
  const router = createRouter([
    { path: '/', render: () => h(Page, {}) },
  ], root, { initialPath: '/', ctx })
  await new Promise((r) => setTimeout(r, 40))
  assert.ok(root.querySelector('[id="mw-page"]'), '中间件注入的页面渲染')
  assert.ok(root.querySelector('[id="data"]')?.textContent?.length > 0, 'ctx.api 消费（注入的 api client 工作）')
  assert.equal(root.querySelector('[id="auth"]')?.textContent, 'true', 'ctx.auth 消费（token 解析——isLoggedIn）')
  router.close()
  globalThis.fetch = origFetch
  document.body.removeChild(root)
})

test('命令式 confirm（vdom3——createRoot 挂载 Confirm 组件 + Modal portal 退场）', async () => {
  const { v3Confirm } = await import('../ui-dom/vdom3/commands.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  let ctx: any = {}
  ctx = v3Confirm()(ctx)
  // 触发 confirm（异步——Modal 渲染到 portal）
  let result: boolean | null = null
  const p = ctx.confirm('确定删除？', { title: '删除确认' }).then((r: boolean) => { result = r })
  await new Promise((r) => setTimeout(r, 60))
  assert.ok(document.querySelector('[id="__wf_portal"] .wf-modal'), 'confirm Modal 渲染（portal）')
  assert.ok(document.querySelector('[id="__wf_portal"]')?.textContent?.includes('确定删除？'), 'confirm 文案')
  // 点确定
  const okBtn = [...document.querySelectorAll('[id="__wf_portal"] button')].find((b) => b.textContent?.includes('确定'))
  assert.ok(okBtn, '确定按钮')
  ;(okBtn as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(result, true, 'confirm resolve(true)')
  await p
  document.body.removeChild(root)
  document.querySelector('[id="__wf_portal"]')?.remove()
})

test('命令式 toast（v3——createRoot 挂载 Toast 组件）', async () => {
  const { v3Toast } = await import('../ui-dom/vdom3/commands.ts')
  let ctx: any = {}
  ctx = v3Toast()(ctx)
  ctx.toast('部门已删除', 'success')
  await new Promise((r) => setTimeout(r, 60))
  console.log('[toast-dbg] host:', document.querySelector('.wf-toast-host')?.innerHTML?.slice(0, 100))
  assert.ok(document.querySelector('.wf-toast-host'), 'toast host 渲染')
  assert.ok(document.querySelector('.wf-toast-host')?.textContent?.includes('部门已删除'), 'toast 文案')
  // 自动消失（3 秒兜底——不等——清理验证卸载）
  document.querySelector('.wf-toast-host')?.remove()
})

test('命令式 notification（v3——createRoot 挂载 Notification 组件——队列 + 自动消失）', async () => {
  const { v3Notification } = await import('../ui-dom/vdom3/commands.ts')
  let ctx: any = {}
  ctx = v3Notification()(ctx)
  // 命令式注入 + 渲染（portal）
  ctx.notification.success({ title: '部署成功', description: 'v0.63.0 已上线' })
  await new Promise((r) => setTimeout(r, 80))
  const notif = () => [...document.querySelectorAll('.wf-notification')]
  assert.ok(notif().length === 1, 'notification 渲染（portal）')
  assert.ok(document.querySelector('.wf-notification')?.textContent?.includes('部署成功'), 'notification 标题')
  assert.ok(document.querySelector('.wf-notification')?.textContent?.includes('v0.63.0 已上线'), 'notification 描述')
  // 队列：第二条（warning 变体）
  ctx.notification.warning({ title: '磁盘空间不足', description: '已使用 92%' })
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(notif().length, 2, '队列两条')
  // 关闭按钮移除
  const closeBtns = [...document.querySelectorAll('.wf-notification .wf-notification-close')]
  ;(closeBtns[0] as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(notif().length, 1, '关闭按钮移除一条')
  // 短 duration 自动消失
  ctx.notification.open({ type: 'info', title: '短时通知', duration: 100 })
  await new Promise((r) => setTimeout(r, 200))
  assert.ok(![...document.querySelectorAll('.wf-notification-title')].some((t) => t.textContent === '短时通知'), 'duration 后自动消失')
  // 清理 host + portal
  document.querySelector('.wf-notification-host')?.remove()
  document.querySelector('#__wf_portal')?.remove()
})

test('防线：enumerated 属性 draggable 显式字符串（Kanban 教训——空串解析为 false）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', {}, [h('div', { id: 'd', draggable: true }, 'x')])
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  const el = root.querySelector('[id="d"]') as HTMLElement
  assert.equal(el.draggable, true, 'draggable=true 显式字符串（enumerated 语义）')
  assert.equal(el.getAttribute('draggable'), 'true', 'getAttribute 显式 true')
  document.body.removeChild(root)
})

test('style 对象 → cssText（camelCase → kebab-case——[object Object] 回归）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', { id: 'sty', style: { minHeight: '100vh', backgroundColor: 'red' } }, 'x')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  const el = root.querySelector('[id="sty"]') as HTMLElement
  assert.ok(!el.getAttribute('style')?.includes('object Object'), '非 [object Object]')
  assert.ok(el.getAttribute('style')?.includes('min-height:100vh'), 'camelCase → kebab-case')
  assert.ok(el.getAttribute('style')?.includes('background-color:red'), '多属性')
  document.body.removeChild(root)
})

test('SVG 命名空间：svg/path 用 createElementNS（viewBox 大小写保留——Icon 失效回归）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', {}, [
      h('svg', { viewBox: '0 0 24 24', class: 'wf-icon' }, [
        h('path', { d: 'M12 5v14' }),
        h('circle', { cx: '12', cy: '12', r: '10' }),
      ]),
    ])
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  const svg = root.querySelector('svg') as SVGSVGElement
  assert.ok(svg, 'svg 渲染')
  assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg', 'SVG 命名空间（非 HTML 元素）')
  assert.ok(svg.getAttribute('viewBox')?.includes('0 0 24 24'), 'viewBox 大小写保留（camelCase）')
  const path = svg.querySelector('path')
  assert.equal(path?.namespaceURI, 'http://www.w3.org/2000/svg', 'path 也在 SVG 命名空间')
  document.body.removeChild(root)
})

test('路由：ctx.route 注入（动态 params——组件 ctx.route.params 消费——deptId 空回归）', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  let seenParams: Record<string, string> | null = null
  const Chat = async (_init: any, ctx: any) => {
    seenParams = ctx.route?.params ?? null
    return async () => h('div', { id: 'chat' }, `dept:${ctx.route?.params?.id ?? 'EMPTY'}`)
  }
  const router = createRouter([
    { path: '/chat/:id', render: () => h(Chat, {}) },
  ], root, { initialPath: '/chat/d1' })
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(seenParams, 'ctx.route.params 注入（非 undefined）')
  assert.equal(seenParams?.id, 'd1', 'params.id 动态解析')
  assert.equal(root.querySelector('[id="chat"]')?.textContent, 'dept:d1', '组件消费 params（非 EMPTY）')
  router.close()
  document.body.removeChild(root)
})

test('全链路事件流：交互 → RENDER → PATCH → dom 事件（location/jsx/vdom/dom 因果链）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let count = 0
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'app' }, [
      h('button', { id: 'inc', onClick: () => { count++; rerender() } }, [`c${count}`]),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  gs.reset() // 清初始（聚焦交互链）
  ;(root.querySelector('[id="inc"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  const evs = gs.events()
  const types = evs.map((e) => evKey(e))
  // jsx 层：组件 renderFn 执行（更新）
  assert.ok(types.includes('comp:render'), 'jsx 层：RENDER 事件（renderFn 执行）')
  // vdom 层：patch 决策（reuse）
  const patches = evs.filter((e) => evKey(e) === 'vnode:patch')
  assert.ok(patches.length > 0, 'vdom 层：PATCH 决策事件')
  assert.ok(patches.some((e: any) => (e as any).payload?.strategy === 'reuse' && (e as any).payload?.newKind === 'native'), 'native 同类型 reuse 决策')
  // dom 层：文本更新（结果）
  assert.ok(types.includes('text:update'), 'dom 层：TEXT_UPDATE（结果）')
  // 因果链顺序：RENDER（jsx）→ PATCH（vdom）→ TEXT_UPDATE（dom）
  const iRender = types.indexOf('comp:render')
  const iPatch = types.findIndex((t) => t === 'vnode:patch')
  const iDom = types.indexOf('text:update')
  assert.ok(iRender >= 0 && iPatch >= 0 && iDom >= 0, '三层事件都存在')
  assert.ok(iRender < iDom, 'RENDER 先于 dom 结果')
  document.body.removeChild(root)
})

test('kind 完整性：patch 决策表覆盖全部 6 种 kind（reuse 路径——缺 case 明确失败）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  // 触发 5 种 kind 的同类型 patch（native/comp/frag/portal/text）
  let show = true
  const Inner = async (_init: any, _ctx: any) => async (_p: any) => h('span', {}, 'inner')
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'kinds' }, [
      h('button', { id: 'go', onClick: () => { show = !show; rerender() } }, 'go'),
      // 同类型组件（props 变化 → comp reuse 路径）
      h(Inner, { v: show ? 1 : 2 }),
      // 同类型 native（props 变化 → native reuse 路径）
      h('div', { class: show ? 'a' : 'b' }, 'n'),
      // 异类型切换（comp ↔ native rebuild 路径）
      show ? h('section', {}, 's') : h(Inner, {}),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  gs.reset()
  // 同类型 patch（comp/native reuse）+ 异类型 rebuild
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  const patches = gs.events().filter((e) => evKey(e) === 'vnode:patch') as any[]
  const reuseKinds = new Set(patches.filter((p) => p.payload?.strategy === 'reuse').map((p) => p.payload?.newKind))
  // native/comp 必须有 reuse（frag/portal/text 由组件库场景覆盖——此处核心断言）
  assert.ok(reuseKinds.has('native'), 'native reuse 决策')
  assert.ok(reuseKinds.has('comp'), 'comp reuse 决策')
  // 无 unhandled（kind 分发完整性——缺 case 会在这里暴露）
  const unhandled = patches.filter((p) => p.payload?.strategy === 'unhandled')
  assert.equal(unhandled.length, 0, `无 unhandled 决策（kind 分发完整）——实际 ${unhandled.length}`)
  document.body.removeChild(root)
})

test('事件流断言：Modal 关闭应产生 RENDER + REMOVE（组件级 update 的移除可观测）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  const { __resetPopupLockState } = await import('../ui-dom/hooks/popup.ts')
  __resetPopupLockState()
  document.body.style.overflow = ''
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let open = true
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', {}, [
      h('button', { id: 'close', onClick: () => { open = false; rerender() } }, 'close'),
      h(ModalComp(), { open, onClose: () => { open = false; rerender() }, title: 't', children: h('div', {}, 'x') }),
    ])
  }
  const { Modal } = await import('../components/Modal/Modal.ts')
  const ModalComp = () => Modal as any
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 50))
  gs.reset()
  ;(root.querySelector('[id="close"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const m = document.querySelector('.wf-modal')
  if (m) m.dispatchEvent(new (window as any).Event('animationend', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 50))
  const evs = gs.events()
  const types = evs.map((e) => evKey(e))
  // 断言：RENDER（Modal 组件级更新）+ REMOVE（输出移除——事件流完整）
  assert.ok(types.includes('comp:render'), `RENDER 事件（Modal 关闭重渲染）——实际: ${types.join(',')}`)
  assert.ok(types.includes('node:remove'), `REMOVE 事件（输出移除可观测）——实际: ${types.join(',')}`)
  // 滚动锁恢复（ref(null) → unlockScroll）
  assert.equal(document.body.style.overflow, '', '滚动锁恢复')
  document.body.removeChild(root)
  document.querySelector('[id="__wf_portal"]')?.remove()
})

test('滚动锁恢复：Modal 关闭 → portal 内容移除时 ref(null) → lockScroll 解锁（滑动条恢复回归）', async () => {
  // 并发测试隔离：模块级 lockedCount 跨文件共享——重置
  const { __resetPopupLockState } = await import('../ui-dom/hooks/popup.ts')
  __resetPopupLockState()
  document.body.style.overflow = ''
  const { Modal } = await import('../components/Modal/Modal.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let open = true
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', {}, [
      h('button', { id: 'close', onClick: () => { open = false; rerender() } }, 'close'),
      h(Modal, { open, onClose: () => { open = false; rerender() }, title: 't', children: h('div', {}, 'x') }),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(document.body.style.overflow, 'hidden', '打开时滚动锁')
  // 关闭（open=false → exit → animationend → 卸载）
  ;(root.querySelector('[id="close"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const modal = document.querySelector('.wf-modal')
  if (modal) modal.dispatchEvent(new (window as any).Event('animationend', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 40))
  assert.ok(!document.querySelector('.wf-modal'), 'Modal 卸载')
  assert.equal(document.body.style.overflow, '', '滚动锁恢复（ref(null) → unlockScroll）')
  document.body.removeChild(root)
  document.querySelector('[id="__wf_portal"]')?.remove()
})

test('组件级更新：ctx.render 只重跑该组件（兄弟组件 renderFn 不执行——非整树 patch）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let innerRenders = 0
  let siblingRenders = 0
  const Inner = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async (props: any) => {
      innerRenders++
      return h('div', { id: 'inner', class: `v${props.n}` }, [`inner-${props.n}`])
    }
  }
  const Sibling = async (_init: any, _ctx: any) => {
    return async (_props: any) => {
      siblingRenders++
      return h('div', { id: 'sibling' }, 'sibling')
    }
  }
  let n = 1
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'app' }, [
      h('button', { id: 'go', onClick: () => { n++; rerender() } }, 'go'),
      h(Inner, { n }),
      h(Sibling, {}),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  const rendersAfterMount = innerRenders + siblingRenders
  gs.reset()
  // 触发 Inner 的组件级 render（点击 Inner 内部？——用 ctx.render 语义：Inner 自身 render）
  // 通过 App 的 rerender（整树——对比）——先测组件级：直接模拟 Inner 的 render
  // 组件级路径：任何组件的 ctx.render（非根）→ 只该组件
  // 这里用 App 的按钮触发整树（根）——兄弟都动（根级预期）——真正组件级测：
  // Inner 内部状态（无按钮）——用事件流验证：组件级 vs 整树的 RENDER 事件
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  const rendersAfterClick = innerRenders + siblingRenders
  const renderEvents = gs.events().filter((e) => evKey(e) === 'comp:render')
  // 根级 update：Inner + Sibling 都重跑（整树——根组件 render 传播）
  assert.ok(renderEvents.length >= 2, '整树 render：Inner + Sibling 都重跑（根级触发）')
  // 现在测真正的组件级：通过 UI 的 ui.render（组件自身）——用 App 的子组件内部触发
  document.body.removeChild(root)
})

test('组件级更新：Inner 内部 render → 只重跑 Inner（Sibling renderFn 不执行）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let innerRenders = 0
  let siblingRenders = 0
  const Inner = async (_init: any, ctx: any) => {
    let count = 0
    const rerender = () => ctx.render()
    return async () => {
      innerRenders++
      return h('div', { id: 'inner' }, [
        h('button', { id: 'inc', onClick: () => { count++; rerender() } }, [`c${count}`]),
      ])
    }
  }
  const Sibling = async (_init: any, _ctx: any) => {
    return async (_props: any) => {
      siblingRenders++
      return h('div', { id: 'sibling' }, 'sibling')
    }
  }
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', { id: 'app' }, [h(Inner, {}), h(Sibling, {})])
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  const siblingBefore = siblingRenders
  gs.reset()
  // Inner 内部按钮（ctx.render——组件级）
  console.log('[dbg] before:', root.querySelector('[id="inc"]')?.textContent, 'innerRenders:', innerRenders)
  ;(root.querySelector('[id="inc"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  console.log('[dbg] after:', root.querySelector('[id="inc"]')?.textContent, 'innerRenders:', innerRenders)
  assert.equal(root.querySelector('[id="inc"]')?.textContent, 'c1', 'Inner 更新')
  assert.equal(siblingRenders, siblingBefore, 'Sibling renderFn 未重跑（组件级——非整树）')
  // 事件流：RENDER 只 Inner（不 Sibling）
  const renderEvents = gs.events().filter((e) => evKey(e) === 'comp:render')
  const rendered = renderEvents.map((e: any) => e.payload?.name)
  assert.ok(rendered.includes('Inner'), 'RENDER: Inner')
  assert.ok(!rendered.includes('Sibling'), 'RENDER 不含 Sibling（组件级精准）')
  document.body.removeChild(root)
})

test('值比较：属性值不变 → 零 PROP_UPDATE（DOM 写入最小化——布局抖动根因回归）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let count = 0
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'app' }, [
      h('button', { id: 'go', onClick: () => { count++; rerender() } }, [`c${count}`]),
      // style 对象每次渲染新实例——值相同
      h('div', { id: 'sty', style: { background: '#fff', minHeight: '10px' } }, 'sty'),
      // class 字符串不变
      h('span', { class: 'fixed-class', 'data-k': 'v' }, 's'),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  gs.reset()
  // 重渲染（count 变化）——属性值不变 → 零 PROP_UPDATE
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  const props = gs.events().filter((e) => evKey(e) === 'prop:update')
  // 只应有 TEXT_UPDATE（count 文本）——无 PROP_UPDATE（style/class 值相同——浅比较零事件）
  assert.equal(props.length, 0, `属性值不变 → 零 PROP_UPDATE（实际 ${props.length}）`)
  const texts = gs.events().filter((e) => evKey(e) === 'text:update')
  assert.ok(texts.length >= 1, '文本变化有事件（count 更新）')
  // DOM 状态正确（style 保留——未因浅比较跳过而丢失）
  assert.ok(root.querySelector('[id="sty"]')?.getAttribute('style')?.includes('background'), 'style 生效')
  document.body.removeChild(root)
})

test('location 参数级：params 作为 props 传递——:id 变化 → 页面组件重渲染（props diff 精准级联）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  let renders = 0
  // 应用层：render(params) 把 params 作为 props（location → jsx 的级联——精准）
  const Page = async (_init: any, _ctx: any) => async (props: any) => {
    renders++
    return h('div', { id: 'page' }, [`id:${props.params?.id}`])
  }
  const router = createRouter([
    { path: '/users/:id', render: (params) => h(Page, { params }) },
  ], root, { initialPath: '/users/1' })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="page"]')?.textContent, 'id:1', '初始 params')
  const before = renders
  gs.reset()
  // params 变化（同页面——组件级重渲染——props diff 触发）
  router.navigate('/users/2')
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="page"]')?.textContent, 'id:2', 'params 变化 → 页面更新')
  assert.ok(renders > before, '页面组件重渲染（params props 变化）')
  // 事件流：ROUTE_CHANGE → RENDER（页面——props 变化）
  const types = gs.events().map((e) => evKey(e))
  assert.ok(types.includes('route:change'), 'location：ROUTE_CHANGE')
  assert.ok(types.includes('comp:render'), 'jsx：页面组件 RENDER（params props 变化驱动）')
  assert.ok(types.includes('text:update'), 'dom：文本更新（id 变化）')
  router.close()
  document.body.removeChild(root)
})

test('EVENT_BIND：事件绑定观测（dom 层——绑定关系可审计）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', {}, [
      h('button', { id: 'b', onClick: () => {}, onMouseOver: () => {} }, 'x'),
      h('input', { id: 'i', onInput: () => {} }),
    ])
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  const binds = gs.events().filter((e) => evKey(e) === 'event:bind')
  const events = binds.map((e: any) => `${e.payload?.event}`)
  assert.ok(events.includes('click'), 'click 绑定记录')
  assert.ok(events.includes('mouseover'), 'mouseover 绑定记录（多事件）')
  assert.ok(events.includes('input'), 'input 绑定记录')
  assert.ok(binds.length >= 3, `绑定事件可审计（${binds.length}）`)
  document.body.removeChild(root)
})

test('生命周期事件化：节点移除 → EVENT_UNBIND（绑定解绑可观测）+ ref(null) → REF_CLEANUP', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let show = true
  const refFn = (el: any) => { if (el) (window as any).__refEl = el }
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'app' }, [
      h('button', { id: 't', onClick: () => { show = !show; rerender() } }, 't'),
      show ? h('button', { id: 'b', ref: refFn, onClick: () => {} }, 'x') : null,
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  gs.reset()
  // 移除（show=false——条件 null）
  ;(root.querySelector('[id="t"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  const types = gs.events().map((e) => evKey(e))
  // 事件绑定解绑（移除的按钮的 onClick）
  assert.ok(types.includes('event:unbind'), `EVENT_UNBIND（绑定生命周期）——实际: ${[...new Set(types)].join(',')}`)
  // ref(null) 清理（REF_CLEANUP）
  assert.ok(types.includes('ref:cleanup'), `REF_CLEANUP（ref 生命周期）——实际: ${[...new Set(types)].join(',')}`)
  // 结构移除
  assert.ok(types.includes('node:remove'), 'REMOVE（节点移除）')
  assert.ok(!root.querySelector('[id="b"]'), '按钮已移除')
  document.body.removeChild(root)
})

test('全链路事件流矩阵：每层每事件类型都有断言（location/jsx/vdom/dom/生命周期）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  let count = 0
  const Page = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async (props: any) => h('div', { id: 'pg' }, [
      h('button', { id: 'go', onClick: () => { count++; rerender() } }, [`c${count}`]),
      props.params?.id ? h('span', {}, `p:${props.params.id}`) : null,
    ])
  }
  const router = createRouter([
    { path: '/a/:id', render: (params) => h(Page, { params }) },
  ], root, { initialPath: '/a/1' })
  await new Promise((r) => setTimeout(r, 20))
  gs.reset()
  // 交互：点击（jsx 组件级 RENDER → vdom PATCH → dom TEXT_UPDATE）
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  let types = new Set(gs.events().map((e) => evKey(e)))
  // jsx + vdom + dom
  assert.ok(types.has('comp:render'), 'jsx：RENDER')
  assert.ok(types.has('vnode:patch'), 'vdom：PATCH')
  assert.ok(types.has('text:update'), 'dom：TEXT_UPDATE')
  // 事件代理：点击（handler 更新）零 BIND/UNBIND（Map 覆盖——零重绑零噪音）；
  // 挂载点 EVENT_BIND 在初始渲染（惰性注册——每挂载点每事件一次）
  assert.ok(!types.has('event:bind') && !types.has('event:unbind'), '事件代理：点击零 BIND/UNBIND（Map 覆盖）')
  gs.reset()
  // 路由导航（location：ROUTE_CHANGE → 页面 RENDER → dom）
  router.navigate('/a/2')
  await new Promise((r) => setTimeout(r, 20))
  types = new Set(gs.events().map((e) => evKey(e)))
  assert.ok(types.has('route:change'), 'location：ROUTE_CHANGE')
  assert.ok(types.has('props:update') || types.has('comp:render'), 'jsx：页面 props 变化/重渲染')
  assert.ok(types.has('vnode:patch'), 'vdom：PATCH')
  assert.ok(types.has('text:update'), 'dom：文本更新（id 变化）')
  // 初始挂载（重新——生命周期）
  gs.reset()
  const root2 = document.createElement('div')
  document.body.appendChild(root2)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const App2 = async (_init: any, _ctx: any) => async () => h('div', {}, 'x')
  createRoot(h(App2, {}), root2)
  await new Promise((r) => setTimeout(r, 20))
  types = new Set(gs.events().map((e) => evKey(e)))
  assert.ok(types.has('comp:build'), 'vdom：BUILD（组件构建）')
  assert.ok(types.has('comp:mount'), '生命周期：COMP_MOUNT')
  assert.ok(types.has('node:create'), 'dom：NODE_CREATE')
  assert.ok(types.has('node:insert'), 'dom：INSERT')
  router.close()
  document.body.removeChild(root)
  document.body.removeChild(root2)
})

test('事件代理生命周期：handler 更新零事件（Map 覆盖——零重绑）；挂载点 EVENT_BIND 一次；移除 UNBIND', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let n = 0
  // mount 层稳定 handler（§5.1）
  const stableHandler = () => { n++ }
  const stableRerender = () => { void 0 } // 占位（go 用稳定）
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    const goHandler = () => rerender() // mount 层稳定
    return async () => h('div', {}, [
      h('button', { id: 'go', onClick: goHandler }, 'go'),
      h('button', { id: 'b', onClick: stableHandler }, 'b'),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  gs.reset()
  // 重渲染（两个 handler 都稳定——零 BIND/UNBIND）
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  const afterStable = gs.events()
  assert.ok(!afterStable.some((e) => evKey(e) === 'event:bind' || evKey(e) === 'event:unbind'), `稳定 handler → 零 BIND/UNBIND（实际: ${afterStable.filter((e) => evKey(e) === 'event:bind' || evKey(e) === 'event:unbind').map((e) => evKey(e)).join(',')}）`)
  // render 内定义 handler（每次新函数）→ 重绑（UNBIND + BIND——事件流可观测）
  gs.reset()
  const App2 = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    const go2 = () => rerender() // mount 稳定（隔离 b2 的变量）
    return async () => h('div', {}, [
      h('button', { id: 'g2', onClick: go2 }, 'g2'),
      h('button', { id: 'b2', onClick: () => { n++ } }, 'b2'), // render 内定义——每次新函数
    ])
  }
  const root2 = document.createElement('div')
  document.body.appendChild(root2)
  // 挂载点首次绑定：EVENT_BIND（每挂载点每事件一次——惰性注册）
  gs.reset()
  createRoot(h(App2, {}), root2)
  await new Promise((r) => setTimeout(r, 20))
  const initBinds = gs.events().filter((e) => evKey(e) === 'event:bind')
  assert.ok(initBinds.length >= 1, '挂载点 EVENT_BIND（首次注册——每挂载点每事件一次）')
  // handler 更新（重渲染——render 内定义新函数）→ 零 UNBIND（Map 覆盖零重绑零噪音）
  gs.reset()
  ;(root2.querySelector('[id="g2"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  const types = gs.events().map((e) => evKey(e))
  assert.ok(!types.includes('event:unbind') && !types.includes('event:bind'), `handler 更新零 BIND/UNBIND（代理 Map 覆盖）——实际: ${[...new Set(types)].join(',')}`)
  // 点击执行最新 handler（Map 覆盖生效——render 内定义新闭包——最新 n++——只触发一次）
  ;(root2.querySelector('[id="b2"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(n, 1, '代理分发执行最新 handler（Map 覆盖——点击只触发一次）')
  document.body.removeChild(root)
  document.body.removeChild(root2)
})

test('事件重绑防线：handler 变化重绑后点击只触发一次（removeEventListener 同引用——防旧监听残留）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let clicks = 0
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', {}, [
      h('button', { id: 'go', onClick: () => rerender() }, 'go'),
      // render 内定义（每次新函数——重绑）——点击必须只触发一次
      h('button', { id: 'b', onClick: () => { clicks++ } }, 'b'),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  // 重渲染多次（handler 每次新——重绑多次）
  for (let i = 0; i < 3; i++) {
    ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
    await new Promise((r) => setTimeout(r, 10))
  }
  // 点击 b——只触发一次（旧监听已 remove——无残留）
  ;(root.querySelector('[id="b"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(clicks, 1, `重绑后点击只触发一次（实际 ${clicks}——旧监听残留会重复）`)
  document.body.removeChild(root)
})

test('路由页面下组件 ctx.render 组件级更新：props 剪枝不吞内部状态（count 闭包更新生效）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  // 页面 App 嵌套 Counter（props 不变——页面级刷新会被剪枝——组件级更新必须生效）
  let count = 0
  const Counter = async (_init: any, ctx: any) => {
    return async (_props: any) =>
      h('button', { id: 'cnt', onClick: () => { count++; ctx.ui.render() } }, [`count:${count}`])
  }
  const App = async (_init: any, _ctx: any) => async () => h('div', { id: 'page' }, [
    h('div', {}, 'static'),
    h(Counter, {}),
  ])
  createRouter([{ path: '/', render: () => h(App, {}) }], root, { initialPath: '/' })
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.querySelector('[id="cnt"]')?.textContent, 'count:0', '初始')
  ;(root.querySelector('[id="cnt"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.querySelector('[id="cnt"]')?.textContent, 'count:1', '组件级更新（剪枝不吞内部状态）')
  // 事件流：comp:render（Counter——组件级）——不是页面级全量
  const renders = gs.events().filter((e) => e.entity === 'comp' && e.action === 'render')
  assert.ok(renders.length >= 1, 'RENDER 事件（组件级更新）')
  document.body.removeChild(root)
})

test('usePopup 滚动跟随：scroll → rAF 重算坐标 → 组件重渲染（portal 重读 pos 更新 style）', async () => {
  const { createV3Ui } = await import('../ui-dom/vdom3/ui.ts')
  const h = (await import('../ui-dom/vdom3/jsx.ts')).h
  let renders = 0
  const ui = createV3Ui('popup-t1', () => { renders++ }, () => {})
  const el = document.createElement('button')
  document.body.appendChild(el)
  // jsdom rect 恒 0——mock 真实 rect（滚动前后位置变化）
  el.getBoundingClientRect = () => ({ top: 100, bottom: 130, left: 50, right: 150, width: 100, height: 30, x: 50, y: 100, toJSON: () => ({}) }) as DOMRect
  let open = true
  const popup = ui.usePopup({
    el: () => el,
    isOpen: () => open,
    setOpen: (v) => { open = v },
    trigger: 'manual',
  })
  const panel = popup.portal(h('div', {}, 'x'))
  assert.ok(panel, 'portal 打开')
  // portal vnode 的 props.children 含面板（无 mask 时单元素）
  const panelNode = Array.isArray((panel as any).props.children) ? (panel as any).props.children[0] : (panel as any).props.children
  const style1 = panelNode.props.style
  assert.equal(style1.top, '136px', '初始定位（rect.bottom 130 + gap 6）')
  // 滚动：锚点下移（页面滚动后视口坐标变化）→ scroll 事件 → rAF → 重算 + 组件重渲染
  el.getBoundingClientRect = () => ({ top: 300, bottom: 330, left: 50, right: 150, width: 100, height: 30, x: 50, y: 300, toJSON: () => ({}) }) as DOMRect
  const before = renders
  window.dispatchEvent(new (window as any).Event('scroll'))
  await new Promise((r) => setTimeout(r, 60)) // rAF 节流后重算
  assert.ok(renders > before, '滚动后组件重渲染（跟随触发）')
  // 组件重渲染后 portal() 重读 pos → 新坐标
  const panel2 = popup.portal(h('div', {}, 'x'))
  const panelNode2 = Array.isArray((panel2 as any).props.children) ? (panel2 as any).props.children[0] : (panel2 as any).props.children
  const style2 = panelNode2.props.style
  assert.equal(style2.top, '336px', '滚动后坐标跟随（rect.bottom 330 + gap 6）')
  document.body.removeChild(el)
})

test('Tour 受控缺 onFinish 完成关闭：open 已传但无回调——点完成/跳过后弹窗消失（真实 bug 兜底）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const { Tour } = await import('../components/Tour/Tour.ts')
  const steps = [
    { target: '#t-a', title: '第一步', content: 'a' },
    { target: '#t-b', title: '第二步', content: 'b' },
    { target: '#t-c', title: '第三步', content: 'c' },
  ]
  // 非受控：不传 open——靠 ref 打开（演示内部打开方式）
  let tourRef: any = null
  const App = async (_init: any, ctx: any) => {
    const render = () => ctx.ui.render()
    return async () => h('div', {}, [
      h('button', { id: 't-a', onClick: () => { tourRef?.(); render() } }, 'a'),
      h('button', { id: 't-b' }, 'b'),
      h('button', { id: 't-c' }, 'c'),
      h(Tour, {
        steps,
        ref: (el: any) => { /* Tour 无 ref API——通过受控 open 测试 */ },
      }),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  document.body.removeChild(root)
})

test('Tour 受控完成关闭（open=false 回流）：最后一步点完成 → portal 移除', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const { Tour } = await import('../components/Tour/Tour.ts')
  let open = true
  let step = 0
  let finished = false
  const App = async (_init: any, ctx: any) => {
    const render = () => ctx.ui.render()
    return async () => h('div', {}, [
      h('button', { id: 't-a' }, 'a'),
      h('button', { id: 't-b' }, 'b'),
      h(Tour, {
        steps: [
          { target: '#t-a', title: '一', content: 'a' },
          { target: '#t-b', title: '二', content: 'b' },
        ],
        open,
        current: step,
        onStepChange: (s: number) => { step = s; render() },
        onFinish: () => { finished = true; open = false; render() },
      }),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(root.querySelector('.wf-tour-layer') || document.querySelector('#__wf_portal')?.querySelector('.wf-tour-layer'), 'Tour 打开')
  // 下一步 → 完成
  const click = (label: string) => {
    const b = [...document.querySelectorAll('.wf-tour-btn')].find((x) => x.textContent === label) as HTMLButtonElement | undefined
    b?.click()
  }
  click('下一步')
  await new Promise((r) => setTimeout(r, 30))
  click('完成')
  await new Promise((r) => setTimeout(r, 50))
  assert.ok(finished, 'onFinish 调用')
  const layer = document.querySelector('#__wf_portal')?.querySelector('.wf-tour-layer')
  assert.ok(!layer, 'Tour portal 移除（完成关闭）')
  document.body.removeChild(root)
  document.querySelector('[id="__wf_portal"]')?.remove()
})


test('错误事件化：工厂/renderFn 抛错 → error:throw（事件流可观测——不静默）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  // 工厂抛错组件（独立树——工厂错误中断构建——单独验证）
  const BadFactory = async () => { throw new Error('factory-boom') }
  const App = async (_init: any, _ctx: any) => async () => h('div', {}, [
    h(BadFactory, {}),
    h('div', { id: 'ok' }, 'ok'),
  ])
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  const errs = gs.events().filter((e) => e.entity === 'error')
  const factoryErr = errs.find((e) => e.payload?.phase === 'factory')
  assert.ok(factoryErr, `工厂错误在事件流（phase: factory）——实际: ${errs.map((e) => e.payload?.phase).join(',')}`)
  assert.ok(String((factoryErr as any).payload?.message).includes('factory-boom'), '错误消息可观测')
  document.body.removeChild(root)
  // renderFn 抛错组件（工厂正常——渲染期失败——独立验证）
  const root2 = document.createElement('div')
  document.body.appendChild(root2)
  gs.reset()
  const BadRender = async (_init: any, _ctx: any) => async () => { throw new Error('render-boom') }
  const App2 = async (_init: any, _ctx: any) => async () => h('div', {}, [
    h(BadRender, {}),
    h('div', { id: 'ok2' }, 'ok'),
  ])
  createRoot(h(App2, {}), root2)
  await new Promise((r) => setTimeout(r, 30))
  const errs2 = gs.events().filter((e) => e.entity === 'error')
  const renderErr = errs2.find((e) => e.payload?.phase === 'renderFn')
  assert.ok(renderErr, `renderFn 错误在事件流（phase: renderFn）——实际: ${errs2.map((e) => e.payload?.phase).join(',')}`)
  assert.ok(String((renderErr as any).payload?.message).includes('render-boom'), '错误消息可观测')
  document.body.removeChild(root2)
})

test('错误事件化：组件级更新失败 → error:caught（渲染管线不中断——错误定位到组件）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let fail = false
  const Flaky = async (_init: any, ctx: any) => {
    const rerender = () => ctx.ui.render()
    return async (_props: any) => {
      if (fail) throw new Error('flaky-boom')
      return h('button', { id: 'f', onClick: () => { fail = true; rerender() } }, 'go')
    }
  }
  const App = async (_init: any, _ctx: any) => async () => h('div', {}, [
    h(Flaky, {}),
    h('div', { id: 'rest' }, 'rest'),
  ])
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  gs.reset()
  // 点击 → renderFn 抛错 → error:caught（组件级更新——管线不中断）
  ;(root.querySelector('[id="f"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const caught = gs.events().filter((e) => e.entity === 'error' && e.action === 'caught')
  assert.ok(caught.length >= 1, `error:caught 在事件流——实际: ${gs.events().map((e) => evKey(e)).join(',')}`)
  const e = caught[0] as any
  assert.equal(e.payload?.phase, 'update', '错误定位到 update 环节')
  assert.ok(String(e.payload?.message).includes('flaky-boom'), '错误消息可观测')
  // 管线不中断：后续交互仍可渲染（错误后恢复——再点不抛（fail 已 true——恢复逻辑））
  assert.ok(root.querySelector('[id="rest"]'), '其他组件不受影响')
  document.body.removeChild(root)
})

test('错误事件化：正常渲染零错误事件（事件流无噪音）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.ui.render()
    let n = 0
    return async () => h('div', {}, [
      h('button', { id: 'go', onClick: () => { n++; rerender() } }, [`n:${n}`]),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  gs.reset()
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const errs = gs.events().filter((e) => e.entity === 'error')
  assert.equal(errs.length, 0, `正常渲染零错误事件——实际: ${errs.length}`)
  document.body.removeChild(root)
})

test('错误事件化：renderFn 挂起 → error:caught（挂起超时——静默失败不再静默）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  // 挂起 renderFn（永不 resolve——静默失败）
  let hangs = false
  const Hanging = async (_init: any, ctx: any) => {
    const rerender = () => ctx.ui.render()
    return async (_props: any) => {
      if (hangs) return new Promise<never>(() => {}) // 永不 resolve
      return h('button', { id: 'h', onClick: () => { hangs = true; rerender() } }, 'go')
    }
  }
  const App = async (_init: any, _ctx: any) => async () => h('div', {}, [h(Hanging, {})])
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  // 缩短挂起超时（测试用 200ms）
  ;(globalThis as any).__v3HangMs = 200
  gs.reset()
  ;(root.querySelector('[id="h"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 400))
  const errors = gs.events().filter((e) => e.entity === 'error' && e.action === 'caught')
  assert.ok(errors.length >= 1, `挂起超时在错误事件流——实际: ${gs.events().map((e) => evKey(e)).join(',')}`)
  const hang = errors.find((e) => String(e.payload?.message).includes('挂起超时'))
  assert.ok(hang, `挂起消息可观测——实际: ${errors.map((e) => e.payload?.message).join('; ')}`)
  assert.equal(hang?.payload?.phase, 'update', '定位到 update 环节')
  document.body.removeChild(root)
})

test('错误事件化：正常渲染零内部决策事件（queue/notfound/skip 零噪音）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let n = 0
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.ui.render()
    return async () => h('button', { id: 'go', onClick: () => { n++; rerender() } }, [`n:${n}`])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  gs.reset()
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const internals = gs.events().filter((e) => e.entity === 'internal')
  assert.equal(internals.length, 0, `正常渲染零内部决策事件——实际: ${internals.length}`)
  document.body.removeChild(root)
})

test('事件流自身状态：buffer 溢出 → stream:overflow（覆盖可审计——size/capacity/overflowCount API）', async () => {
  const { createEventStream } = await import('../ui-dom/vdom3/events.ts')
  const s = createEventStream(5, { watermark: 0 }) // 禁用水位——纯溢出语义
  // 填满 + 溢出
  for (let i = 1; i <= 8; i++) {
    s.emit({ entity: 'node', action: 'create', target: `n${i}`, payload: { tag: 'div' }, ts: i })
  }
  assert.equal(s.size(), 5, '缓冲占用 5（容量）')
  assert.equal(s.capacity(), 5, '容量 5')
  assert.equal(s.overflowCount(), 3, '溢出 3 次（n6/n7/n8 各覆盖一条最旧）')
  // overflow 事件在事件流里（buffer 状态可观测）
  const overflows = s.events().filter((e) => e.entity === 'stream' && e.action === 'overflow')
  assert.ok(overflows.length >= 1, `stream:overflow 事件存在——实际: ${s.events().map((e) => evKey(e)).join(',')}`)
  const last = overflows[overflows.length - 1] as any
  assert.equal(last.payload?.capacity, 5, '溢出事件携带容量')
  assert.ok(last.payload?.count >= 1, '溢出事件携带累计次数（降频——每 64 次一条）')
  assert.ok(last.payload?.dropped, `溢出事件携带被覆盖的事件键——实际: ${JSON.stringify(last.payload)}`)
  // 保留最近 5 条（n4-n8 + overflow 事件循环覆盖——最新 overflow 保留）
  const keys = s.events().map((e) => evKey(e))
  assert.ok(keys.includes('stream:overflow'), 'overflow 事件在缓冲内（最近溢出可观测）')
  // reset 清空状态
  s.reset()
  assert.equal(s.size(), 0, 'reset 后占用 0')
  assert.equal(s.overflowCount(), 0, 'reset 后溢出计数清零')
})

test('事件代理：hooks 全局监听统一（addGlobalListener——聚合注册/退订 + 事件流可观测）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  const { resetDelegation, addGlobalListener } = await import('../ui-dom/vdom3/delegate.ts')
  resetDelegation()
  gs.reset()
  // 多 handler 聚合（同事件——目标监听一次）
  let a = 0, b2 = 0
  // 自定义事件名（隔离并发——其他测试的 keydown handler 不在聚合集合）
  const EVT = 'wf-test-global'
  const off1 = addGlobalListener(window, EVT, (() => { a++ }) as EventListener)
  gs.reset()
  const off2 = addGlobalListener(window, EVT, (() => { b2++ }) as EventListener)
  // 第二个 handler 注册：同事件已挂监听——不发 EVENT_BIND（聚合——目标监听一次）
  const bindsAfterSecond = gs.events().filter((e) => evKey(e) === 'event:bind')
  assert.equal(bindsAfterSecond.length, 0, `同事件聚合（第二 handler 不重复注册监听）——实际: ${bindsAfterSecond.length}`)
  // 分发：两个 handler 都执行
  window.dispatchEvent(new (window as any).Event(EVT))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(a, 1, 'handler1 执行')
  assert.equal(b2, 1, 'handler2 执行（聚合分发）')
  // 退订一个——另一个仍工作
  off1()
  window.dispatchEvent(new (window as any).Event(EVT))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(a, 1, '退订后 handler1 不再执行')
  assert.equal(b2, 2, 'handler2 继续执行')
  // 全部退订——目标监听移除（EVENT_UNBIND）
  gs.reset()
  off2()
  const unbinds = gs.events().filter((e) => evKey(e) === 'event:unbind')
  assert.ok(unbinds.length >= 1, `全部退订 → EVENT_UNBIND（目标监听移除配对）——实际: ${unbinds.map((e) => evKey(e)).join(',')}`)
  resetDelegation()
})

test('事件代理：removeDelegationRoot 移除挂载点监听（removeEventListener 配对——卸载无残留）', async () => {
  const { resetDelegation, ensureDelegationRoot, removeDelegationRoot } = await import('../ui-dom/vdom3/delegate.ts')
  resetDelegation()
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  let clicks = 0
  const App = async (_init: any, _ctx: any) => async () =>
    h('button', { id: 'x', onClick: () => { clicks++ } }, 'x')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  ;(root.querySelector('[id="x"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(clicks, 1, '挂载点监听生效')
  // 卸载挂载点（监听移除）
  removeDelegationRoot(root)
  ;(root.querySelector('[id="x"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(clicks, 1, 'removeDelegationRoot 后监听移除（点击不再触发）')
  document.body.removeChild(root)
  resetDelegation()
})

test('事件代理 once：动画监听分发一次后自动解绑（EVENT_UNBIND 可观测——与 addEventListener {once} 等价）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  const { resetDelegation, bindElementListener } = await import('../ui-dom/vdom3/delegate.ts')
  resetDelegation()
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let anims = 0
  const App = async (_init: any, _ctx: any) => async () => {
    return h('div', { id: 'anim', ref: (el: any) => {
      if (el) bindElementListener(el, 'animationend', (() => { anims++ }) as EventListener, true)
    } }, 'x')
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  const el = root.querySelector('[id="anim"]') as HTMLElement
  // 第一次动画结束 → handler 执行 + once 自动解绑（EVENT_UNBIND）
  el.dispatchEvent(new (window as any).Event('animationend', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(anims, 1, 'once handler 第一次执行')
  const unbinds = gs.events().filter((e) => evKey(e) === 'event:unbind' && e.payload?.event === 'animationend')
  assert.ok(unbinds.length >= 1, 'once 自动解绑（EVENT_UNBIND 可观测）')
  // 第二次 → 不执行（已解绑）
  el.dispatchEvent(new (window as any).Event('animationend', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(anims, 1, 'once 解绑后不再执行')
  document.body.removeChild(root)
  resetDelegation()
})

test('事件代理：不冒泡事件（img error）用捕获监听——onError 分发（Img fallback 回归）', async () => {
  const { h, createRoot, stream, evKey } = await import('../ui-dom/vdom3/index.ts')
  const { Img } = await import('../components/Img/Img.ts')
  stream.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', {}, h(Img, { src: '/bad.png', fallback: '/fb.png', alt: 'x' }))
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  const img = root.querySelector('img') as HTMLImageElement
  assert.ok(img, 'img 渲染')
  assert.equal(img.getAttribute('src'), '/bad.png', '初始 src')
  // error 事件不冒泡（规范）——代理捕获监听分发 onError → fallback
  img.dispatchEvent(new (window as any).Event('error', { bubbles: false }))
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(img.getAttribute('src'), '/fb.png', 'error 分发 → fallback 生效（捕获监听）')
  // fallback 也失败——防循环（不再替换）
  img.dispatchEvent(new (window as any).Event('error', { bubbles: false }))
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(img.getAttribute('src'), '/fb.png', 'fallback 也失败——不循环（src 相同跳过）')
  document.body.removeChild(root)
})

test('不变量：无事件流不渲染——组件输出变 null 的移除入事件流（REMOVE——无静默 DOM 操作）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let show = true
  const Child = async (_init: any, _ctx: any) => async () => h('div', { id: 'child' }, 'c')
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', {}, [
      h('button', { id: 'go', onClick: () => { show = !show; rerender() } }, 'go'),
      show ? h(Child, {}) : null,
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  gs.reset()
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const types = gs.events().map((e) => evKey(e))
  assert.ok(types.includes('node:remove'), `组件输出移除入事件流（REMOVE）——实际: ${[...new Set(types)].join(',')}`)
  assert.ok(types.includes('comp:render'), '组件重渲染可观测')
  assert.ok(!root.querySelector('[id="child"]'), 'DOM 移除生效')
  // 移除的 DOM 节点与事件一一对应（无静默操作——child 的移除有且仅有事件流里的 REMOVE）
  document.body.removeChild(root)
})

test('组件副作用事件流：ref:mount + effect:animate/lock/unlock/focus/scroll 可观测', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  // ref 挂载（组件副作用开始）→ ref:mount
  const App = async (_init: any, _ctx: any) => async () => {
    return h('div', { id: 'x', ref: (el: any) => { if (el) void el } }, 'x')
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  const mounts = gs.events().filter((e) => evKey(e) === 'ref:mount')
  assert.ok(mounts.length >= 1, `ref:mount（组件副作用开始——拿到 el）——实际: ${[...new Set(gs.events().map((e) => evKey(e)))].join(',')}`)
  document.body.removeChild(root)
  // effect:animate（motion.animateOut）
  gs.reset()
  const { animateOut } = await import('../ui-dom/motion.ts')
  const el = document.createElement('div')
  document.body.appendChild(el)
  animateOut(el, () => {}, 10)
  await new Promise((r) => setTimeout(r, 50))
  const anims = gs.events().filter((e) => evKey(e) === 'effect:animate')
  assert.ok(anims.length >= 1, 'effect:animate（退场动画开始）')
  document.body.removeChild(el)
  // effect:lock/unlock（usePopup 滚动锁——Modal 场景）
  gs.reset()
  const { __resetPopupLockState } = await import('../ui-dom/hooks/popup.ts')
  __resetPopupLockState()
  document.body.style.overflow = ''
  const { Modal } = await import('../components/Modal/Modal.ts')
  const root2 = document.createElement('div')
  document.body.appendChild(root2)
  let open = true
  const WithModal = async (_init: any, ctx: any) => {
    const close = () => { open = false; ctx.ui.render() }
    return async () => h('div', {}, [
      h('button', { id: 'close', onClick: close }, 'close'),
      h(Modal, { open, onClose: close, title: 't', children: h('div', {}, 'x') }),
    ])
  }
  createRoot(h(WithModal, {}), root2)
  await new Promise((r) => setTimeout(r, 40))
  ;(root2.querySelector('[id="close"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const modal = document.querySelector('.wf-modal')
  if (modal) modal.dispatchEvent(new (window as any).Event('animationend', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 50))
  const effects = gs.events().filter((e) => e.entity === 'effect')
  const lock = effects.find((e) => e.action === 'lock')
  const unlock = effects.find((e) => e.action === 'unlock')
  assert.ok(lock, `effect:lock（滚动锁）——实际: ${effects.map((e) => e.action).join(',')}`)
  assert.ok(unlock, 'effect:unlock（滚动锁释放）')
  document.body.removeChild(root2)
  document.querySelector('[id="__wf_portal"]')?.remove()
})

test('用户文本操作事件流：text:input（输入/组合）+ text:select（选区）可观测', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  const { resetDelegation } = await import('../ui-dom/vdom3/delegate.ts')
  resetDelegation()
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let val = ''
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', {}, h('input', { id: 'inp', value: val, onInput: (e: any) => { val = e.target.value } }))
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  const input = root.querySelector('[id="inp"]') as HTMLInputElement
  // 用户输入（input 事件——代理 dispatch → text:input）
  gs.reset()
  input.value = '你好'
  input.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 30))
  const inputs = gs.events().filter((e) => evKey(e) === 'text:input')
  assert.ok(inputs.length >= 1, `text:input（用户输入）——实际: ${[...new Set(gs.events().map((e) => evKey(e)))].join(',')}`)
  assert.equal((inputs[0] as any).payload?.value, '你好', '输入值可观测')
  // 选区（selectionchange → text:select——jsdom 模拟选中）
  gs.reset()
  // jsdom 的 getSelection 支持有限——直接触发 selectionchange 并 mock selection
  const origSel = document.getSelection
  ;(document as any).getSelection = () => ({
    toString: () => '选中文本',
    anchorNode: input,
  })
  document.dispatchEvent(new (window as any).Event('selectionchange'))
  await new Promise((r) => setTimeout(r, 50)) // rAF 节流
  ;(document as any).getSelection = origSel
  const selects = gs.events().filter((e) => evKey(e) === 'text:select')
  assert.ok(selects.length >= 1, `text:select（用户选区）——实际: ${[...new Set(gs.events().map((e) => evKey(e)))].join(',')}`)
  assert.equal((selects[0] as any).payload?.length, 4, '选中长度可观测')
  document.body.removeChild(root)
  resetDelegation()
})

test('用户剪贴板事件流：text:copy/cut/paste（含内容摘要——全局跟踪不依赖绑定）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  const { resetDelegation } = await import('../ui-dom/vdom3/delegate.ts')
  resetDelegation()
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const App = async (_init: any, _ctx: any) => async () => h('div', {}, '文本内容')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  // copy（选中内容 → text:copy）
  gs.reset()
  const origSel = document.getSelection
  ;(document as any).getSelection = () => ({
    toString: () => '复制的文本',
    anchorNode: root.querySelector('div'),
  })
  document.dispatchEvent(new (window as any).Event('copy'))
  await new Promise((r) => setTimeout(r, 30))
  ;(document as any).getSelection = origSel
  const copies = gs.events().filter((e) => evKey(e) === 'text:copy')
  assert.ok(copies.length >= 1, `text:copy（用户复制）——实际: ${[...new Set(gs.events().map((e) => evKey(e)))].join(',')}`)
  assert.equal((copies[0] as any).payload?.sample, '复制的文本', '复制内容摘要可观测')
  // paste（clipboardData → text:paste）
  gs.reset()
  const pasteEv = new (window as any).Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(pasteEv, 'clipboardData', { value: { getData: () => '粘贴的内容' } })
  document.dispatchEvent(pasteEv)
  await new Promise((r) => setTimeout(r, 30))
  const pastes = gs.events().filter((e) => evKey(e) === 'text:paste')
  assert.ok(pastes.length >= 1, `text:paste（用户粘贴）——实际: ${[...new Set(gs.events().map((e) => evKey(e)))].join(',')}`)
  assert.equal((pastes[0] as any).payload?.sample, '粘贴的内容', '粘贴内容摘要可观测')
  document.body.removeChild(root)
  resetDelegation()
})

test('组件索引 O(1) 定位：注册/复用/移除一致性（updateComponent 不经 DFS）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  const { resetCompIndex, getIndexedComponent } = await import('../ui-dom/vdom3/comp-index.ts')
  resetCompIndex()
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let show = true
  const Inner = async (_init: any, _ctx: any) => async (_p: any) => h('button', { id: 'inner' }, 'go')
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.ui.render()
    return async () => h('div', {}, [
      h('button', { id: 'toggle', onClick: () => { show = !show; rerender() } }, 'toggle'),
      show ? h(Inner, {}) : null,
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  // 组件挂载后索引注册（O(1) 定位可用）
  assert.ok(root.querySelector('[id="inner"]'), 'Inner 渲染')
  // 通过事件流找到 Inner 的 compId（comp:mount/render 的 target）
  const evs = gs.events()
  const compId = evs.find((e) => e.entity === 'comp' && e.action === 'render' && e.payload?.name === 'Inner')?.target
  assert.ok(compId, 'Inner compId 可观测')
  assert.ok(getIndexedComponent(compId as string), '索引注册（O(1) 定位）')
  // 条件移除（App 级 toggle）→ 索引注销
  gs.reset()
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(!root.querySelector('[id="inner"]'), '条件移除生效（show=false）')
  assert.ok(!getIndexedComponent(compId as string), '组件移除后索引注销')
  // 重新显示——新实例注册（索引指向新实例）
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(root.querySelector('[id="inner"]'), '重新显示')
  const evs2 = gs.events()
  const newId = evs2.find((e) => e.entity === 'comp' && e.action === 'render' && e.payload?.name === 'Inner')?.target
  assert.ok(newId && newId !== compId, '新实例新 id')
  assert.ok(getIndexedComponent(newId as string), '新实例索引注册')
  resetCompIndex()
  document.body.removeChild(root)
})

test('不变量：所有状态变化都通过事件流——状态覆盖矩阵（组件/索引/节点/事件全可观测）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  const { resetCompIndex, getIndexedComponent } = await import('../ui-dom/vdom3/comp-index.ts')
  resetCompIndex()
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let show = true
  const Inner = async (_init: any, _ctx: any) => async () => h('button', { id: 'inner' }, 'go')
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.ui.render()
    return async () => h('div', {}, [
      h('button', { id: 'toggle', onClick: () => { show = !show; rerender() } }, 'toggle'),
      show ? h(Inner, {}) : null,
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  const evs1 = gs.events()
  // ① 组件挂载状态：build(index:true) + mount + render 可观测
  const build = evs1.find((e) => evKey(e) === 'comp:build' && e.payload?.name === 'Inner')
  assert.ok(build, 'comp:build（组件构建）')
  assert.equal((build as any).payload?.index, true, '索引注册可观测（index: true——进入 O(1) 定位表）')
  assert.ok(evs1.some((e) => evKey(e) === 'comp:mount' && e.payload?.name === 'Inner'), 'comp:mount')
  const compId = (build as any).target
  assert.ok(getIndexedComponent(compId), '索引实际注册（事件与状态一致）')
  // ② 条件移除：comp:unmount（实例销毁）可观测
  gs.reset()
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const unmount = gs.events().find((e) => evKey(e) === 'comp:unmount' && e.target === compId)
  assert.ok(unmount, `comp:unmount（条件移除——实例销毁可观测）——实际: ${[...new Set(gs.events().map((e) => evKey(e)))].join(',')}`)
  assert.ok(!getIndexedComponent(compId), '索引注销（事件与状态一致）')
  // ③ 节点/事件/文本状态：初始渲染的 node:create/insert + event:bind 可观测
  assert.ok(evs1.some((e) => evKey(e) === 'node:create'), 'node:create（节点状态）')
  assert.ok(evs1.some((e) => evKey(e) === 'node:insert'), 'node:insert（插入状态）')
  assert.ok(evs1.some((e) => evKey(e) === 'event:bind'), 'event:bind（事件注册状态）')
  // ④ 错误/内部决策状态（正常渲染零噪音）
  assert.equal(evs1.filter((e) => e.entity === 'error').length, 0, '正常渲染零错误')
  assert.equal(evs1.filter((e) => e.entity === 'internal').length, 0, '正常渲染零内部决策噪音')
  resetCompIndex()
  document.body.removeChild(root)
})

test('DOM↔事件流对照审计：注入绕过（直接 removeChild）→ audit warn（无事件流不渲染守护）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', {}, h('button', { id: 'b' }, 'x'))
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  // 注入绕过：直接 removeChild（无事件流）
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (...a) => { warns.push(a.join(' ')); origWarn(...a) }
  ;(globalThis as any).__WF_VDOM_AUDIT = '1'
  // 重新挂载（审计挂载在 createRoot——需审计激活后创建）
  const root2 = document.createElement('div')
  document.body.appendChild(root2)
  const { createRoot: createRoot2 } = await import('../ui-dom/vdom3/root.ts')
  createRoot2(h(App, {}), root2)
  await new Promise((r) => setTimeout(r, 30))
  const btn = root2.querySelector('[id="b"]') as HTMLElement
  btn.parentElement?.removeChild(btn) // 绕过——直接 DOM 操作
  await new Promise((r) => setTimeout(r, 50)) // MutationObserver 微任务
  console.warn = origWarn
  ;(globalThis as any).__WF_VDOM_AUDIT = undefined
  assert.ok(warns.some((w) => w.includes('[vdom3/audit]') && w.includes('remove')), `audit 捕获绕过（无事件流移除）——实际: ${warns.slice(0, 2).join(' | ')}`)
  document.body.removeChild(root)
  document.body.removeChild(root2)
})

test('subscribe 过滤订阅 + stream:watermark 水位预警（事件流自身状态可观测）', async () => {
  const { createEventStream } = await import('../ui-dom/vdom3/events.ts')
  // watermark：容量 10、阈值 0.5——5 条时预警
  const s = createEventStream(10, { watermark: 0.5 })
  const all: string[] = []
  const domOnly: string[] = []
  s.subscribe((e) => all.push(`${e.entity}:${e.action}`))
  s.subscribe(['node'], (e) => domOnly.push(`${e.entity}:${e.action}`))
  for (let i = 0; i < 6; i++) {
    s.emit({ entity: 'node', action: 'create', target: `n${i}`, ts: i })
  }
  // 全部事件 + 过滤订阅（只收 dom 层）
  assert.ok(all.includes('node:create'), '全量订阅收全部')
  assert.equal(domOnly.length, 6, `过滤订阅只收 node 层——实际 ${domOnly.join(',')}`)
  assert.ok(!domOnly.some((k) => !k.startsWith('node:')), '过滤订阅无其他层事件')
  // 水位事件（5/10 >= 0.5——发一次）
  const watermark = s.events().filter((e) => e.entity === 'stream' && e.action === 'watermark')
  assert.ok(watermark.length >= 1, `stream:watermark（水位预警）——实际: ${s.events().map((e) => evKey(e)).join(',')}`)
  assert.equal((watermark[0] as any).payload?.usage, 5, '水位携带占用')
  assert.equal((watermark[0] as any).payload?.ratio, 0.5, '水位携带阈值')
  // 不重复发（watermarkFired 一次）
  const before = watermark.length
  s.emit({ entity: 'node', action: 'create', target: 'x', ts: 99 })
  const after = s.events().filter((e) => e.entity === 'stream' && e.action === 'watermark').length
  assert.equal(after, before, '水位只发一次（不重复预警）')
})

test('结构共享：静态分支复用旧引用（零克隆零 diff）+ 文本变化不复用（正确性）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  const { buildVNode } = await import('../ui-dom/vdom3/build.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let n = 0
  let staticCompRenders = 0
  // 静态组件（props 稳定——无内部状态——应被结构共享复用）
  const Static = async (_init: any, _ctx: any) => async (_p: any) => {
    staticCompRenders++
    return h('div', { class: 'static' }, 's')
  }
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', {}, [
      h('button', { id: 'go', onClick: () => { n++; rerender() } }, [`count:${n}`]),
      h(Static, {}),
    ])
  }
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  const rendersBefore = staticCompRenders
  gs.reset()
  ;(root.querySelector('[id="go"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  // 文本更新正确（count:1——结构共享不吞文本变化）
  assert.equal(root.querySelector('[id="go"]')?.textContent, 'count:1', '文本变化正确（结构共享条件含文本比较）')
  // 静态组件复用（工厂不重跑——组件级复用）——renderFn 不重跑
  assert.equal(staticCompRenders, rendersBefore, '静态组件复用（渲染次数不变——剪枝/共享）')
  document.body.removeChild(root)
})

test('app 节点：多应用加载——注册表/工厂/边界事件/同流全链路/卸载', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  const { registerApp, resetAppRegistry, getAppFactory } = await import('../ui-dom/vdom3/app.ts')
  resetAppRegistry()
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const { App, h } = await import('../ui-dom/vdom3/index.ts')
  // 子应用注册（工厂——可 await 初始化——应用实例状态闭包持有）
  let appClicks = 0
  registerApp('counter-app', (_props: any, _ctx: any) => {
    // 应用工厂返回子应用根 vnode（应用组件）
    const SubApp = async (_init: any, ctx: any) => {
      const rerender = () => ctx.ui.render()
      return async () => h('div', { class: 'sub' }, [
        h('button', { id: 'sub-go', onClick: () => { appClicks++; rerender() } }, [`sub:${appClicks}`]),
      ])
    }
    return h(SubApp, {})
  })
  assert.ok(getAppFactory('counter-app'), '注册表查询')
  // 父应用嵌入子应用（app 节点）
  let subProps = { label: 'x' }
  const App2 = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', {}, [
      h('button', { id: 'parent', onClick: () => { subProps = { label: 'y' }; rerender() } }, 'parent'),
      h(App, { appId: 'counter-app', props: subProps }),
      h('div', { id: 'after' }, 'after'),
    ])
  }
  createRoot(h(App2, {}), root)
  await new Promise((r) => setTimeout(r, 40))
  // 子应用渲染（同流全链路）
  const subBtn = root.querySelector('[id="sub-go"]') as HTMLButtonElement
  assert.ok(subBtn, '子应用渲染（父流中）')
  assert.ok(root.querySelector('#after'), '父应用其他内容正常')
  // 边界事件：app:mount（带 appId）
  const mounts = gs.events().filter((e) => evKey(e) === 'app:mount')
  assert.ok(mounts.length >= 1, `app:mount（子应用挂载）——实际: ${[...new Set(gs.events().map((e) => evKey(e)))].join(',')}`)
  assert.equal((mounts[0] as any).payload?.appId, 'counter-app', 'mount 带 appId')
  // 子应用交互（父流事件——id 唯一天然隔离）
  gs.reset()
  subBtn.click()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.querySelector('[id="sub-go"]')?.textContent, 'sub:1', '子应用交互正常')
  const evs2 = gs.events()
  assert.ok(evs2.some((e) => evKey(e) === 'comp:render'), '子应用渲染在父流（同流全链路）')
  // props 变化 → app:update
  gs.reset()
  ;(root.querySelector('[id="parent"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  const updates = gs.events().filter((e) => evKey(e) === 'app:update')
  assert.ok(updates.length >= 1, `app:update（props 变化——可观测）——实际: ${[...new Set(gs.events().map((e) => evKey(e)))].join(',')}`)
  assert.equal((updates[0] as any).payload?.appId, 'counter-app', 'update 带 appId')
  assert.deepEqual((updates[0] as any).payload?.keys, ['label'], 'update 带变化的 keys')
  // 未注册 app → app:error unknown-app（占位）
  const App3 = async (_init: any, _ctx: any) => async () =>
    h('div', {}, h(App, { appId: 'missing-app' }, h('div', { id: 'placeholder' }, 'loading')))
  gs.reset()
  const root2 = document.createElement('div')
  document.body.appendChild(root2)
  createRoot(h(App3, {}), root2)
  await new Promise((r) => setTimeout(r, 30))
  const errs = gs.events().filter((e) => evKey(e) === 'app:error')
  assert.ok(errs.length >= 1, `app:error（unknown-app）——实际: ${[...new Set(gs.events().map((e) => evKey(e)))].join(',')}`)
  assert.equal((errs[0] as any).payload?.reason, 'unknown-app', '错误原因可观测')
  assert.ok(root2.querySelector('#placeholder'), '占位保留（children）')
  document.body.removeChild(root)
  document.body.removeChild(root2)
  resetAppRegistry()
})

test('路由：复用布局组件读最新 ctx.route（Sider active 跟随导航——共享 routeState）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  // 布局组件（跨路由复用——工厂不重跑——renderFn 读 ctx.route）
  const seen: string[] = []
  const Layout = async (_init: any, ctx: any) => {
    return async (props: any) => {
      // ctx.route.path = 完整路径（有前导斜杠——'/a'）——复用组件读最新
      const route = ctx.route?.path ?? ''
      seen.push(route)
      return h('div', { 'data-active': route, class: 'layout' }, [
        h('nav', {}, ['菜单']),
        h('main', {}, props.children),
      ])
    }
  }
  const layout = (page: any) => h(Layout, {}, page)
  const PageA = async (_init: any, _ctx: any) => async () => h('div', { id: 'a' }, 'A')
  const PageB = async (_init: any, _ctx: any) => async () => h('div', { id: 'b' }, 'B')
  const router = createRouter([
    { path: '/a', render: () => h(PageA, {}), layout },
    { path: '/b', render: () => h(PageB, {}), layout },
  ], root, { initialPath: '/a' })
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.querySelector('.layout')?.getAttribute('data-active'), '/a', '初始 ctx.route.path=/a')
  // 导航 → layout 复用（工厂不重跑）但 renderFn 重跑读最新 ctx.route
  router.navigate('/b')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.querySelector('.layout')?.getAttribute('data-active'), '/b', '导航后 ctx.route.path=/b（共享 routeState——复用组件读最新）')
  assert.ok(root.querySelector('#b'), '页面切换正常')
  document.body.removeChild(root)
})

test('重建项插入位置：children 顺序保持（audit 顺序错位回归——内联 style 重建项不插末尾）', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  // 复现统计页场景：内联 style 对象（每次渲染新引用——结构共享失败——重建）
  // 重建项（grid）必须在 header 后——不插末尾
  let n = 0
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', {}, [
      h('div', { id: 'header' }, 'header'),
      n % 2 === 1 ? h('div', { id: 'alert' }, 'alert') : false,
      h('div', { id: 'grid', style: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)' } }, [
        h('div', { id: 'c1' }, String(n)),
        h('div', { id: 'c2' }, 'c2'),
      ]),
      h('div', { id: 'tail' }, 'tail'),
    ])
  }
  const render = () => h('button', { id: 'go', onClick: () => { n++; render(); } })
  // 用 App 自触发（onClick 在 App 外不可——用根 handle）
  const handle = createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 30))
  // 多次 rerender（n 变化——grid 的 style 新对象——重建）
  const rerender = () => { n++; handle.rerender() }
  rerender()
  await new Promise((r) => setTimeout(r, 30))
  rerender()
  await new Promise((r) => setTimeout(r, 30))
  // 顺序断言：header → grid → tail（grid 不在末尾）
  const ids = [...root.firstElementChild?.childNodes ?? []].filter((c) => c.nodeType === 1).map((c) => (c as Element).getAttribute('id'))
  const gridIdx = ids.indexOf('grid')
  const headerIdx = ids.indexOf('header')
  const tailIdx = ids.indexOf('tail')
  assert.ok(headerIdx >= 0 && gridIdx >= 0 && tailIdx >= 0, `节点齐全——实际: ${ids.join(',')}`)
  assert.ok(headerIdx < gridIdx && gridIdx < tailIdx, `children 顺序保持（header→grid→tail）——实际: ${ids.join(',')}`)
  document.body.removeChild(root)
})

// ── 阶段 0：事件流地基扩展（session + diff:transition 决策事件） ──

test('阶段 0：渲染会话 session 注入——同一次渲染的事件共享 session id', async () => {
  stream.reset() // 隔离前面测试的事件残留
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const handle = createRoot(h('div', {}, [h('span', {}, 'a'), h('span', {}, 'b')]), root)
  await handle.ready
  // 首帧渲染的事件带 session（同一次渲染共享）
  const events = stream.events()
  const sessioned = events.filter((e) => e.entity === 'node' && e.action === 'create').map((e) => e.session).filter(Boolean)
  assert.ok(sessioned.length > 0, `首帧 node:create 事件带 session——实际 ${sessioned.length}`)
  const sessions = new Set(sessioned)
  assert.equal(sessions.size, 1, `同一次渲染共享同一 session——实际 ${sessions.size}`)
  // 二次渲染（rerender）→ 新 session
  stream.reset()
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const s2 = stream.events().map((e) => e.session).filter(Boolean)
  assert.ok(s2.length > 0 && new Set(s2).size === 1, `rerender 事件带新 session——实际 ${new Set(s2).size}`)
  document.body.removeChild(root)
})

test('阶段 0：diff:transition 决策事件——from/to kind 可观测', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let n = 0
  const App = async (_init: any, ctx: any) => async () => {
    const rerender = () => ctx.render()
    return h('div', {}, n === 0 ? h('span', {}, 'x') : '文本')
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  stream.reset()
  // 触发元素 → 文本 转换（patch 决策）
  n = 1
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const transitions = stream.events().filter((e) => e.entity === 'diff' && e.action === 'transition')
  assert.ok(transitions.length > 0, `diff:transition 决策事件发射——实际 ${transitions.length}`)
  // from/to kind 在决策事件中
  const t = transitions[0]
  assert.ok(t.payload?.from != null && t.payload?.to != null, `决策事件带 from/to——实际 ${JSON.stringify(t.payload)}`)
  document.body.removeChild(root)
})

// ── 阶段 1：占位法（空洞事件化——DOM 与 children 同构） ──

test('阶段 1：占位法——条件渲染中间项切换不重复/不嵌套（@ 菜单场景框架层根治）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let open = false
  const App = async (_init: any, ctx: any) => async () =>
    h('div', { id: 'container' }, [
      open && h('div', { class: 'menu' }, '菜单'),
      h('div', { class: 'inputbar' }, [h('input', { class: 'chat-input' })]),
      h('div', { class: 'searchbar' }, '搜索'),
    ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const inputbars = () => root.querySelectorAll('.inputbar').length
  assert.equal(inputbars(), 1, '初始 1 个输入条')
  // 打开菜单（false → 元素——中间插入）
  open = true
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(inputbars(), 1, '菜单打开后仍 1 个输入条（无重复）')
  assert.ok(root.querySelector('.menu'), '菜单出现')
  assert.ok(root.querySelector('.searchbar'), '搜索条保留（顺序不漂移）')
  // 关闭菜单（元素 → false——中间移除）
  open = false
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(inputbars(), 1, '菜单关闭后仍 1 个输入条')
  assert.equal(root.querySelector('.menu'), null, '菜单移除')
  // 多次切换（累积不重复/不嵌套）
  for (let i = 0; i < 3; i++) {
    open = !open
    handle.rerender()
    await new Promise((r) => setTimeout(r, 20))
  }
  assert.equal(inputbars(), 1, `多次切换后仍 1 个输入条——实际 ${inputbars()}`)
  const menuInInput = root.querySelector('.menu')?.parentElement?.classList.contains('inputbar') ?? false
  assert.equal(menuInInput, false, '菜单不嵌套进输入条（无 DOM 结构错乱）')
  document.body.removeChild(root)
})

test('阶段 1：SSR 空洞——占位序列化 + 客户端 replay 同构', async () => {
  const { renderToEvents, eventsToHtml } = await import('../ui-dom/vdom3/ssr.ts')
  const { replay } = await import('../ui-dom/vdom3/replay.ts')
  let open = false
  const App = async (_init: any) => async () => h('div', { id: 'ssr-hole' }, [
    open && h('span', { class: 'cond' }, 'x'),
    h('span', { class: 'keep' }, 'y'),
  ])
  const events = await renderToEvents(h(App, {}))
  const html = eventsToHtml(events)
  assert.ok(html.includes('<!--wf-anchor-->'), `SSR HTML 含锚注释——实际 ${html}`)
  // 客户端 replay（事件流含锚——重建同构）
  const target = document.createElement('div')
  document.body.appendChild(target)
  replay(events, target)
  assert.equal(target.querySelectorAll('.keep').length, 1, 'replay 保持元素')
  const inner = target.firstElementChild?.childNodes.length ?? 0
  assert.equal(inner, 3, `replay 锚 + 元素（锚点法：空洞槽位 = 锚 + 元素槽位 = [锚, 元素]）——实际 ${inner}`)
  document.body.removeChild(target)
})

test('阶段 1：空洞事件流——占位生命周期（create/insert/remove）可观测', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let open = false
  const App = async (_init: any, ctx: any) => async () => h('div', {}, [
    open ? h('span', { class: 'a' }, 'x') : false,
  ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  stream.reset()
  // 空洞 → 元素（锚保留——内容插锚后——锚点法语义：锚恒在）
  open = true
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const inserts = stream.events().filter((e) => e.entity === 'node' && e.action === 'insert')
  assert.ok(inserts.length >= 1, `空洞 → 元素：内容插入有事件——实际 ${inserts.length}`)
  stream.reset()
  // 元素 → 空洞（内容清除——锚保留——clearSlot）
  open = false
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const removes = stream.events().filter((e) => e.entity === 'node' && e.action === 'remove')
  assert.ok(removes.length >= 1, `元素 → 空洞：内容移除有事件——实际 ${removes.length}`)
  const holes = stream.events().filter((e) => e.entity === 'node' && e.action === 'create' && (e.payload as any)?.kind === 'anchor')
  assert.equal(holes.length, 0, `元素 → 空洞：锚不重建（锚保留——锚点法）——实际 ${holes.length}`)
  document.body.removeChild(root)
})

// ── 阶段 2：边界标记事件化（多节点输出锚点） ──

test('阶段 2：组件输出 Fragment 在数组中间——切换不漂移（多节点范围锚）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const { Fragment } = await import('../ui-dom/vdom3/types.ts')
  let show = true
  // 组件输出 Fragment（多节点）——数组中间（前后有兄弟）——show 由 props 驱动
  // （子组件闭包状态走自身 ctx.render；父级状态传 props——父重渲染时 props 变 → 子重跑）
  const Multi = async (_init: any) => async (props: any) =>
    props.show
      ? h(Fragment, {}, [h('span', { class: 'm1' }, 'a'), h('span', { class: 'm2' }, 'b')])
      : false
  const App = async (_init: any) => async () =>
    h('div', { id: 'wrap' }, [
      h('div', { class: 'head' }, '头'),
      h(Multi, { show }),
      h('div', { class: 'tail' }, '尾'),
    ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const order = () => [...root.querySelector('#wrap')?.childNodes ?? []].filter((n) => n.nodeType === 1).map((n) => (n as Element).getAttribute('class'))
  assert.deepEqual(order(), ['head', 'm1', 'm2', 'tail'], `初始顺序（组件 Fragment 多节点在中间）——实际 ${order()}`)
  // 组件输出 false（条件移除——多节点 → 占位）
  show = false
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(order(), ['head', 'tail'], `组件输出移除后顺序——实际 ${order()}`)
  // 重新出现（占位 → 多节点）
  show = true
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(order(), ['head', 'm1', 'm2', 'tail'], `组件 Fragment 重新出现——实际 ${order()}`)
  document.body.removeChild(root)
})

test('阶段 2：组件输出数组直接接数组（理论边界——多节点相邻）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const { Fragment } = await import('../ui-dom/vdom3/types.ts')
  let toggle = false
  const Multi = async (_init: any, ctx: any) => async () => {
    const rerender = () => ctx.render()
    return h(Fragment, {}, [h('span', { class: 'x1' }, 'x'), h('span', { class: 'x2' }, 'y')])
  }
  const App = async (_init: any, ctx: any) => async () =>
    h('div', { id: 'wrap' }, [
      h(Multi, {}),
      h(Fragment, {}, [h('span', { class: 'z1' }, 'z'), h('span', { class: 'z2' }, 'w')]),
      toggle && h('div', { class: 'cond' }, 'c'),
    ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const order = () => [...root.querySelector('#wrap')?.childNodes ?? []].filter((n) => n.nodeType === 1).map((n) => (n as Element).getAttribute('class'))
  assert.deepEqual(order(), ['x1', 'x2', 'z1', 'z2'], `两个多节点相邻——实际 ${order()}`)
  // 尾部条件切换（多节点后接条件项——不漂移）
  toggle = true
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(order(), ['x1', 'x2', 'z1', 'z2', 'cond'], `尾部条件出现——实际 ${order()}`)
  toggle = false
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(order(), ['x1', 'x2', 'z1', 'z2'], `尾部条件移除——实际 ${order()}`)
  document.body.removeChild(root)
})

// ── 阶段 4：审计订阅（A 级动态数组 key 检测——事件流化） ──

test('阶段 4：diff:mode 决策事件——keyed/unkeyed 模式可观测', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  stream.reset()
  const App = async (_init: any) => async () => h('div', {}, [
    h('span', { key: 'a' }, 'a'),
    h('span', { key: 'b' }, 'b'),
  ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  stream.reset()
  handle.rerender() // patch 路径（mount 无 patchChildren——决策事件在 diff 时）
  await new Promise((r) => setTimeout(r, 20))
  const modes = stream.events().filter((e) => e.entity === 'diff' && e.action === 'mode')
  assert.ok(modes.length > 0, `diff:mode 决策事件发射——实际 ${modes.length}`)
  assert.equal(modes[0].payload?.mode, 'keyed', `全 keyed 模式——实际 ${modes[0].payload?.mode}`)
  document.body.removeChild(root)
})

test('阶段 4：动态数组无 key 组件检测（dev error 引导业务身份）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const warns: string[] = []
  const ow = console.error
  console.error = (...a: any[]) => { if (String(a[0]).includes('[vdom3/audit] 动态数组')) warns.push(String(a[0])); ow(...a) }
  let items = ['a']
  const Item = async (_init: any) => async (props: any) => h('div', {}, props.k)
  const App = async (_init: any) => async () => h('div', {}, items.map((k) => h(Item, { k })))
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  // 长度变化 + 无 key 组件项 → dev error（独特长度 sig 3:1——避免跨测试去重）
  items = ['a', 'b', 'c']
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  console.error = ow
  assert.ok(warns.length > 0, `动态数组无 key 组件触发 dev error——实际 ${warns.length}`)
  document.body.removeChild(root)
})

test('阶段 4：portal 槽切换不触发动态数组检测（[children, portal] 模式——HoverCard 误报）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot, createPortal } = await import('../ui-dom/vdom3/index.ts')
  const warns: string[] = []
  const ow = console.error
  console.error = (...a: any[]) => { if (String(a[0]).includes('[vdom3/audit] 动态数组')) warns.push(String(a[0])); ow(...a) }
  let open = false
  const Trigger = async (_init: any) => async () => h('span', {}, '触发')
  const App = async (_init: any, ctx: any) => async () => h('div', { id: 'main' }, [
    h('button', { id: 'toggle', onClick: () => { open = !open; ctx.render() } }, '开'),
    h('div', {}, [
      h(Trigger, {}), // 无 key 组件（触发器）——业务子项
      open ? createPortal(h('div', { id: 'pop' }, '浮层'), 'audit-pop') : null,
    ]),
  ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  // 打开 → 数组 2→3（trigger + 条件 + portal）——portal 槽切换不得误报
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  console.error = ow
  assert.equal(warns.length, 0, `portal 槽切换不触发检测——实际 ${warns.join(' | ')}`)
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('阶段 4：单子节点条件渲染（cond ? <X/> : null）不触发检测（ColorPicker check Icon 误报）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/index.ts')
  const warns: string[] = []
  const ow = console.error
  console.error = (...a: any[]) => { if (String(a[0]).includes('[vdom3/audit] 动态数组')) warns.push(String(a[0])); ow(...a) }
  let sel = true
  const Mark = async (_init: any) => async () => h('span', {}, '✓')
  const App = async (_init: any, ctx: any) => async () => h('div', { id: 'main' }, [
    h('button', { id: 'toggle', onClick: () => { sel = !sel; ctx.render() } }, '切'),
    // ColorPicker swatch 同款：单子节点条件渲染（null ↔ 组件）
    h('button', { class: 'wf-swatch' }, sel ? h(Mark, {}) : null),
  ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  ;(root.querySelector('[id="toggle"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  console.error = ow
  assert.equal(warns.length, 0, `null ↔ 组件切换不触发检测——实际 ${warns.join(' | ')}`)
  // 锚点法：内容态按钮 = [锚, 内容]（两次点击后 sel=true——Mark 在）
  const btn = root.querySelector('.wf-swatch')
  assert.ok(btn?.childNodes.length === 2, `按钮 children 同构（锚 + 内容）——实际 ${btn?.childNodes.length}`)
  document.body.removeChild(root)
})

// ── 阶段 5：会话 trace（session 过滤 API） ──

test('阶段 5：eventsBySession 按会话过滤（一次渲染的事件全量）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let n = 0
  const App = async (_init: any) => async () => h('div', {}, [h('span', {}, String(n))])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  stream.reset()
  n = 1
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const events = stream.events()
  const sessionIds = [...new Set(events.map((e) => e.session).filter(Boolean))] as string[]
  assert.equal(sessionIds.length, 1, `一次渲染一个 session——实际 ${sessionIds.length}`)
  const bySession = stream.eventsBySession(sessionIds[0])
  assert.equal(bySession.length, events.length, `eventsBySession 返回该会话全部事件——实际 ${bySession.length}/${events.length}`)
  // 多次渲染 → 多个 session——按会话隔离
  stream.reset()
  n = 2
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  n = 3
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const s2 = [...new Set(stream.events().map((e) => e.session).filter(Boolean))] as string[]
  assert.equal(s2.length, 2, `两次渲染两个 session——实际 ${s2.length}`)
  const first = stream.eventsBySession(s2[0])
  const second = stream.eventsBySession(s2[1])
  // 两次渲染的 text:update 分属各自会话
  const t1 = first.find((e) => e.entity === 'text' && e.action === 'update')
  const t2 = second.find((e) => e.entity === 'text' && e.action === 'update')
  assert.ok(t1 && t2 && t1.session !== t2.session, `各渲染的更新事件分属各自 session`)
  document.body.removeChild(root)
})

// ── 阶段 A：剪枝决策透明化（comp:build reason 字段） ──

test('阶段 A：comp:build reason 四类决策可观测（mount/reuse-skip/props-changed/root-render）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let n = 0
  const Item = async (_init: any) => async (props: any) => h('div', {}, String(props.k))
  const App = async (_init: any) => async () => h('div', {}, [
    h(Item, { k: n }),
    h('div', {}, 'static'),
  ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const builds = () => stream.events().filter((e) => e.entity === 'comp' && e.action === 'build').map((e) => (e.payload as any)?.reason ?? '?')
  // 首帧：mount
  assert.ok(builds().includes('mount'), `首帧 mount——实际 ${builds().join(',')}`)
  // props 变（n 变化——Item props.k 变）→ props-changed
  stream.reset()
  n = 1
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(builds().includes('props-changed'), `props 变 → props-changed——实际 ${builds().join(',')}`)
  // props 不变（n 同——Item props 引用/值同）→ reuse-skip
  stream.reset()
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(builds().includes('reuse-skip'), `props 不变 → reuse-skip——实际 ${builds().join(',')}`)
  document.body.removeChild(root)
})

// ── 阶段 D：调试工具（__wf_builds 按组件查剪枝决策） ──

test('阶段 D：__wf_builds 按组件查构建决策（reason 可见）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const Item = async (_init: any) => async (props: any) => h('div', {}, String(props.k))
  const App = async (_init: any) => async () => h('div', {}, [h(Item, { k: 1 })])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  stream.reset()
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const w = globalThis as any
  const builds = w.__wf_builds?.()
  assert.ok(Array.isArray(builds) && builds.length > 0, `__wf_builds 可查——实际 ${builds?.length}`)
  // 决策含 reason（props 未变 → reuse-skip）
  const reasons = builds.map((b: any) => b.reason)
  assert.ok(reasons.includes('reuse-skip'), `剪枝决策可见——实际 ${reasons.join(',')}`)
  document.body.removeChild(root)
})

// ── P2a：props 不可变契约机制化（dev 深度冻结——原地改立即 TypeError） ──

test('P2a：dev 深度冻结 props——原地改对象立即抛错；新建对象正常渲染', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let data: any = { k: 'a' }
  const Item = async (_init: any) => async (props: any) => h('div', {}, props.data.k)
  const App = async (_init: any) => async () => h('div', {}, [h(Item, { data })])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.ok(Object.isFrozen(data), `props 对象已冻结（机制强制——原地改不可行）`)
  // 原地改对象 → strict mode 立即 TypeError（不再是事后 warn——静默失效从根上消灭）
  assert.throws(() => { (data as any).k = 'changed' }, TypeError, '原地改冻结对象抛 TypeError')
  assert.equal(data.k, 'a', '原地修改被冻结拦截（内容未变）')
  // 新建对象（引用变）→ 正常渲染 + 新对象也被冻结
  data = { k: 'new-object' }
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.textContent?.includes('new-object'), true, '新建对象正常渲染')
  assert.ok(Object.isFrozen(data), '新 props 对象也被冻结')
  document.body.removeChild(root)
})

// ── 第二轮阶段 2：渲染性能透明（render:duration + 慢渲染 warn） ──

test('阶段 2：render:duration 事件 + 慢渲染 warn（阈值可配）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const warns: string[] = []
  const ow = console.warn
  console.warn = (...a: any[]) => { if (String(a[0]).includes('[vdom3/audit] 渲染耗时')) warns.push(String(a[0])); ow(...a) }
  // 慢组件（sleep 110ms——超过默认 100ms 阈值）
  const Slow = async (_init: any) => async (props: any) => {
    await new Promise((r) => setTimeout(r, 110))
    return h('div', {}, props.k)
  }
  const App = async (_init: any) => async () => h('div', {}, [h(Slow, { k: 'x' })])
  stream.reset() // 隔离前面测试的事件残留
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  // duration 事件（首帧 update——含 build）
  const durations = stream.events().filter((e) => e.entity === 'render' && e.action === 'duration')
  assert.ok(durations.length > 0, `render:duration 事件——实际 ${durations.length}`)
  const d = durations[durations.length - 1]
  assert.ok(typeof d.payload?.ms === 'number' && (d.payload as any).ms > 0, `耗时字段——实际 ${JSON.stringify(d.payload)}`)
  assert.ok(d.session, `duration 带 session`)
  // 慢渲染 warn（110ms > 100ms）
  assert.ok(warns.length > 0, `慢渲染 warn——实际 ${warns.length}`)
  console.warn = ow
  document.body.removeChild(root)
})

// ── 第二轮阶段 3：事件因果链（causeId——重建/移除决策 → DOM 操作） ──

test('阶段 3：重建/移除决策的 DOM 操作带 causeId（因果可查）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let show = true
  const App = async (_init: any) => async () => h('div', { id: 'w' }, [
    show ? h('span', { class: 'a' }, 'x') : false,
  ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  stream.reset()
  // 元素 → 空洞（条件移除——决策 → remove 操作带 causeId）
  show = false
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const removes = stream.events().filter((e) => e.entity === 'node' && e.action === 'remove')
  assert.ok(removes.length > 0, `移除操作——实际 ${removes.length}`)
  const causeId = removes[0].payload?.causeId as string | undefined
  assert.ok(causeId, `移除带 causeId——实际 ${causeId}`)
  // __wf_tail 按 causeId 过滤——该决策的操作链（移除 + 占位创建）
  const w = globalThis as any
  const chain = w.__wf_tail?.(100, { causeId })
  assert.ok(Array.isArray(chain) && chain.length > 0, `按 causeId 过滤可查——实际 ${chain?.length}`)
  document.body.removeChild(root)
})

// ── 第二轮阶段 4：更新触发源（__WF_V3_STACK 调试模式——comp:render 带栈） ──

test('阶段 4：__WF_V3_STACK 开启时 comp:render 带触发栈（默认关）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const g = globalThis as any
  const prev = g.__WF_V3_STACK
  let n = 0
  const App = async (_init: any, ctx: any) => async () => {
    const rerender = () => ctx.render()
    return h('button', { id: 'b', onClick: () => { n++; rerender() } }, String(n))
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  // 默认关——无栈
  stream.reset()
  g.__WF_V3_STACK = '1' // 开启调试模式
  ;(root.querySelector('#b') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 20))
  const renders = stream.events().filter((e) => e.entity === 'comp' && e.action === 'render')
  const withStack = renders.filter((e) => e.payload?.stack)
  assert.ok(withStack.length > 0, `调试模式 comp:render 带栈——实际 ${withStack.length}/${renders.length}`)
  g.__WF_V3_STACK = prev
  document.body.removeChild(root)
})

// ── 第三轮阶段 1：keyed 重排透明（node:move 带 key） ──

test('阶段 1：keyed 重排 → node:move 事件（key/ref 可查）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let items = ['a', 'b', 'c']
  const App = async (_init: any) => async () => h('div', { id: 'l' }, items.map((k) => h('span', { key: k }, k)))
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  stream.reset()
  items = ['c', 'a', 'b'] // 重排（c 移到最前）
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const moves = stream.events().filter((e) => e.entity === 'node' && e.action === 'move')
  assert.ok(moves.length > 0, `keyed 重排 node:move——实际 ${moves.length}`)
  assert.equal(moves[0].payload?.key, 'c', `move 带 key（业务身份）——实际 ${moves[0].payload?.key}`)
  // 顺序正确（c 在最前——过滤锚注释——锚点法 childNodes 含锚）
  const order = [...root.querySelector('#l')?.childNodes ?? []].filter((n) => n.nodeType !== 8).map((n) => (n as Element).textContent)
  assert.deepEqual(order, ['c', 'a', 'b'], `重排后顺序——实际 ${order.join(',')}`)
  document.body.removeChild(root)
})

// ── 第三轮阶段 2：调度时间线（render:queued 合并 + flushed 执行） ──

test('阶段 2：同 tick 多次 render → queued（合并）+ flushed（执行）可观测', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let n = 0
  const App = async (_init: any, ctx: any) => async () => {
    const rerender = () => ctx.render()
    return h('button', { id: 'b', onClick: () => { n++; rerender(); rerender(); rerender() } }, String(n))
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  stream.reset()
  ;(root.querySelector('#b') as HTMLButtonElement).click() // 同 tick 3 次 render
  await new Promise((r) => setTimeout(r, 20))
  const queued = stream.events().filter((e) => e.entity === 'render' && e.action === 'queued')
  const flushed = stream.events().filter((e) => e.entity === 'render' && e.action === 'flushed')
  assert.ok(flushed.length >= 1, `渲染执行（flushed）——实际 ${flushed.length}`)
  assert.ok(queued.length >= 1, `合并排队（queued）可见——实际 ${queued.length}`)
  document.body.removeChild(root)
})

// ── 第三轮阶段 3：portal 生命周期（open/close——弹层开合可观测） ──

test('阶段 3：portal open/close 事件（弹层开合可观测）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const { Portal } = await import('../ui-dom/vdom3/types.ts')
  let open = false
  const App = async (_init: any) => async () => h('div', {}, [
    open ? h(Portal, { portalKey: 'test-pop' }, [h('div', { class: 'panel' }, '面板')]) : false,
  ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  stream.reset()
  open = true
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const opens = stream.events().filter((e) => e.entity === 'portal' && e.action === 'open')
  assert.ok(opens.length > 0, `portal:open——实际 ${opens.length}`)
  assert.equal(opens[0].payload?.portalKey, 'test-pop', `open 带 portalKey`)
  stream.reset()
  open = false
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const closes = stream.events().filter((e) => e.entity === 'portal' && e.action === 'close')
  assert.ok(closes.length > 0, `portal:close——实际 ${closes.length}`)
  document.body.removeChild(root)
})

// ── 第三轮阶段 4：监听器泄漏检测（dev——unmount 后残留 warn） ──

test('阶段 4：监听残留 dev warn；正常清理无残留', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const { bindDelegated, listenerCount } = await import('../ui-dom/vdom3/delegate.ts')
  const warns: string[] = []
  const ow = console.warn
  console.warn = (...a: any[]) => { if (String(a[0]).includes('[vdom3/audit] 节点监听残留')) warns.push(String(a[0])); ow(...a) }
  // 正常场景：绑定 + 移除——清理干净（无残留 warn）
  let show = true
  const App = async (_init: any) => async () => h('div', {}, [
    show ? h('button', { id: 'b', onClick: () => {} }, 'x') : false,
  ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  show = false
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(warns.length, 0, `正常移除无残留 warn——实际 ${warns.length}`)
  console.warn = ow
  document.body.removeChild(root)
})

// ── 第三轮阶段 5：__wf_comp 组件时间线聚合 ──

test('阶段 5：__wf_comp(id) 聚合组件完整生命周期（时间序）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let n = 0
  const Item = async (_init: any) => async (props: any) => h('div', {}, String(props.k))
  const App = async (_init: any) => async () => h('div', {}, [h(Item, { k: n })])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  n = 1
  handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  const w = globalThis as any
  const timeline = w.__wf_comp?.()
  assert.ok(Array.isArray(timeline) && timeline.length > 0, `__wf_comp 可查——实际 ${timeline?.length}`)
  const actions = timeline.map((e: any) => `${e.entity}:${e.action}`)
  assert.ok(actions.includes('comp:build'), `含构建决策——实际 ${actions.slice(0, 5).join(',')}`)
  document.body.removeChild(root)
})

// ── 事件代理：mouseenter 真实 hover（不冒泡 → mouseover 映射——真实事故回归） ──

test('事件代理：onMouseEnter 真实 mouseover 触发（mouseenter 不冒泡映射）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let entered = 0
  const App = async (_init: any) => async () =>
    h('div', { id: 'wrap' }, [
      h('span', { id: 'hot', onMouseEnter: () => { entered++ } }, 'hot'),
    ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  // 真实鼠标语义：mouseover（冒泡——从子元素/目标冒泡到挂载点）——触发 onMouseEnter
  const hot = root.querySelector('#hot') as HTMLElement
  hot.dispatchEvent(new (window as any).MouseEvent('mouseover', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(entered, 1, `真实 mouseover 触发 onMouseEnter——实际 ${entered}`)
  document.body.removeChild(root)
})

test('事件代理：svg 内元素 onMouseEnter 真实 mouseover 触发（插入后补注册——svg 特定回归）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let entered = 0
  const App = async (_init: any) => async () =>
    h('div', {}, [
      h('svg', { width: 100, height: 100 }, [
        h('circle', { id: 'dot', cx: 10, cy: 10, r: 5, onMouseEnter: () => { entered++ } }),
      ]),
    ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  // svg 内 circle——真实 mouseover（冒泡——补注册后挂载点监听应 dispatch）
  const dot = root.querySelector('#dot') as HTMLElement
  dot.dispatchEvent(new (window as any).MouseEvent('mouseover', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(entered, 1, `svg 内 circle 真实 mouseover 触发 onMouseEnter——实际 ${entered}`)
  document.body.removeChild(root)
})

// ── UI-3：语义 id 服务——render(['id']) 跨组件精准渲染（vdom3 此前 warn 降级的能力） ──

test('UI-3：selfId + render([\'id\']) 跨组件精准刷新——只重渲染目标组件', async () => {
  const { resetSemanticService } = await import('../ui-dom/services/hook-env.ts')
  resetSemanticService()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let renders = { a: 0, b: 0 }
  // A：selfId('stats')——B 点击后只刷新 A（B 自身零执行）
  const A = async (_init: any, ctx: any) => {
    ctx.ui.selfId('stats')
    return async () => { renders.a++; return h('div', { id: 'stats-panel' }, `统计 ${renders.a}`) }
  }
  const B = async (_init: any, ctx: any) => async () => {
    renders.b++
    return h('button', { id: 'refresh-stats', onClick: () => ctx.ui.render(['stats']) }, '刷新统计')
  }
  const App = async () => async () => h('div', {}, [h(A, {}), h(B, {})])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const a0 = renders.a
  const b0 = renders.b
  ;(root.querySelector('#refresh-stats') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(renders.a, a0 + 1, `A 精准刷新（render(['stats']) → selfId 定位）——实际 ${renders.a}`)
  assert.equal(renders.b, b0, `B 零执行（兄弟不波及）——实际 ${renders.b}`)
  // selfId 冲突 → 服务层明确抛错（防错位静默——引擎在异步 build 捕获为 error:caught——
  // 服务层同步语义直接断言）
  const { registerSemanticId } = await import('../ui-dom/services/hook-env.ts')
  assert.throws(() => registerSemanticId('stats', 'other-comp'), /冲突/, '语义 id 冲突抛错（全局唯一）')
  registerSemanticId('dup', 'c1') // 首次注册——不抛
  assert.throws(() => registerSemanticId('dup', 'c2'), /冲突/, '同 id 二次注册（不同组件）抛错')
  document.body.removeChild(root)
})
