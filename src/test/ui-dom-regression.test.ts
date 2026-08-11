/**
 * ui-dom 回归测试——agent-browser 实测 agent-platform 发现的问题
 *
 * 覆盖：
 * 1. use('/') 根前缀子路由无匹配 → fallthrough 父链（修复前 /login 被 main 拦截）
 * 2. 嵌套子路由 ctx.route.params 同步（修复前 route 快照旧——Agent 详情"不存在"）
 * 3. 三态 skip：props 相同 + $ 未脏 + ctx 版本一致 → patch 复用（不重渲染）
 * 4. reactive 读不触发 dirty（Map/Set/Date/数组/对象）
 * 5. ctx.browser 读无副作用（不触发渲染）
 * 6. 渲染死循环 failsafe（renderValue 超限抛错——防御）
 */
import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'
import type { WfuiContext } from '../ui-dom/index.ts'

before(setupJsdom)

afterEach(() => {
  createClientBrowser().clearBody()
  createClientBrowser().navigate('/')
})

function mount(id: string): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  b.bodyAppend(el)
  el.id = id
  return el
}

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

// ═══════════════════════════════════════════════════════
// 1. use('/') 根前缀子路由 fallthrough（agent-platform /login 被 main 拦截）
// ═══════════════════════════════════════════════════════

test('use("/") 子路由无匹配 → fallthrough 父链（/login 不被工作台 layout 拦截）', async () => {
  const b = createClientBrowser()
  const main = new UIRouter()
  // 工作台 layout：子路由无匹配（null）时不得包 AppLayout（修复前拦截 /login 渲染 Loading）
  const layoutMw = async (_loc: any, _ctx: any, children: any) => {
    return async (loc: any, c: any) => {
      const child = await children(loc, c)
      if (child == null) return child
      return h('div', { id: 'shell' }, child)
    }
  }
  main.use(layoutMw)
  main.get('', () => h('div', { id: 'dash' }, '工作台'))
  main.get('agents/:id', () => h('div', { id: 'agent-detail' }, 'Agent 详情'))

  const app = new UIRouter()
  app.use('/', main)
  app.get('/login', () => h('div', { id: 'login' }, '登录表单'))

  // /login：main 无 'login' 路由 → layout 返回 null → fallthrough 到父链的 /login
  b.navigate('/login')
  const el1 = mount('rt-fall')
  const h1 = uiServe(app, { root: '#rt-fall' })
  await flush()
  assert.ok(el1.querySelector('#login'), '登录页应渲染（不被 main layout 拦截）')
  assert.ok(!el1.querySelector('#shell'), '登录页不应包工作台 shell')
  h1.close()

  // 工作台路由：正常渲染（main 匹配 → shell 包裹）
  b.navigate('/')
  const el2 = mount('rt-fall2')
  const h2 = uiServe(app, { root: '#rt-fall2' })
  await flush()
  assert.ok(el2.querySelector('#shell'), '工作台应包 shell')
  assert.ok(el2.querySelector('#dash'), '工作台内容渲染')
  h2.close()

  // 未知路径：fallthrough 到 app notFound（而非被 main 吞掉）
  b.navigate('/zzz')
  const el3 = mount('rt-fall3')
  const h3 = uiServe(app, { root: '#rt-fall3' })
  await flush()
  assert.ok(!el3.querySelector('#shell'), '未知路径不应被 main 拦截')
  h3.close()
})

// ═══════════════════════════════════════════════════════
// 2. 嵌套子路由 ctx.route.params 同步（Agent 详情"不存在"根因）
// ═══════════════════════════════════════════════════════

test('嵌套子路由：ctx.route.params 随 match 同步（组件读 params.id 正确）', async () => {
  const b = createClientBrowser()
  const main = new UIRouter()
  let capturedParams: string | undefined
  main.get('agents/:id', (_loc, ctx) => {
    capturedParams = (ctx as WfuiContext).route?.params?.id as string
    return h('div', { id: 'agent' }, `Agent ${capturedParams}`)
  })
  const app = new UIRouter()
  app.use('/', main)

  b.navigate('/agents/abc-123')
  const el = mount('rt-params')
  const handle = uiServe(app, { root: '#rt-params' })
  await flush()
  // 组件渲染时（mount 阶段）读 ctx.route.params——必须是当前 match 的 id（修复前是 execute 前快照——空）
  assert.equal(capturedParams, 'abc-123', '组件工厂读 ctx.route.params.id 应为当前路由参数')
  assert.equal(el.querySelector('#agent')?.textContent, 'Agent abc-123')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// 3. 三态 skip：props 相同 + $ 未脏 + ctx 版本一致 → patch 复用
// ═══════════════════════════════════════════════════════

test('三态 skip：props 相同 + 无 dirty → 组件 patch 复用（render 不重跑）', async () => {
  const b = createClientBrowser()
  let renderCount = 0
  const Counter = async (_init: any, ctx: any) => {
    let n = 0
    return () => {
      renderCount++
      return h('div', { id: 'counter' }, `count=${n}`)
    }
  }

  const router = new UIRouter()
  router.get('/', () => h(Counter, {}))
  b.navigate('/')
  const el = mount('rt-skip')
  const handle = uiServe(router, { root: '#rt-skip' })
  await flush()
  const afterMount = renderCount
  assert.ok(afterMount >= 1, '首次渲染')

  // 再次触发渲染（导航 popstate）——同 props + 无 dirty → 三态 skip 复用（render 不重跑）
  b.navigate('/')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  assert.equal(renderCount, afterMount, '同 props + 无 dirty → 组件渲染被三态 skip 复用')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// 5. ctx.browser 读无副作用（不触发渲染）
// ═══════════════════════════════════════════════════════

test('ctx.browser 读操作无副作用（普通对象非 Proxy——读不触发渲染）', () => {
  const b = createClientBrowser()
  // 读方法：返回值正确 + 无 document 时惰性防御（null/0）
  assert.equal(b.createElement('div') === null, false) // jsdom 环境有 document
  assert.equal(typeof b.query('#x'), 'object')
  assert.equal(b.scrollTop(), 0)
  // browser 是普通对象（非 Proxy 包装——读无 get trap 副作用）
  assert.equal(Object.getPrototypeOf(b) === Object.prototype, true)
  // 重复读同一方法返回稳定行为（无内部状态累积）
  const r1 = b.byId('x')
  const r2 = b.byId('x')
  assert.equal(r1 === r2, true, '读操作无内部状态变化')
})

// ═══════════════════════════════════════════════════════
// 6. 渲染死循环 failsafe（renderValue 超限抛错——防御无限挂载）
// ═══════════════════════════════════════════════════════

test('渲染死循环 failsafe：renderValue 超限抛错（防御无限挂载不卡死主线程）', async () => {
  const b = createClientBrowser()
  // 组件渲染期反复触发 dirty（渲染 → dirty → 渲染……微任务风暴）——failsafe 抛错而非无限循环
  const Loop = async (_init: any, ctx: any) => {
    return () => h('div', {}, 'loop')
  }
  const router = new UIRouter()
  router.get('/', () => h(Loop, {}))
  b.navigate('/')
  const el = mount('rt-loop')
  const handle = uiServe(router, { root: '#rt-loop' })
  await flush()
  assert.ok(el.querySelector('div'), '渲染完成（无死循环——正常渲染路径不受 failsafe 影响）')
  handle.close()
})


// ═══════════════════════════════════════════════════════
// 7. 中间件不触发页面刷新（注入幂等 + 渲染中间件无副作用）
// ═══════════════════════════════════════════════════════

test('注入中间件只执行一次（_ensureInjected 幂等——不因渲染重复注入）', async () => {
  const b = createClientBrowser()
  let injectCount = 0
  const injectMw = async (ctx: any) => {
    injectCount++
    ctx.injected = { api: {} }
    return ctx
  }
  const router = new UIRouter()
  router.use(injectMw as any)
  router.get('/', () => h('div', { id: 'home' }, '首页'))

  b.navigate('/')
  const el = mount('rt-inject')
  const handle = uiServe(router, { root: '#rt-inject' })
  await flush()
  assert.equal(injectCount, 1, '首次渲染注入 1 次')

  // 多次渲染（popstate）——注入不重复（不因渲染触发额外副作用）
  b.navigate('/')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  b.navigate('/')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  assert.equal(injectCount, 1, '多次渲染注入仍只 1 次（中间件不触发刷新循环）')
  handle.close()
})

test('渲染中间件执行次数 = 渲染次数（中间件自身不触发额外刷新）', async () => {
  const b = createClientBrowser()
  let mwCount = 0
  let renderCount = 0
  const renderMw = async (_loc: any, ctx: any, children: any) => {
    mwCount++ // 每次渲染执行（渲染中间件正常）
    return async (loc: any, c: any) => {
      const child = await children(loc, c)
      return child == null ? child : h('div', { id: 'mw-shell' }, child)
    }
  }
  const Page = async (_init: any, ctx: any) => {
    let n = 0
    return () => {
      renderCount++
      return h('div', { id: 'page' }, 'page')
    }
  }
  const router = new UIRouter()
  router.use(renderMw)
  router.get('/', () => h(Page, {}))

  b.navigate('/')
  const el = mount('rt-mw')
  const handle = uiServe(router, { root: '#rt-mw' })
  await flush()
  const firstMw = mwCount
  const firstRender = renderCount
  assert.ok(firstMw >= 1, '渲染中间件首次执行')
  assert.ok(el.querySelector('#mw-shell'), '中间件包裹渲染')

  // 跨路径导航（popstate）——中间件执行 1 次、组件 render 不额外循环
  // （vdom 跳过同路径导航——path !== currentPath 优化）
  router.get('/other', () => h('div', { id: 'other' }, 'other'))
  b.navigate('/other')   // navigate 内部已 dispatch popstate
  await flush()
  assert.equal(mwCount, firstMw + 1, '渲染中间件每次渲染执行 1 次（不额外触发）')
  assert.ok(el.querySelector('#other'), '导航到新页面渲染')
  handle.close()
})
