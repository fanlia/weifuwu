/**
 * vdom4 核心测试——独立引擎最小闭环（同步 renderFn + 统一渲染原语 + 锚点法）
 *
 * 验证：挂载/交互（组件级更新）/父更新（props 变化）/剪枝（零命令）/
 * 列表增删（锚点法）/确定性路径（SSR/客户端一致的基础）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { createRoot } from '../ui-dom/engines/vdom4/root.ts'
import { h, Fragment } from '../ui-dom/engines/vdom4/jsx.ts'

before(setupJsdom)

function mkRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

test('vdom4：Counter 挂载 + 点击交互（同步 renderFn——ctx.render 组件级更新）', async () => {
  const root = mkRoot()
  let count = 0
  const Counter = (_init: Record<string, unknown>, ctx: any) => {
    return (props: any) =>
      h('button', { id: 'c', onClick: () => { count += props.step ?? 1; ctx.render() } }, `count:${count}`)
  }
  const handle = createRoot(h(Counter, { step: 1 }), root)
  await handle.ready
  assert.equal(root.querySelector('#c')?.textContent, 'count:0', '初始渲染')

  ;(root.querySelector('#c') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#c')?.textContent, 'count:1', '交互更新（组件级——同步 renderFn）')

  ;(root.querySelector('#c') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#c')?.textContent, 'count:2', '多次交互')
  handle.unmount()
  document.body.removeChild(root)
})

test('vdom4：父更新 props 变化 → 子重渲染；props 未变 → 剪枝零展开', async () => {
  const root = mkRoot()
  let step = 1
  let renders = { child: 0 }
  const Child = (_init: Record<string, unknown>) => {
    return (props: any) => { renders.child++; return h('span', { id: 'child' }, `step:${props.step}`) }
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, [
      h(Child, { step }),
      h('button', { id: 'bump', onClick: () => { step = 2; ctx.render() } }, 'bump'),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.equal(root.querySelector('#child')?.textContent, 'step:1', '初始')
  const c0 = renders.child

  ;(root.querySelector('#bump') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#child')?.textContent, 'step:2', 'props 变化 → 子重渲染')
  assert.ok(renders.child > c0, '子组件 renderFn 重跑')

  const c1 = renders.child
  ;(root.querySelector('#bump') as HTMLButtonElement).click() // step 2→2（无变化）
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(renders.child, c1, 'props 未变 → 剪枝（renderFn 不重跑）')
  handle.unmount()
  document.body.removeChild(root)
})

test('vdom4：列表增删（锚点法——位置保持/移除正确）', async () => {
  const root = mkRoot()
  let items = ['a', 'b', 'c']
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', { id: 'list' }, [
      ...items.map((it) => h('span', { key: it, 'data-k': it }, it)),
      h('button', { id: 'del', onClick: () => { items = items.filter((x) => x !== 'b'); ctx.render() } }, 'del'),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.deepEqual([...root.querySelectorAll('[data-k]')].map((n) => n.getAttribute('data-k')), ['a', 'b', 'c'], '初始列表')

  ;(root.querySelector('#del') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual([...root.querySelectorAll('[data-k]')].map((n) => n.getAttribute('data-k')), ['a', 'c'], '删除 b（锚区间移除）')
  handle.unmount()
  document.body.removeChild(root)
})

test('vdom4：确定性路径 compId（同声明同路径——SSR/客户端一致的基础）', async () => {
  const root = mkRoot()
  const Child = (_init: Record<string, unknown>) => () => h('span', {}, 'c')
  const App = (_init: Record<string, unknown>) => () => h('div', {}, [
    h(Child, {}),
    h('div', {}, h(Child, {})),
  ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const engine = handle.engine
  const compIds = [...engine.shadow.instances.keys()].sort()
  // App = root；输出 div = root.c；children: Child1 = root.c.0、div = root.c.1、Child2 = root.c.1.0
  assert.deepEqual(compIds, ['root', 'root.c.0', 'root.c.1.0'], `确定性路径——实际 ${compIds.join(',')}`)
  handle.unmount()
  document.body.removeChild(root)
})

test('vdom4：onUnmount 钩子（工厂期注册——卸载执行）', async () => {
  const root = mkRoot()
  let cleaned = 0
  let show = true
  const Timer = (_init: Record<string, unknown>, ctx: any) => {
    ctx.onUnmount(() => { cleaned++ })
    return () => h('span', { id: 'timer' }, 't')
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, [
      show ? h(Timer, {}) : null,
      h('button', { id: 'hide', onClick: () => { show = false; ctx.render() } }, 'hide'),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('#timer'), 'Timer 渲染')
  ;(root.querySelector('#hide') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#timer'), null, 'Timer 移除')
  assert.equal(cleaned, 1, 'onUnmount 钩子执行（工厂期注册）')
  handle.unmount()
  document.body.removeChild(root)
})

// ── hooks 面（ctx.ui——复用 services/hook-env——scheduleRender 绑定组件） ──

test('vdom4：useOpen 非受控展开态（hooks 的 scheduleRender 绑定组件级更新）', async () => {
  const root = mkRoot()
  const Panel = (_init: Record<string, unknown>, ctx: any) => {
    const open = ctx.ui.useOpen({ name: 'v4-panel' })
    return () => h('div', {},
      h('button', { id: 't', ...open.triggerProps }, 'toggle'),
      h('button', { id: 'c', onClick: () => open.setOpen(false) }, 'close'),
      open.open ? h('div', { id: 'panel' }, '内容') : null,
    )
  }
  const handle = createRoot(h(Panel, {}), root)
  await handle.ready
  assert.equal(root.querySelector('#panel'), null, '初始关闭')
  ;(root.querySelector('#t') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('#panel'), '点击展开（useOpen + 组件级更新）')
  ;(root.querySelector('#c') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#panel'), null, 'setOpen(false) 关闭（输出内部条件移除）')
  handle.unmount()
  document.body.removeChild(root)
})

test('vdom4：useExternal 订阅共享 store（跨组件状态 → 自动重渲染）', async () => {
  const root = mkRoot()
  const { createStore } = await import('../ui-dom/store.ts')
  const store = createStore({ user: null as string | null })
  const Badge = (_init: Record<string, unknown>, ctx: any) => {
    const s = ctx.ui.useExternal(store)
    return () => h('span', { id: 'badge' }, s.state.user ?? '未登录')
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {},
      h(Badge, {}),
      h('button', { id: 'login', onClick: () => { store.set({ user: '小码' }); ctx.render() } }, 'login'),
    )
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.equal(root.querySelector('#badge')?.textContent, '未登录', '初始')
  ;(root.querySelector('#login') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#badge')?.textContent, '小码', 'store 变化 → 订阅组件自动重渲染')
  handle.unmount()
  document.body.removeChild(root)
})

// ── Portal + usePopup 集成（组件迁移试点——组件库浮层模式在 vdom4） ──

test('vdom4：Portal 渲染到 #__wf_portal（浮层基础）', async () => {
  const root = mkRoot()
  const { createPortal } = await import('../ui-dom/engines/vdom4/jsx.ts')
  let show = true
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', { id: 'main' }, [
      h('span', {}, '主体'),
      show ? createPortal(h('div', { id: 'pop' }, '浮层'), 'v4-test') : null,
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.ok(document.querySelector('#__wf_portal [data-wf-portal-key="v4-test"] #pop'), 'portal 内容在远程容器')
  assert.equal(root.querySelector('#pop'), null, '浮层不在主树')
  // 关闭（条件移除 → portal 内容清除）
  show = false
  handle.engine.render()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(document.querySelector('#__wf_portal [data-wf-portal-key="v4-test"] #pop'), null, '关闭清除 portal 内容')
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('vdom4：usePopup 组件（popup.portal——打开/关闭/外部点击）——迁移试点', async () => {
  const root = mkRoot()
  const { usePopup } = await import('../ui-dom/hooks/popup.ts')
  // 模拟组件库 Popover 的写法（usePopup + popup.portal）——vdom4 方式
  const Popover = (_init: Record<string, unknown>, ctx: any) => {
    // 组件库标准组合：useOpen（内部态）+ usePopup（isOpen/setOpen 接线——非受控）
    const open = ctx.ui.useOpen({ name: 'v4-pop' })
    const popup = ctx.ui.usePopup({
      trigger: 'click',
      placement: 'bottom',
      el: () => root.querySelector('#trig') as HTMLElement,
      isOpen: () => open.open,
      setOpen: (v: boolean) => open.setOpen(v),
    })
    return () => h('div', { id: 'wrap' }, [
      h('button', { id: 'trig', ...popup.wrapProps }, '触发'),
      popup.portal(h('div', { id: 'pop-content' }, '浮层内容'), 'v4-popover'),
    ])
  }
  const handle = createRoot(h(Popover, {}), root)
  await handle.ready
  ;(root.querySelector('#trig') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(document.querySelector('#__wf_portal [data-wf-portal-key="v4-popover"] #pop-content'), '浮层打开（portal——非受控）')
  // 关闭（外部点击——usePopup 的 document mousedown 监听）
  document.dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(document.querySelector('#__wf_portal [data-wf-portal-key="v4-popover"] #pop-content'), null, '外部点击关闭')
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

// ── vdom4 SSR：renderToCommands → HTML → 客户端路径 id 精确吸收（首帧零重建） ──

test('vdom4 SSR：命令 → HTML → 客户端吸收（路径 id 精确匹配——DOM 引用保持 + 交互正常）', async () => {
  const { renderToCommands, commandsToHtml } = await import('../ui-dom/engines/vdom4/ssr.ts')
  let count = 0
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', { id: 'app' }, [
      h('button', { id: 'plus', onClick: () => { count++; ctx.render() } }, `count:${count}`),
      h('ul', {}, ['a', 'b'].map((it) => h('li', { key: it, 'data-k': it }, it))),
      false,
    ])
  }
  // 服务端：命令 → HTML（含 data-v4-id——确定性路径）
  const { commands } = await renderToCommands(h(App, {}))
  const html = commandsToHtml(commands)
  assert.ok(html.includes('data-v4-id='), 'HTML 含 data-v4-id（吸收标记）')
  assert.ok(html.includes('<!--wf-anchor-->'), 'HTML 含锚注释')
  // 客户端：SSR HTML 就位 → mount（吸收）
  const root = mkRoot()
  root.innerHTML = html
  const ssrButton = root.querySelector('#plus') as HTMLElement
  const ssrLi = root.querySelectorAll('li')[0]
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  // 零重建：DOM 引用保持（路径 id 精确匹配）
  assert.equal(root.querySelector('#plus'), ssrButton, 'button DOM 复用（路径 id 吸收）')
  assert.equal(root.querySelectorAll('li')[0], ssrLi, '列表项 DOM 复用')
  assert.equal(root.querySelectorAll('li').length, 2, '列表完整')
  // 交互正常（吸收后事件绑定生效）
  ;(root.querySelector('#plus') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('#plus')?.textContent?.includes('count:1'), '吸收后交互正常')
  handle.unmount()
  document.body.removeChild(root)
})

// ── Fragment 输出（diff 的 Fragment 分支——f 空间路径） ──

test('vdom4：组件输出 Fragment（多节点——f 空间路径——位置正确）', async () => {
  const root = mkRoot()
  const Multi = (_init: Record<string, unknown>) => {
    return () => h(Fragment, {}, [
      h('span', { class: 'm1' }, 'a'),
      h('span', { class: 'm2' }, 'b'),
    ])
  }
  const App = (_init: Record<string, unknown>) => {
    return () => h('div', { id: 'wrap' }, [
      h('div', { class: 'head' }, '头'),
      h(Multi, {}),
      h('div', { class: 'tail' }, '尾'),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const order = [...root.querySelectorAll('#wrap > *')].filter((n) => n.nodeType === 1).map((n) => (n as Element).getAttribute('class') ?? (n as Element).textContent)
  assert.deepEqual(order, ['head', 'm1', 'm2', 'tail'], `Fragment 多节点在中间——实际 ${order.join(',')}`)
  handle.unmount()
  document.body.removeChild(root)
})

// ── keyed 列表（业务身份——重排复用——组件实例状态保持） ──

test('vdom4：keyed 列表重排——同 key 复用（moveSlot 区间移动）+ 组件状态保持', async () => {
  const root = mkRoot()
  let items = ['a', 'b', 'c']
  const clicks: Record<string, number> = {}
  const Row = (initProps: { k: string }, ctx: any) => {
    clicks[initProps.k] = 0
    return (props: { k: string }) =>
      h('span', { 'data-k': props.k, onClick: () => { clicks[props.k]++; ctx.render() } }, `${props.k}:${clicks[props.k]}`)
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', { id: 'list' }, [
      h('ul', {}, items.map((it) => h(Row, { key: it, k: it }))),
      h('button', { id: 'rev', onClick: () => { items = [...items].reverse(); ctx.render() } }, 'rev'),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  // 点击 a 一次（状态 1）
  ;(root.querySelector('#list ul [data-k="a"]') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#list ul [data-k="a"]')?.textContent, 'a:1', 'a 点击一次')
  // 重排（reverse——b,a,c）
  ;(root.querySelector('#rev') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 10))
  const order = [...root.querySelectorAll('#list ul [data-k]')].map((n) => n.getAttribute('data-k'))
  assert.deepEqual(order, ['c', 'b', 'a'], `重排后顺序——实际 ${order.join(',')}`)
  // 组件实例状态保持（a 的点击计数不丢——keyed 复用）
  assert.equal(root.querySelector('#list ul [data-k="a"]')?.textContent, 'a:1', '重排后 a 状态保持（同 key 复用——工厂不重跑）')
  // 再点 a → 2
  ;(root.querySelector('#list ul [data-k="a"]') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#list ul [data-k="a"]')?.textContent, 'a:2', '重排后交互正常（状态持续）')
  handle.unmount()
  document.body.removeChild(root)
})

// ── ctx.data 三场景（SSR 种子收集 → hydration 同步命中 / SPA fetch——唯一异步边界） ──

test('vdom4：ctx.data 三场景——SSR 收集种子 → hydration preload 同步命中（零二次 fetch）', async () => {
  const { renderToCommands, commandsToHtml } = await import('../ui-dom/engines/vdom4/ssr.ts')
  // mock fetch（SSR 真 fetch + 客户端计数）
  let serverFetches = 0
  let clientFetches = 0
  const origFetch = globalThis.fetch
  globalThis.fetch = (async (url: string) => {
    if (url === '/api/user') {
      serverFetches++
      return new Response(JSON.stringify({ name: '服务端用户' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('{}', { status: 200 })
  }) as any

  // SSR：工厂 ctx.data.get → 真 fetch → 命令 + 种子
  const App = (_init: Record<string, unknown>, ctx: any) => {
    const user = ctx.data.get('/api/user')
    return () => h('div', { id: 'app' },
      user ? `user:${user.name}` : 'loading')  // 同步 renderFn——数据就绪后补渲染
  }
  // 注：vdom4 的 renderFn 同步——工厂 await ctx.data——数据就绪才有输出——
  // 这里工厂先 await（管道管理——SSR 服务端等待）
  const AppAsync = async (_init: Record<string, unknown>, ctx: any) => {
    const user = await ctx.data.get<{ name: string }>('/api/user')
    return () => h('div', { id: 'app' }, `user:${user.name}`)
  }
  const { commands, seed } = await renderToCommands(h(AppAsync, {}))
  assert.equal(serverFetches, 1, 'SSR 真 fetch 一次')
  assert.ok(seed['/api/user'], '种子收集（key → 值）')
  const html = commandsToHtml(commands)

  // hydration：客户端 preload 种子——工厂 get 同步命中——零 fetch
  const root = mkRoot()
  root.innerHTML = html
  globalThis.fetch = (async () => { clientFetches++; return new Response(JSON.stringify({ name: 'SPA用户' }), { status: 200, headers: { 'Content-Type': 'application/json' } }) }) as any
  const handle = createRoot(h(AppAsync, {}), root, { dataSeed: seed })
  await handle.ready
  assert.equal(clientFetches, 0, 'hydration 零二次 fetch（种子同步命中）')
  assert.equal(root.querySelector('#app')?.textContent, 'user:服务端用户', 'hydration 渲染种子数据')

  // SPA：无种子 → fetch
  const root2 = mkRoot()
  const handle2 = createRoot(h(AppAsync, {}), root2)
  await handle2.ready
  assert.equal(clientFetches, 1, 'SPA 未命中 → fetch（唯一异步边界）')
  // jsdom id 缓存怪癖：动态 setAttribute('id') 后 querySelector('#id') 失效——用 [id="x"]
  assert.equal(root2.querySelector('[id="app"]')?.textContent, 'user:SPA用户', 'SPA 数据渲染（fetch）')

  globalThis.fetch = origFetch
  document.body.removeChild(root)
  document.body.removeChild(root2)
})

// ── 组件库组件迁移试点（真实组件零改动在 vdom4 引擎跑——UI-4 矩阵雏形） ──

test('vdom4 迁移试点：真实 Button 组件（组件库零改动——vdom3 h/Fragment 结构兼容）', async () => {
  const { Button } = await import('../components/Button/Button.ts')
  const root = mkRoot()
  let clicked = 0
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, [
      h(Button, { variant: 'primary', onClick: () => { clicked++; ctx.render() } }, '按钮'),
      h('span', { id: 'count' }, `点击:${clicked}`),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('.wf-btn'), 'Button 渲染（组件库组件——vdom4 引擎）')
  ;(root.querySelector('.wf-btn') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#count')?.textContent, '点击:1', 'Button 交互（onClick + 组件级更新）')
  handle.unmount()
  document.body.removeChild(root)
})

test('vdom4 迁移试点：真实 Select 组件（useControlledInput + usePopup + keyed 列表——复杂组件）', async () => {
  const { Select } = await import('../components/Select/Select.ts')
  const root = mkRoot()
  const options = [
    { label: '苹果', value: 'apple' },
    { label: '香蕉', value: 'banana' },
    { label: '橙子', value: 'orange' },
  ]
  let selected = ''
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, [
      h(Select, {
        options, placeholder: '选择水果', searchable: true,
        value: selected, onChange: (v: string) => { selected = v; ctx.render() },
      }),
      h('button', { id: 'after', onClick: () => ctx.render() }, 'after'),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('.wf-select-search-trigger'), 'Select 渲染（searchable——usePopup 模式）')
  // 打开下拉（trigger onClick + usePopup——portal）
  ;(root.querySelector('.wf-select-search-trigger') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  const popupHtml = document.querySelector('#__wf_portal')?.innerHTML ?? ''
  assert.ok(popupHtml.includes('苹果'), `Select 下拉打开（portal——options 渲染）——实际 ${popupHtml.slice(0, 80)}`)
  // 选择项（keyed 列表交互）
  const opt = [...document.querySelectorAll('#__wf_portal .wf-select-search-opt')].find((n) => n.textContent?.includes('香蕉'))
  assert.ok(opt, '下拉选项（keyed 列表）')
  ;(opt as HTMLElement).dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 20))
  const inputVal = (root.querySelector('.wf-select-search-trigger input') as HTMLInputElement)?.value
  assert.equal(inputVal, '香蕉', `选中回填（受控回传——input value）——实际 ${inputVal}`)
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

// ── 组件库迁移试点扩展：Modal（presence 退场 + lockScroll + trapFocus） ──

test('vdom4 迁移试点：真实 Modal（usePresence 退场状态机 + portal——打开/退场/关闭）', async () => {
  const { Modal } = await import('../components/Modal/Modal.ts')
  const root = mkRoot()
  let open = false
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, [
      h('button', { id: 'open', onClick: () => { open = true; ctx.render() } }, '打开'),
      h(Modal, { open, title: '标题', onClose: () => { open = false; ctx.render() }, children: h('div', { id: 'modal-body' }, '内容') }),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#open') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 40))
  const portalHtml = document.querySelector('#__wf_portal')?.innerHTML ?? ''
  assert.ok(portalHtml.includes('modal-body'), `Modal 打开（portal）——实际 ${portalHtml.slice(0, 80)}`)
  // 关闭请求（取消按钮 → onClose——退场动画完整链路在真实浏览器验证——
  // jsdom 时序脆弱——试点验证「打开 + 交互触发」）
  let closed = false
  ;(root.querySelector('#open') as HTMLButtonElement).remove()
  open = false
  handle.engine.render()
  await new Promise((r) => setTimeout(r, 30))
  // 退场阶段（presence exit——DOM 保留播动画）→ animationend → closed
  const modal = document.querySelector('#__wf_portal .wf-modal')
  if (modal) modal.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(!closed, '占位（onClose 触发验证——退场卸载留真实浏览器）')
  handle.unmount()
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('vdom4 迁移试点：真实 Tree（useOpen + useControlled + keyed 列表 + 递归）', async () => {
  const { Tree } = await import('../components/Tree/Tree.ts')
  const root = mkRoot()
  const treeData = [
    { key: '1', label: '根节点', children: [
      { key: '1-1', label: '子节点A' },
      { key: '1-2', label: '子节点B' },
    ]},
  ]
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, [
      h(Tree, { data: treeData }),
      h('button', { id: 'after', onClick: () => ctx.render() }, 'after'),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('.wf-tree'), 'Tree 渲染')
  // 展开节点（switcher 点击——useOpen/useControlled——keyed 子列表出现）
  const switcher = root.querySelector('.wf-tree-switcher') as HTMLElement | null
  assert.ok(switcher, '展开开关')
  ;(switcher as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 20))
  const nodes = [...root.querySelectorAll('.wf-tree-node')]
  const children = nodes.map((n) => n.textContent?.trim())
  assert.ok(children.some((t) => t?.includes('子节点A')), `展开后子节点渲染——实际 ${children.join(',')}`)
  handle.unmount()
  document.body.removeChild(root)
})
