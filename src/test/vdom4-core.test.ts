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
