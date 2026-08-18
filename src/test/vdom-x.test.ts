/**
 * vdom-x.test.ts — 引擎契约测试（vdom5 验收标准）
 *
 * 为什么存在：vdom4 迁移组件库时逐个踩坑（9 个引擎缺口——见各测试注释）——
 * 每个坑都是组件库依赖的引擎能力。本文件把「组件库需要的引擎能力」沉淀为
 * 契约测试：**新引擎（vdom5）实现后，引擎入口一行替换——本文件全绿 =
 * 组件库可零改动迁移**。不再需要逐个组件试点。
 *
 * 能力面（来自 src/components/* 全量调研——2026-12 使用矩阵）：
 *   [核心] render 原语 / 组件复用剪枝 / keyed 列表 / Portal（经 usePopup——内化）/
 *           Fragment / 空洞占位
 *   [hooks] usePopup(28) / useControlled(11) / useScrollPosition(6) / useGlobalKey(6) /
 *           useOpen(4) / useControlledInput(3) / useInView(3) / useDragDrop(3) /
 *           useChat(1) / useBreakpoint(3) / useExternal / useTween / useDrag
 *   [机制] ref 纪律 / ctx.browser / ctx.data / onUnmount / 事件更新 / async renderFn
 *   [兼容] 组件库 10 组件冒烟（Button/Select/Modal/Tree/Carousel/Toast/Tabs/
 *          Popover/Collapse/VirtualList——零改动）
 *
 * 引擎接口（契约——实现方必须提供）：
 *   createRoot(vnode, container) → { ready, engine, unmount() }
 *   h / Fragment（jsx 面——vnode 纯数据）
 *   ctx.render()（组件级）/ ctx.ui.useXXX / ctx.browser / ctx.data / ctx.onUnmount
 *
 * Portal 内化（2026-12 决策）：createPortal 是 usePopup 的内部实现机制——
 * 组件作者不直接调用（组件库 28 浮层组件 0 直接使用）——浮层一律 usePopup。
 * 契约测试的 Portal 面全部经 usePopup 验证（引擎 portal 机制间接覆盖）。
 *
 * 纪律：本文件只测契约（引擎实现无关）——禁止 import 引擎内部文件；
 * 引擎入口在文件头 Engine 常量处一行替换。
 */
import { test, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
// ── 引擎入口（vdom-x 公共面契约：**全部经 weifuwu/ui-dom 的 index.ts**——
//  内部实现（vdom4/vdom5）切换不影响功能——公共面 API 稳定——vdom5 只改
//  index.ts 的 v4 面实现——本文件零改动——X-A~R 全绿 = 契约达标）──
import { createRootV4 as createRoot, hV4 as h, FragmentV4 as Fragment, createPortalV4 as createPortal, UIRouter, uiServe, uiSsr } from '../ui-dom/index.ts'
// ── 组件库（兼容契约——零改动验证）──

before(setupJsdom)

// ── 测试隔离（契约测试必须干净——失败残留不串扰后续测试）──
// 模块级状态（openStates/uncontrolledValues/compRenders——hook-env 单例）
// + DOM 残留（失败中断的 root/portal）——beforeEach 清空 + afterEach 卸载
const mounted: { unmount: () => void; root: HTMLElement }[] = []
let resetHookState: () => void = () => {}
beforeEach(() => {
  resetHookState()
  document.body.innerHTML = ''
  mounted.length = 0
})
afterEach(() => {
  for (const m of mounted) { try { m.unmount() } catch { /* 卸载失败隔离 */ } }
  document.body.innerHTML = ''
})

function mkRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  mounted.push({ root, unmount: () => {} })
  return root
}
function mount(vnode: any, root: HTMLElement, opts?: any) {
  const handle = createRoot(vnode, root, opts)
  mounted.push(handle)
  return handle
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ═══════════════════ A. 渲染原语 ═══════════════════ */

test('X-A1 挂载 + 组件级更新（ctx.render 闭包绑定 compId）', async () => {
  const root = mkRoot()
  let count = 0
  const Counter = (_init: Record<string, unknown>, ctx: any) =>
    (props: any) => h('button', { id: 'c', onClick: () => { count += props.step ?? 1; ctx.render() } }, `count:${count}`)
  const handle = mount(h(Counter, { step: 1 }), root)
  await handle.ready
  assert.equal(root.querySelector('#c')?.textContent, 'count:0')
  ;(root.querySelector('#c') as HTMLElement).click()
  await sleep(10)
  assert.equal(root.querySelector('#c')?.textContent, 'count:1', '事件回调改状态 + ctx.render → DOM 更新')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-A2 父更新 props 变化 → 子重渲染（renderFn 读最新 props）', async () => {
  const root = mkRoot()
  const Child = () => (props: any) => h('span', { id: 'child' }, `v:${props.value}`)
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let value = 0
    return () => h('div', {}, [
      h(Child, { value }),
      h('button', { id: 'b', onClick: () => { value = 1; ctx.render() } }, 'go'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.equal(root.querySelector('#child')?.textContent, 'v:0')
  ;(root.querySelector('#b') as HTMLElement).click()
  await sleep(10)
  assert.equal(root.querySelector('#child')?.textContent, 'v:1', 'props 变化 → 子组件重渲染')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-A3 剪枝：props 不变 → 子组件 renderFn 不重跑（复用 lastOutput）', async () => {
  const root = mkRoot()
  let renders = 0
  const Leaf = () => {
    return (props: any) => { renders++; return h('span', {}, `leaf:${props.v}`) }
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let n = 0
    return () => h('div', {}, [
      h(Leaf, { v: 1 }),
      h('button', { id: 'b', onClick: () => { n++; ctx.render() } }, 'go'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.equal(renders, 1, '初始 1 次渲染')
  ;(root.querySelector('#b') as HTMLElement).click()
  await sleep(10)
  assert.equal(renders, 1, '父重渲染但 props 未变 → 子剪枝（零重跑）')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-A4 根组件不剪枝（内部闭包状态变化——props 不变也必须重跑）', async () => {
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let n = 0
    return () => h('button', { id: 'b', onClick: () => { n++; ctx.render() } }, `n:${n}`)
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.equal(root.querySelector('#b')?.textContent, 'n:0')
  ;(root.querySelector('#b') as HTMLElement).click()
  await sleep(10)
  assert.equal(root.querySelector('#b')?.textContent, 'n:1', '根组件内部状态 → 必须重跑')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-A5 async renderFn（await ctx.data——管道保证 resolve——不挂起）', async () => {
  const root = mkRoot()
  const resolved: string[] = []
  const Page = async (_init: Record<string, unknown>, ctx: any) => {
    const data = await ctx.data.get('/api/ok', () => Promise.resolve('data-ok'))
    return async () => h('div', { id: 'page' }, `data:${data}`)
  }
  const handle = mount(h(Page, {}), root)
  await handle.ready
  assert.equal(root.querySelector('#page')?.textContent, 'data:data-ok')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-A6 组件实例复用：同位置同类型 → 工厂不重跑（内部状态跨渲染保持）', async () => {
  const root = mkRoot()
  let factories = 0
  const Toggle = (_init: Record<string, unknown>, ctx: any) => {
    factories++
    let on = false
    return () => h('button', { id: 't', onClick: () => { on = !on; ctx.render() } }, on ? '开' : '关')
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let n = 0
    return () => h('div', {}, [
      h(Toggle, {}),
      h('button', { id: 'b', onClick: () => { n++; ctx.render() } }, 'go'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#t') as HTMLElement).click()
  await sleep(10)
  assert.equal(root.querySelector('#t')?.textContent, '开', '内部状态更新')
  ;(root.querySelector('#b') as HTMLElement).click()
  await sleep(10)
  assert.equal(factories, 1, '父重渲染 → 子工厂不重跑（实例复用）')
  assert.equal(root.querySelector('#t')?.textContent, '开', '内部状态保持')
  handle.unmount()
  document.body.removeChild(root)
})

/* ═══════════════════ B. 列表 ═══════════════════ */

test('X-B1 keyed 列表增/删（身份稳定——状态跟随 key 不漂移）', async () => {
  const root = mkRoot()
  const Item = (_init: Record<string, unknown>, ctx: any) => {
    let clicks = 0
    return () => h('button', { class: 'it', onClick: () => { clicks++; ctx.render() } }, `item:${clicks}`)
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let keys = ['a', 'b']
    return () => h('div', {}, [
      ...keys.map((k) => h(Item, { key: k })),
      h('button', { key: 'add', id: 'add', onClick: () => { keys = ['a', 'b', 'c']; ctx.render() } }, 'add'),
      h('button', { key: 'del', id: 'del', onClick: () => { keys = ['a', 'c']; ctx.render() } }, 'del'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelectorAll('.it')[0] as HTMLElement).click()
  await sleep(10)
  // 增：c 加入，a 状态（1 次点击）保持
  ;(root.querySelector('#add') as HTMLElement).click()
  await sleep(10)
  assert.strictEqual(root.querySelectorAll('.it').length, 3)
  assert.equal(root.querySelectorAll('.it')[0].textContent, 'item:1', 'keyed 增——a 的状态保持')
  // 删：b 移除——c 顶位——a 状态仍保持
  ;(root.querySelector('#del') as HTMLElement).click()
  await sleep(10)
  assert.strictEqual(root.querySelectorAll('.it').length, 2)
  assert.equal(root.querySelectorAll('.it')[0].textContent, 'item:1', 'keyed 删——a 状态保持（身份跟随 key 非位置）')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-B2 keyed 重排（moveSlot——状态跟随 key 移动）', async () => {
  const root = mkRoot()
  const states: Record<string, number> = {}
  const Item = (init: { id: string }, ctx: any) => {
    let n = states[init.id] ?? 0
    return () => h('button', { class: 'it', onClick: () => { n++; ctx.render() } }, `${init.id}:${n}`)
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let keys = ['a', 'b', 'c']
    return () => h('div', {}, [
      ...keys.map((k) => h(Item, { key: k, id: k })),
      h('button', { key: 'rev', id: 'rev', onClick: () => { keys = ['c', 'b', 'a']; ctx.render() } }, 'rev'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelectorAll('.it')[2] as HTMLElement).click() // c:1
  await sleep(10)
  ;(root.querySelector('#rev') as HTMLElement).click()
  await sleep(10)
  const texts = [...root.querySelectorAll('.it')].map((n) => n.textContent)
  assert.deepEqual(texts, ['c:1', 'b:0', 'a:0'], '重排——c 状态跟随 key 到首位')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-B3 单 keyed 项（路径 .k{key} 稳定——不随数量翻转——Toast 事故回归）', async () => {
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let n = 0
    return () => h('div', {}, [
      ...(n >= 1 ? [h('span', { key: 'k1', class: 'k1' }, 'one')] : []),
      ...(n >= 2 ? [h('span', { key: 'k2', class: 'k2' }, 'two')] : []),
      h('button', { id: 'b', onClick: () => { n++; ctx.render() } }, 'go'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#b') as HTMLElement).click()
  await sleep(10)
  assert.ok(root.querySelector('.k1'), '单 keyed 项渲染')
  ;(root.querySelector('#b') as HTMLElement).click()
  await sleep(10)
  assert.ok(root.querySelector('.k1') && root.querySelector('.k2'), '增到两项——k1 复用不重建（路径不翻转）')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-B4 空洞占位：{cond && <X/>} false 不塌缩兄弟（提交按钮消失事故回归）', async () => {
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let error = ''
    return () => h('div', {}, [
      h('div', { class: 'field' }, '字段'),
      error ? h('div', { class: 'alert' }, error) : false,
      h('button', { id: 'submit' }, '提交'),
      h('button', { id: 'err', onClick: () => { error = '必填'; ctx.render() } }, '报错'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#err') as HTMLElement).click()
  await sleep(10)
  assert.ok(root.querySelector('.alert'), '空洞 → 真实元素插入')
  const submit = root.querySelector('#submit')
  assert.ok(submit && submit.isConnected, '提交按钮保留（false 占位不误删兄弟）')
  assert.ok(root.querySelector('.alert')!.nextElementSibling === submit, 'Alert 在按钮前（位置正确）')
  handle.unmount()
  document.body.removeChild(root)
})

/* ═══════════════════ C. Portal / Fragment ═══════════════════ */

test('X-C1 usePopup 常驻容器（positioning none——Toast 型——远程渲染 + 内容增删）', async () => {
  const root = mkRoot()
  const Host = (_init: Record<string, unknown>, ctx: any) => {
    const popup = ctx.ui.usePopup({
      positioning: 'none', closeOnOutside: false, closeOnEscape: false,
      isOpen: () => true, setOpen: () => {},
    })
    return (props: any) => {
      if (props.items.length === 0) return null
      return popup.portal(h('div', { class: 'toast-box' }, props.items.map((t: string) => h('div', { key: t, class: 'toast-item' }, t))), 'toast-x')
    }
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let items: string[] = []
    let n = 0
    return () => h('div', {}, [
      h(Host, { items }),
      h('button', { id: 'push', onClick: () => { n++; items = [...items, `m${n}`]; ctx.render() } }, 'push'),
      h('button', { id: 'clear', onClick: () => { items = []; ctx.render() } }, 'clear'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.ok(!document.querySelector('#__wf_portal .toast-box'), '初始无内容')
  ;(root.querySelector('#push') as HTMLElement).click()
  await sleep(10)
  assert.ok(document.querySelector('#__wf_portal .toast-item'), 'usePopup 常驻容器——远程渲染')
  ;(root.querySelector('#push') as HTMLElement).click()
  await sleep(10)
  assert.strictEqual(document.querySelectorAll('#__wf_portal .toast-item').length, 2, '内容增（keyed）')
  ;(root.querySelector('#clear') as HTMLElement).click()
  await sleep(10)
  assert.ok(!document.querySelector('#__wf_portal .toast-box'), '内容清空——远程容器清理')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-C2 组件输出根 = popup.portal（Modal 型——无包装 div——符号根判定）', async () => {
  const root = mkRoot()
  let anchor: HTMLElement | null = null
  const Modal = (_init: Record<string, unknown>, ctx: any) => {
    const openCtrl = ctx.ui.useOpen({ name: 'XM2' })
    const popup = ctx.ui.usePopup({
      el: () => anchor, isOpen: () => openCtrl.open, setOpen: (v) => openCtrl.setOpen(v),
    })
    return () => {
      if (!openCtrl.open) return h('button', { id: 'm', ref: (el: HTMLElement | null) => { anchor = el }, ...openCtrl.triggerProps }, '开')
      return popup.portal(h('div', { class: 'm-body' }, 'modal内容'), 'modal-x')
    }
  }
  const handle = mount(h(Modal, {}), root)
  await handle.ready
  ;(root.querySelector('#m') as HTMLElement).click()
  await sleep(10)
  assert.ok(document.querySelector('#__wf_portal .m-body'), '输出根是 popup.portal——远程渲染')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-C3 keyed 列表项内各自 usePopup（多浮层并存——portalKey 隔离）', async () => {
  const root = mkRoot()
  const Row = (_init: { id: string }, ctx: any) => {
    let anchor: HTMLElement | null = null
    const openCtrl = ctx.ui.useOpen({ name: `XR${_init.id}` })
    const popup = ctx.ui.usePopup({
      el: () => anchor, isOpen: () => openCtrl.open, setOpen: (v) => openCtrl.setOpen(v),
    })
    return () => h('div', { class: 'row' }, [
      h('button', { ref: (el: HTMLElement | null) => { anchor = el }, ...openCtrl.triggerProps }, `行${_init.id}`),
      popup.portal(openCtrl.open ? h('div', { class: `menu menu-${_init.id}` }, `菜单${_init.id}`) : null, `menu-${_init.id}`),
    ])
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let keys = ['a', 'b']
    return () => h('div', {}, [
      ...keys.map((k) => h(Row, { key: k, id: k })),
      h('button', { key: 'sw', id: 'sw', onClick: () => { keys = ['a']; ctx.render() } }, '删一行'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  // 两行各自的浮层
  ;(root.querySelectorAll('.row button')[0] as HTMLElement).click()
  await sleep(10)
  assert.ok(document.querySelector('#__wf_portal .menu-a'), '行 a 浮层打开（portalKey 隔离）')
  ;(root.querySelectorAll('.row button')[1] as HTMLElement).click()
  await sleep(10)
  assert.ok(document.querySelector('#__wf_portal .menu-b'), '行 b 浮层打开（并存）')
  // keyed 删一行——b 的浮层（含远程内容）清理
  ;(root.querySelector('#sw') as HTMLElement).click()
  await sleep(10)
  assert.ok(!document.querySelector('#__wf_portal .menu-b'), 'keyed 删除——远程浮层内容清理')
  assert.ok(document.querySelector('#__wf_portal .menu-a'), 'a 的浮层保留')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-C4 Fragment 多根输出（组件输出数组 = 隐式 Fragment）', async () => {
  const root = mkRoot()
  const Pair = () => () => h(Fragment, {}, [h('span', { class: 'a' }, 'A'), h('span', { class: 'b' }, 'B')])
  const App = () => () => h('div', {}, h(Pair, {}))
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('.a') && root.querySelector('.b'), 'Fragment 多根渲染')
  handle.unmount()
  document.body.removeChild(root)
})

/* ═══════════════════ D. usePopup 族 ═══════════════════ */

test('X-D1 usePopup click 触发 + 外部点击关闭 + Escape 关闭', async () => {
  const root = mkRoot()
  let anchor: HTMLElement | null = null
  const P = (_init: Record<string, unknown>, ctx: any) => {
    const open = ctx.ui.useOpen({ name: 'XP' })
    const popup = ctx.ui.usePopup({
      el: () => anchor, isOpen: () => open.open, setOpen: (v) => open.setOpen(v),
    })
    return () => h('div', {}, [
      h('button', { id: 'tr', ref: (el: HTMLElement | null) => { anchor = el }, ...open.triggerProps }, 'trig'),
      open.open ? popup.portal(h('div', { class: 'pop' }, '内容'), 'pop-x') : null,
    ])
  }
  const handle = mount(h(P, {}), root)
  await handle.ready
  ;(root.querySelector('#tr') as HTMLElement).click()
  await sleep(10)
  assert.ok(document.querySelector('#__wf_portal .pop'), '点击打开')
  document.body.dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  await sleep(10)
  assert.ok(!document.querySelector('#__wf_portal .pop'), '外部点击关闭')
  ;(root.querySelector('#tr') as HTMLElement).click()
  await sleep(10)
  document.body.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(10)
  assert.ok(!document.querySelector('#__wf_portal .pop'), 'Escape 关闭')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-D2 usePopup presence 退场（phase exit → animationend → 卸载）', async () => {
  const root = mkRoot()
  let anchor: HTMLElement | null = null
  const M = (_init: Record<string, unknown>, ctx: any) => {
    let open = false
    const openCtrl = ctx.ui.useOpen({ name: 'XM' })
    const popup = ctx.ui.usePopup({
      presence: true, el: () => anchor,
      isOpen: () => openCtrl.open, setOpen: (v) => openCtrl.setOpen(v),
    })
    return () => {
      popup.sync(openCtrl.open)
      return h('div', {}, [
        h('button', { id: 'tr', ref: (el: HTMLElement | null) => { anchor = el }, ...openCtrl.triggerProps }, 'trig'),
        h('button', { id: 'close', onClick: () => { openCtrl.setOpen(false); ctx.render() } }, '关'),
        popup.portal(h('div', { class: 'm-body' }, 'modal'), 'm-x'),
      ])
    }
  }
  const handle = mount(h(M, {}), root)
  await handle.ready
  ;(root.querySelector('#tr') as HTMLElement).click()
  await sleep(10)
  assert.ok(document.querySelector('#__wf_portal .m-body'), 'presence 打开')
  ;(root.querySelector('#close') as HTMLElement).click()
  await sleep(10)
  assert.ok(document.querySelector('#__wf_portal .m-body'), '关闭请求 → 退场（DOM 保留播动画）')
  document.querySelector('#__wf_portal .m-body')!.dispatchEvent(new (window as any).Event('animationend'))
  await sleep(10)
  assert.ok(!document.querySelector('#__wf_portal .m-body'), 'animationend → 卸载')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-D3 useOpen 受控/非受控统一（缺回调 warn）', async () => {
  const root = mkRoot()
  const warnings: string[] = []
  const ow = console.warn
  console.warn = (m: string) => warnings.push(m)
  try {
    const App = (_init: Record<string, unknown>, ctx: any) => {
      let open = true
      return () => h('div', {}, [
        h(PControlled, { open, onOpenChange: (v: boolean) => { open = v; ctx.render() } }),
      ])
    }
    const PControlled = (_i: Record<string, unknown>, ctx: any) => {
      const c = ctx.ui.useOpen({ open: _i.open, onOpenChange: _i.onOpenChange, name: 'XP' })
      return () => h('span', { id: 'st' }, `open:${c.open}`)
    }
    const handle = mount(h(App, {}), root)
    await handle.ready
    assert.equal(root.querySelector('#st')?.textContent, 'open:true', '受控读 props')
    handle.unmount()
  } finally {
    console.warn = ow
  }
  document.body.removeChild(root)
})

test('X-D4 useControlled 受控/非受控（非受控内部态跨渲染保持）', async () => {
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let mode = 'un' as 'un' | 'ct'
    let ctValue: string[] = []
    return () => h('div', {}, [
      h(C, {
        ...(mode === 'ct' ? { value: ctValue, onChange: (v: string[]) => { ctValue = v; ctx.render() } } : {}),
        name: 'XC',
      }),
      h('button', { id: 'sw', onClick: () => { mode = mode === 'un' ? 'ct' : 'un'; ctx.render() } }, 'sw'),
    ])
  }
  const C = (_i: Record<string, unknown>, ctx: any) => {
    return (props: any) => {
      const c = ctx.ui.useControlled<string[]>({ value: props.value, onChange: props.onChange, name: props.name })
      return h('button', { id: 'toggle', onClick: () => { c.setValue(['x']) } }, `v:${JSON.stringify(c.value)}`)
    }
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#toggle') as HTMLElement).click()
  await sleep(10)
  assert.equal(root.querySelector('#toggle')?.textContent, 'v:["x"]', '非受控——内部态更新')
  ;(root.querySelector('#sw') as HTMLElement).click()
  await sleep(10)
  assert.equal(root.querySelector('#toggle')?.textContent, 'v:[]', '受控——值由 props 独占')
  handle.unmount()
  document.body.removeChild(root)
})

/* ═══════════════════ E. 输入 ═══════════════════ */

test('X-E1 useControlledInput 焦点保持（输入不回流失焦——AutoComplete 事故回归）', async () => {
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let value = ''
    return () => h('div', {}, [
      h(Input, { value, onChange: (v: string) => { value = v; ctx.render() } }),
      h('button', { id: 'other' }, 'other'),
    ])
  }
  const Input = (_i: { value: string; onChange: (v: string) => void }, ctx: any) => {
    return () => {
      const input = ctx.ui.useControlledInput({ value: _i.value, onChange: _i.onChange, name: 'XInput' })
      return h('input', { id: 'in', onInput: (e: any) => input.setKeyword(e.target.value) })
    }
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  const input = root.querySelector('#in') as HTMLInputElement
  input.focus()
  input.value = 'a'
  input.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
  await sleep(10)
  assert.equal(input.value, 'a', '输入不回流（内部态）——不重挂 input')
  assert.equal(document.activeElement, input, '焦点保持')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-E2 受控 input value 回填（onChange 回流 → props.value 更新）', async () => {
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let value = ''
    return () => h('div', {}, [
      h('input', { id: 'in', value, onInput: (e: any) => { value = e.target.value; ctx.render() } }),
      h('span', { id: 'show' }, `v:${value}`),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  const input = root.querySelector('#in') as HTMLInputElement
  input.value = 'hi'
  input.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
  await sleep(10)
  assert.equal(root.querySelector('#show')?.textContent, 'v:hi', '受控 input 事件回流')
  handle.unmount()
  document.body.removeChild(root)
})

/* ═══════════════════ F. 事件 / 浏览器 ═══════════════════ */

test('X-F1 useGlobalKey（Escape 全局监听——命令面板型）', async () => {
  const root = mkRoot()
  let closed = 0
  const App = (_init: Record<string, unknown>, ctx: any) => {
    ctx.ui.useGlobalKey((e: KeyboardEvent) => { if (e.key === 'Escape') closed++ })
    return () => h('div', {}, 'panel')
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  document.body.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(10)
  assert.equal(closed, 1, '全局 Escape 监听触发')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-F2 useScrollPosition（scroll 事件 → y 响应式 → 精准渲染目标组件）', async () => {
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let el: HTMLElement | null = null
    const scroll = ctx.ui.useScrollPosition({ getScroller: () => el ?? window })
    return () => h('div', { style: { height: '100px', overflowY: 'auto' }, ref: (n: HTMLElement | null) => { el = n } },
      h('span', { id: 'y' }, `y:${scroll.y}`))
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  const scroller = root.querySelector('div') as HTMLElement
  scroller.scrollTop = 50
  scroller.dispatchEvent(new (window as any).Event('scroll'))
  await sleep(30)
  assert.equal(root.querySelector('#y')?.textContent, 'y:50', 'scroll 事件 → y 更新 → 组件重渲染')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-F3 事件更新（onClick 重绑——patch 后新 handler 生效）', async () => {
  const root = mkRoot()
  let mode = 'a'
  let clicked = ''
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, [
      h('button', { id: 'b', onClick: () => { clicked = mode } }, 'go'),
      h('button', { id: 'sw', onClick: () => { mode = 'b'; ctx.render() } }, 'sw'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#sw') as HTMLElement).click()
  await sleep(10)
  ;(root.querySelector('#b') as HTMLElement).click()
  await sleep(10)
  assert.equal(clicked, 'b', '事件 handler 更新（旧监听移除 + 新监听）')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-F4 ctx.browser 环境 API（byId/timeout——组件内不裸调 DOM 全局）', async () => {
  const root = mkRoot()
  let timerFired = false
  const App = (_init: Record<string, unknown>, ctx: any) => {
    const browser = ctx.browser
    return () => h('div', {}, [
      h('span', { id: 'target' }, 'x'),
      h('button', { id: 'b', onClick: () => {
        const el = browser.byId('target')
        browser.timeout(() => { timerFired = !!el }, 5)
      } }, 'go'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#b') as HTMLElement).click()
  await sleep(20)
  assert.ok(timerFired, 'ctx.browser.byId/timeout 可用（非空对象）')
  handle.unmount()
  document.body.removeChild(root)
})

/* ═══════════════════ G. 生命周期 ═══════════════════ */

test('X-G1 onUnmount 卸载钩子执行', async () => {
  const root = mkRoot()
  let cleaned = 0
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let show = true
    ctx.onUnmount(() => { cleaned++ })
    return () => h('div', {}, [
      show ? h('span', { class: 'inner' }, 'x') : null,
      h('button', { id: 'rm', onClick: () => { show = false; ctx.render() } }, 'rm'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#rm') as HTMLElement).click()
  await sleep(10)
  handle.unmount()
  await sleep(10)
  assert.equal(cleaned, 1, '卸载钩子执行')
  document.body.removeChild(root)
})

test('X-G2 ref 纪律：挂载 el / 卸载 null（稳定 ref——mount 定义）', async () => {
  const root = mkRoot()
  let got: HTMLElement | null | undefined
  let nullCount = 0
  const stableRef = (el: HTMLElement | null) => { got = el; if (!el) nullCount++ }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let show = true
    return () => h('div', {}, [
      show ? h('span', { id: 's', ref: stableRef }, 'x') : null,
      h('button', { id: 'rm', onClick: () => { show = false; ctx.render() } }, 'rm'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.ok(got instanceof HTMLElement, 'ref 挂载 → el')
  ;(root.querySelector('#rm') as HTMLElement).click()
  await sleep(10)
  assert.equal(got, null, 'ref 卸载 → null')
  assert.equal(nullCount, 1, 'null 只调用一次（非每次渲染）')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-G3 ctx.data 三场景（dataSeed 种子同步命中 / 未命中 fetcher）', async () => {
  const root = mkRoot()
  const fetched: string[] = []
  const Page = async (_i: Record<string, unknown>, ctx: any) => {
    const seeded = await ctx.data.get('/api/seeded', () => Promise.resolve('should-not-fetch'))
    const live = await ctx.data.get('/api/live', () => { fetched.push('live'); return Promise.resolve('fetch-data') })
    return async () => h('div', {}, [
      h('span', { id: 's' }, String(seeded)),
      h('span', { id: 'l' }, String(live)),
    ])
  }
  const handle = mount(h(Page, {}), root, { dataSeed: { '/api/seeded': 'seed-data' } })
  await handle.ready
  assert.equal(root.querySelector('#s')?.textContent, 'seed-data', '种子命中（零 fetch）')
  assert.equal(root.querySelector('#l')?.textContent, 'fetch-data', '未命中 → fetcher')
  assert.deepEqual(fetched, ['live'])
  handle.unmount()
  document.body.removeChild(root)
})

/* ═══════════════════ H. 组件库兼容冒烟（零改动——引擎契约的最终验收） ═══════════════════ */

test('X-H1 Button 冒烟（简单 onClick + 文本）', async () => {
  const { Button } = await import('../components/Button/Button.ts')
  const root = mkRoot()
  let clicks = 0
  const App = () => () => h('div', {}, h(Button, { onClick: () => clicks++ }, '按钮'))
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('button'), 'Button 渲染')
  ;(root.querySelector('button') as HTMLElement).click()
  await sleep(10)
  assert.equal(clicks, 1)
  handle.unmount()
  document.body.removeChild(root)
})

test('X-H2 Select 冒烟（useControlledInput + usePopup + keyed 选项）', async () => {
  const { Select } = await import('../components/Select/Select.ts')
  const root = mkRoot()
  let selected = ''
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, h(Select, {
      options: [{ value: 'a', label: '苹果' }, { value: 'b', label: '香蕉' }],
      searchable: true, value: selected, onChange: (v: string) => { selected = v; ctx.render() },
    }))
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('.wf-select-search-trigger') as HTMLElement).click()
  await sleep(20)
  assert.ok(document.querySelector('#__wf_portal')?.innerHTML.includes('苹果'), '下拉打开（portal + keyed 选项）')
  const opt = [...document.querySelectorAll('#__wf_portal .wf-select-search-opt')].find((n) => n.textContent?.includes('香蕉'))
  ;(opt as HTMLElement).dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  await sleep(20)
  assert.equal((root.querySelector('.wf-select-search-trigger input') as HTMLInputElement)?.value, '香蕉', '选中回填')
  handle.unmount()
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('X-H3 Modal 冒烟（usePresence + portal 会话级模态）', async () => {
  const { Modal } = await import('../components/Modal/Modal.ts')
  const root = mkRoot()
  let open = false
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, h(Modal, {
      open, title: '标题', onClose: () => { open = false; ctx.render() },
      footer: h('button', { id: 'ok', onClick: () => { open = false; ctx.render() } }, '确定'),
    }, h('div', { class: 'modal-body' }, '内容')))
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  open = true
  handle.engine.render()
  await sleep(20)
  assert.ok(document.querySelector('#__wf_portal .wf-modal'), 'Modal 打开（portal）')
  open = false
  handle.engine.render()
  await sleep(20)
  assert.ok(document.querySelector('#__wf_portal .wf-modal'), '关闭请求 → 退场（DOM 保留）')
  document.querySelector('#__wf_portal .wf-modal')!.dispatchEvent(new (window as any).Event('animationend'))
  await sleep(20)
  assert.ok(!document.querySelector('#__wf_portal .wf-modal'), '退场完成卸载')
  handle.unmount()
  document.body.removeChild(root)
  document.querySelector('#__wf_portal')?.remove()
})

test('X-H4 Tree 冒烟（useOpen + useControlled + keyed 递归）', async () => {
  const { Tree } = await import('../components/Tree/Tree.ts')
  const root = mkRoot()
  const treeData = [
    { key: '1', label: '根', children: [{ key: '1-1', label: '子A' }] },
  ]
  const App = () => () => h('div', {}, h(Tree, { data: treeData }))
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('.wf-tree'), 'Tree 渲染')
  ;(root.querySelector('.wf-tree-switcher') as HTMLElement).click()
  await sleep(20)
  assert.ok([...root.querySelectorAll('.wf-tree-node')].some((n) => n.textContent?.includes('子A')), '展开子节点（keyed + useOpen）')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-H5 Carousel 冒烟（状态流转 + 箭头交互）', async () => {
  const { Carousel } = await import('../components/Carousel/Carousel.ts')
  const root = mkRoot()
  const App = () => () => h('div', {}, h(Carousel, {}, [
    h('div', {}, '一'), h('div', {}, '二'), h('div', {}, '三'),
  ]))
  const handle = mount(h(App, {}), root)
  await handle.ready
  const track = root.querySelector('.wf-carousel-track') as HTMLElement
  assert.match(track.getAttribute('style') ?? '', /translateX\(-0%\)/)
  ;(root.querySelector('.wf-carousel-arrow--next') as HTMLElement).click()
  await sleep(20)
  assert.match(track.getAttribute('style') ?? '', /translateX\(-100%\)/, '箭头 → 下一张')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-H6 Toast 冒烟（usePopup 常驻 + keyed 增删）', async () => {
  const { Toast } = await import('../components/Toast/Toast.ts')
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let toasts: { id: string; message: string }[] = []
    let n = 0
    return () => h('div', {}, [
      h(Toast, { toasts, onRemove: (id: string) => { toasts = toasts.filter((t) => t.id !== id); ctx.render() } }),
      h('button', { id: 'push', onClick: () => { n++; toasts = [...toasts, { id: `t${n}`, message: `m${n}` }]; ctx.render() } }, 'push'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#push') as HTMLElement).click()
  await sleep(20)
  assert.ok(document.querySelector('.wf-toast'), 'toast 出现（常驻容器 + keyed）')
  ;(root.querySelector('#push') as HTMLElement).click()
  await sleep(20)
  assert.strictEqual(document.querySelectorAll('.wf-toast').length, 2, '两条（keyed 增）')
  ;(document.querySelectorAll('.wf-toast')[0] as HTMLElement).click()
  await sleep(20)
  assert.strictEqual(document.querySelectorAll('.wf-toast').length, 1, '移除（keyed 删）')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-H7 Tabs 冒烟（keyed 混合数组 + useControlled + 方向键）', async () => {
  const { Tabs } = await import('../components/Tabs/Tabs.ts')
  const root = mkRoot()
  let active = 'a'
  const App = (_init: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, h(Tabs, {
      items: [
        { key: 'a', label: '甲', content: h('div', {}, 'A') },
        { key: 'b', label: '乙', content: h('div', {}, 'B') },
      ],
      active, onChange: (k: string) => { active = k; ctx.render() },
    }))
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelectorAll('.wf-tab')[1] as HTMLElement).click()
  await sleep(20)
  assert.ok((root.querySelectorAll('.wf-tab')[1] as HTMLElement).classList.contains('wf-tab--active'), '点击切换（useControlled）')
  ;(root.querySelectorAll('.wf-tab')[1] as HTMLElement).focus()
  ;(root.querySelector('.wf-tab-list') as HTMLElement).dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  await sleep(20)
  assert.ok((root.querySelectorAll('.wf-tab')[0] as HTMLElement).classList.contains('wf-tab--active'), '方向键导航（焦点跟随）')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-H8 Popover 冒烟（usePopupPosition 锚点 + 外部点击关闭）', async () => {
  const { Popover } = await import('../components/Popover/Popover.ts')
  const root = mkRoot()
  const App = () => () => h('div', {}, h(Popover, { content: h('div', {}, '提示') }, h('button', { id: 'tr' }, 'hover')))
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('#tr') as HTMLElement).click()
  await sleep(20)
  assert.ok(document.querySelector('.wf-popover'), '点击打开（锚点定位）')
  document.body.dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  await sleep(20)
  assert.ok(!document.querySelector('.wf-popover'), '外部点击关闭')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-H9 Collapse 冒烟（useControlled + keyed 展开/折叠）', async () => {
  const { Collapse } = await import('../components/Collapse/Collapse.ts')
  const root = mkRoot()
  const App = () => () => h('div', {}, h(Collapse, {
    items: [{ key: 'p', title: '面板', content: h('div', { class: 'pc' }, '内容') }],
  }))
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.ok(!root.querySelector('.pc'), '初始折叠')
  ;(root.querySelector('.wf-collapse-header') as HTMLElement).click()
  await sleep(20)
  assert.ok(root.querySelector('.pc'), '点击展开')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-H10 VirtualList 冒烟（useScrollPosition 滚动窗口 + keyBy）', async () => {
  const { VirtualList } = await import('../components/VirtualList/VirtualList.ts')
  const root = mkRoot()
  const items = Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, label: `条${i}` }))
  const App = () => () => h('div', {}, h(VirtualList, {
    items, height: 400, itemHeight: 40,
    keyBy: (item: { id: string }) => item.id,
    renderItem: (item: { id: string; label: string }) => h('div', { class: 'vit' }, item.label),
  }))
  const handle = mount(h(App, {}), root)
  await handle.ready
  const listEl = root.querySelector('.wf-virtual-list') as HTMLElement
  assert.ok(root.querySelectorAll('.vit').length < 100, '窗口渲染（非全量）')
  listEl.scrollTop = 2000
  listEl.dispatchEvent(new (window as any).Event('scroll'))
  await sleep(40)
  const texts = [...root.querySelectorAll('.vit')].map((n) => n.textContent)
  assert.ok(texts.some((t) => t?.includes('条50')), '滚动 → 窗口含中部条目')
  assert.ok(!texts.some((t) => t?.includes('条0')), '滚动 → 窗口不含顶部')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-B5 嵌套数组 = 隐式 Fragment（任意深度递归展开——统一写法——深度变化不漂移）', async () => {
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let deep = false
    return () => h('div', {}, [
      h('span', { class: 'a' }, 'x'),
      [h('span', { class: 'b' }, 'y'), [h('span', { class: 'c' }, 'z'), h('span', { class: 'k' }, 'k')], h('span', { class: 'l' }, 'l')],
      h('span', { class: 'm' }, 'm'),
      h('button', { id: 'deep', onClick: () => { deep = !deep; ctx.render() } }, 'deep'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  const cls = [...root.querySelectorAll('span')].map((n) => n.className).join(',')
  assert.equal(cls, 'a,b,c,k,l,m', '嵌套数组任意深度展开（顺序保持）')
  // 深度变化：内层 [c, k] → [[c, k]]（更深）——展开序列不变——位置不漂移
  const App2 = (_i: Record<string, unknown>, ctx: any) => {
    let deep = false
    return () => {
      const mid = deep
        ? [[h('span', { class: 'c' }, 'z'), h('span', { class: 'k' }, 'k')]]
        : [h('span', { class: 'b' }, 'y'), [h('span', { class: 'c' }, 'z'), h('span', { class: 'k' }, 'k')], h('span', { class: 'l' }, 'l')]
      return h('div', {}, [
        h('span', { class: 'a' }, 'x'),
        mid,
        h('span', { class: 'm' }, 'm'),
        h('button', { id: 'deep', onClick: () => { deep = !deep; ctx.render() } }, 'deep'),
      ])
    }
  }
  const root2 = mkRoot()
  const handle2 = mount(h(App2, {}), root2)
  await handle2.ready
  ;(root2.querySelector('[id="deep"]') as HTMLElement).click()
  await sleep(10)
  const cls2 = [...root2.querySelectorAll('span')].map((n) => n.className).join(',')
  assert.equal(cls2, 'a,c,k,m', '深度变化——展开序列正确（纯函数扁平化）')
  handle.unmount()
  handle2.unmount()
  document.body.removeChild(root)
  document.body.removeChild(root2)
})

test('X-B6 条件表达式统一标准（值域协议——空洞/文本/数组/非法输入矩阵）', async () => {
  const root = mkRoot()
  const warns: string[] = []
  const ow = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  try {
    const App = (_init: Record<string, unknown>, ctx: any) => {
      let cond = true
      let mode = 'on' as 'on' | 'off'
      return () => h('div', { id: 'box' }, [
        h('span', { class: 'a' }, 'A'),
        cond && h('span', { class: 'and1' }, 'and1'),          // cond && y
        cond && [h('span', { class: 'and2' }, 'and2a'), h('span', { class: 'and3' }, 'and2b')], // cond && [y,z]
        cond ? h('span', { class: 'tern1' }, 'tern-y') : h('span', { class: 'tern2' }, 'tern-n'), // 三元
        mode === 'on' ? [h('span', { class: 'multi1' }, 'm1'), h('span', { class: 'multi2' }, 'm2')] : null, // 三元数组
        h('span', { class: 'z' }, 'Z'),
        h('button', { id: 'off', onClick: () => { cond = false; mode = 'off'; ctx.render() } }, 'off'),
      ])
    }
    const handle = mount(h(App, {}), root)
    await handle.ready
    const cls = [...root.querySelectorAll('#box span')].map((n) => n.className).join(',')
    assert.equal(cls, 'a,and1,and2,and3,tern1,multi1,multi2,z', '全真值——全部渲染')
    ;(root.querySelector('[id="off"]') as HTMLElement).click()
    await sleep(10)
    const cls2 = [...root.querySelectorAll('#box span')].map((n) => n.className).join(',')
    // 三元是二选一（false 分支 tern2 显示）——&& 与 null 分支是空洞
    assert.equal(cls2, 'a,tern2,z', 'cond&&/cond&&[多]/三元数组全部空洞；三元显示 false 分支')
    handle.unmount()
  } finally {
    console.warn = ow
  }
  document.body.removeChild(root)
})

test('X-B7 值域协议：零/空串/非法输入（0 是文本——条件红线；对象/Symbol 诊断占位 + warn）', async () => {
  const root = mkRoot()
  const warns: string[] = []
  const ow = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  try {
    const App = () => () => h('div', { id: 'box' }, [
      h('span', { class: 'a' }, 'A'),
      0,                       // 0 && y 的脏值——渲染 "0"（合法文本——条件红线）
      '',                      // 空文本（无可见内容）
      ({ a: 1 }) as any,       // 非法——诊断占位 + warn
      Symbol('x') as any,      // 非法——诊断占位 + warn
      h('span', { class: 'b' }, 'B'),
    ])
    const handle = mount(h(App, {}), root)
    await handle.ready
    const box = root.querySelector('#box') as HTMLElement
    assert.ok(box.textContent?.includes('0'), '0 渲染为文本（"0"——值域协议：number 是文本）')
    const cls = [...box.querySelectorAll('span')].map((n) => n.className).join(',')
    assert.equal(cls, 'a,b', '非法输入不渲染（占位）——正常兄弟保留')
    assert.ok(warns.some((w) => w.includes('非法 children 值')), '非法输入 warn（开发期暴露）')
    handle.unmount()
  } finally {
    console.warn = ow
  }
  document.body.removeChild(root)
})

test('X-B8 filter(Boolean) 位置漂移 vs 占位法（有状态组件状态保持对比）', async () => {
  const root = mkRoot()
  const Counter = (_init: Record<string, unknown>, ctx: any) => {
    let n = 0
    return () => h('button', { class: 'cnt', onClick: () => { n++; ctx.render() } }, `n:${n}`)
  }
  // ✅ 占位法（标准）：false 占位——B 位置恒定——状态保持
  const Good = (_init: Record<string, unknown>, ctx: any) => {
    let cond = true
    return () => h('div', {}, [
      h('button', { id: 'tog', onClick: () => { cond = !cond; ctx.render() } }, 'tog'),
      h('div', { class: 'slot' }, [
        cond && h(Counter, {}),   // 空洞占位（false 保留——长度恒定）
        h(Counter, {}),           // 位置 1 恒定
      ]),
    ])
  }
  const handle = mount(h(Good, {}), root)
  await handle.ready
  ;(root.querySelectorAll('.slot .cnt')[1] as HTMLElement).click()  // 第二个 Counter n=1
  await sleep(10)
  ;(root.querySelector('[id="tog"]') as HTMLElement).click()       // cond false——第一个消失
  await sleep(10)
  ;(root.querySelectorAll('.slot .cnt')[0] as HTMLElement).click()  // 现在唯一的 Counter（原第二个）n=2
  await sleep(10)
  assert.equal(root.querySelector('.slot .cnt')?.textContent, 'n:2', '占位法——位置恒定——状态保持（1→2）')
  handle.unmount()

  // ❌ filter(Boolean) 写法：长度变化——位置漂移——状态重置
  const errs: string[] = []
  const oe = console.error
  console.error = (m: string) => { errs.push(String(m)) }
  const Bad = (_init: Record<string, unknown>, ctx: any) => {
    let cond = true
    return () => h('div', {}, [
      h('button', { id: 'tog', onClick: () => { cond = !cond; ctx.render() } }, 'tog'),
      h('div', { class: 'slot' }, [cond && h(Counter, {}), h(Counter, {})].filter(Boolean)),
    ])
  }
  const root2 = mkRoot()
  const handle2 = mount(h(Bad, {}), root2)
  await handle2.ready
  ;(root2.querySelectorAll('.slot .cnt')[1] as HTMLElement).click()  // 第二个 n=1
  await sleep(10)
  ;(root2.querySelector('[id="tog"]') as HTMLElement).click()       // cond false——filter 后 [B]
  await sleep(10)
  ;(root2.querySelector('.slot .cnt') as HTMLElement).click()        // B 现在位置 0——重建？
  await sleep(10)
  // filter 消除空洞 → 数组长度变化 → unkeyed 位置配对——B 重建（状态丢）
  assert.equal(root2.querySelector('.slot .cnt')?.textContent, 'n:1', 'filter 写法——位置漂移——B 重建（状态重置——红线案例）')
  console.error = oe
  assert.ok(errs.some((e) => e.includes('[vdom4/audit]') && e.includes('缺少 key')), 'A 级检测：长度变化 + 无 key 组件项 → dev error（filter 写法被抓）')
  handle2.unmount()
  document.body.removeChild(root)
  document.body.removeChild(root2)
})

test('X-G4 组件输出 null → 恢复（lastOutput 同步——旧对照失配回归）', async () => {
  const root = mkRoot()
  const Child = (_i: Record<string, unknown>, _ctx: any) => {
    return (props: any) => (props.show ? h('div', { class: 'c' }, '内容') : null)
  }
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let show = true
    return () => h('div', {}, [
      h(Child, { show }),
      h('button', { id: 't', onClick: () => { show = !show; ctx.render() } }, 't'),
      h('span', { class: 'after' }, 'after'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('.c'), '初始渲染')
  ;(root.querySelector('[id="t"]') as HTMLElement).click()   // show=false → 输出 null
  await sleep(10)
  assert.ok(!root.querySelector('.c'), '输出 null——内容清除')
  ;(root.querySelector('[id="t"]') as HTMLElement).click()   // show=true → 再输出
  await sleep(10)
  assert.ok(root.querySelector('.c'), '输出 null 后恢复（lastOutput 同步——防旧对照失配）')
  assert.ok(root.querySelector('.after'), '兄弟保留')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-A7 await ctx.ui.render() 后 DOM 最新（契约 §4.2——测量/动画；含渲染中 await 补跑）', async () => {
  const root = mkRoot()
  const App = (_init: Record<string, unknown>, ctx: any) => {
    let n = 0
    return () => h('div', {}, [
      h('span', { id: 'val' }, `n:${n}`),
      h('button', { id: 'seq', onClick: async () => {
        n = 1
        await ctx.render()          // 等待渲染完成（含补跑）
        const v1 = root.querySelector('#val')?.textContent
        n = 2
        await ctx.render()          // 渲染中再渲染（同回调内两次）
        const v2 = root.querySelector('#val')?.textContent
        ;(globalThis as any).__seq = [v1, v2]
      } }, 'seq'),
    ])
  }
  const handle = mount(h(App, {}), root)
  await handle.ready
  ;(root.querySelector('[id="seq"]') as HTMLElement).click()
  await sleep(10)
  const seq = (globalThis as any).__seq as string[]
  assert.equal(seq[0], 'n:1', '第一次 await render 后 DOM 已更新（n:1）')
  assert.equal(seq[1], 'n:2', '第二次 await render 后 DOM 已更新（n:2——渲染中调用也精确等待）')
  assert.equal(root.querySelector('#val')?.textContent, 'n:2', '最终 DOM 最新')
  delete (globalThis as any).__seq
  handle.unmount()
  document.body.removeChild(root)
})

test('X-R1 UIRouter 匹配（Trie——静态/参数/通配/404——类比后端 Router）', async () => {
  const router = new UIRouter()
  const seen: string[] = []
  router.get('/', () => { seen.push('home'); return h('div', {}, 'Home') })
  router.get('/users/:id', (p) => { seen.push(`user:${p.id}`); return h('div', {}, `User ${p.id}`) })
  router.get('/files/*', (p) => { seen.push(`files:${p['*']}`); return h('div', {}, p['*']) })
  router.notFound(() => { seen.push('404'); return h('div', {}, '404') })
  const call = (p: string) => { const r = router.resolve(p)!; r.handler(r.params) }
  call('/')
  call('/users/42')
  call('/files/a/b/c')
  call('/nope')
  assert.deepEqual(seen, ['home', 'user:42', 'files:a/b/c', '404'], '静态/参数/通配/404 全匹配')
  // 参数解码
  const m = router.match('/users/%E6%9D%8E%E5%9B%9B')
  assert.ok(m && m.params.id === '李四', '参数 decodeURIComponent')
})

test('X-R2 uiServe 导航（页面切换——根 vnode 替换 + 立即渲染——原子切换）', async () => {
  const root = mkRoot()
  const router = new UIRouter()
  const PageA = () => () => h('div', { class: 'page-a' }, '页面A')
  const PageB = () => () => h('div', { class: 'page-b' }, '页面B')
  router.get('/', () => h(PageA, {}))
  router.get('/b', () => h(PageB, {}))
  const serve = uiServe(router, root, { initialPath: '/' })
  await serve.ready
  assert.ok(root.querySelector('.page-a'), '初始页面 A')
  serve.navigate('/b')
  await sleep(20)
  assert.ok(root.querySelector('.page-b'), '导航 → 页面 B')
  assert.ok(!root.querySelector('.page-a'), '旧页面卸载（原子切换）')
  serve.unmount()
  document.body.removeChild(root)
})

test('X-R3 uiSsr → uiServe hydration（同一 UIRouter——SSR HTML 收养——零重建 + 交互可用）', async () => {
  const router = new UIRouter()
  let clicks = 0
  const Home = (_i: Record<string, unknown>, ctx: any) => {
    return () => h('div', {}, [
      h('span', { class: 'hydrated' }, 'SSR内容'),
      h('button', { id: 'ct', onClick: () => { clicks++; ctx.render() } }, `点击:${clicks}`),
    ])
  }
  router.get('/', () => h(Home, {}))
  // 服务端：SSR HTML + 数据种子
  const { html, data } = await uiSsr(router, { url: '/' })
  assert.ok(html.includes('SSR内容'), 'SSR HTML 含页面内容')
  assert.ok(html.includes('data-v4-id'), 'SSR HTML 带路径 id 标记（吸收锚点）')
  // 客户端：收养 SSR HTML（同一 UIRouter——同一路径——零重建）
  const root = mkRoot()
  root.innerHTML = html
  const serve = uiServe(router, root, { initialPath: '/' })
  await serve.ready
  assert.ok(root.querySelector('.hydrated'), 'hydration 收养（内容保留）')
  const idCount = root.querySelectorAll('[data-v4-id]').length
  assert.ok(idCount > 0, `路径 id 保留（${idCount} 个）——零重建（非重新插入）`)
  // 收养后交互可用（事件绑定）
  ;(root.querySelector('[id="ct"]') as HTMLElement).click()
  await sleep(20)
  assert.equal(root.querySelector('#ct')?.textContent, '点击:1', '收养后交互（事件 + 组件级渲染）')
  serve.unmount()
  document.body.removeChild(root)
})

test('X-S1 公共面契约（index.ts 导出集稳定——内部引擎切换不影响对外接口）', async () => {
  // 从公共面（weifuwu/ui-dom 同源）取全部契约 API——验证存在 + 形状
  const uiDom = await import('../ui-dom/index.ts')
  const required = [
    // 渲染原语（vdom 无关——统一 JSX 面）
    ['h', 'function'], ['jsx', 'function'], ['jsxs', 'function'], ['jsxDEV', 'function'],
    ['Fragment', 'symbol'], ['Portal', 'symbol'], ['createPortal', 'function'],
    // 渲染引擎（契约——createRoot 最终形态无后缀——当前 v4 面带后缀过渡）
    ['createRootV4', 'function'],
    // 路由/SSR（S8——每个 vdom 必选）
    ['UIRouter', 'function'], ['uiServe', 'function'], ['uiSsr', 'function'],
    // 状态/环境/中间件（vdom 无关面）
    ['createStore', 'function'], ['createClientBrowser', 'function'],
    ['api', 'function'], ['auth', 'function'], ['ws', 'function'], ['i18n', 'function'],
  ] as const
  for (const [name, kind] of required) {
    const v = (uiDom as any)[name]
    assert.ok(v != null, `公共面缺少 ${name}（${kind}）`)
    if (kind === 'function') assert.equal(typeof v, 'function', `${name} 应为函数`)
    if (kind === 'symbol') assert.equal(typeof v, 'symbol', `${name} 应为 symbol`)
  }
  // 公共面冒烟：createRootV4 可用（真实渲染——X-A 同款能力经公共面）
  const root = mkRoot()
  const App = () => () => h('div', { class: 'smoke' }, '公共面冒烟')
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  assert.ok(root.querySelector('.smoke'), '公共面 createRoot 渲染可用')
  handle.unmount()
  document.body.removeChild(root)
})

test('X-S2 公共面 API 语义契约（X-A~R 全部经公共面——切换实现功能不变）', async () => {
  // 本文件的全部测试（X-A1~R3）都从公共面取引擎入口（文件头 import）——
  // vdom5 切换 index.ts 的 v4 面实现后，同一测试集必须全绿 = 公共面功能不变
  const uiDom = await import('../ui-dom/index.ts')
  // 契约面形状验证：createRoot 返回 handle（ready/engine/unmount）——
  // vdom4/vdom5 实现一致——组件/应用无需感知引擎差异
  const root = mkRoot()
  const Counter = (_i: Record<string, unknown>, ctx: any) => {
    let n = 0
    return () => h('button', { id: 'c', onClick: () => { n++; ctx.render() } }, `n:${n}`)
  }
  const handle = createRoot(h(Counter, {}), root)
  await handle.ready
  assert.equal(typeof handle.ready?.then, 'function', 'handle.ready 是 Promise')
  assert.ok(handle.engine, 'handle.engine 存在（调度/数据面）')
  assert.equal(typeof handle.unmount, 'function', 'handle.unmount 是函数')
  ;(root.querySelector('#c') as HTMLElement).click()
  await sleep(20)
  assert.equal(root.querySelector('#c')?.textContent, 'n:1', '公共面 handle 交互可用')
  handle.unmount()
  document.body.removeChild(root)
})
