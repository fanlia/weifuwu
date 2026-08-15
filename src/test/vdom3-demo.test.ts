/**
 * vdom3 demo — 最小应用验证（计数器 + 列表 + 条件 + 路由 + 录制回放）
 *
 * 端到端兑现：组件 ctx.render → 调度 → 事件流 → DOM；录制 → 回放 → 断言。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { h, createRouter, stream } from '../ui-dom/vdom3/index.ts'
import { replay, expectEventSequence } from '../ui-dom/vdom3/replay.ts'
import { evKey } from '../ui-dom/vdom3/events.ts'

before(setupJsdom)

function mkRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

test('demo：计数器 + 列表 + 条件（组件状态驱动 + 结构更新）', async () => {
  const { createRoot } = await import('../ui-dom/vdom3/index.ts')
  stream.reset()
  const root = mkRoot()
  // 应用：计数器 + 动态列表 + 条件显示
  let count = 0
  const items: string[] = ['a']
  let show = true
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'app' }, [
      h('button', { id: 'inc', onClick: () => { count++; rerender() } }, [`count:${count}`]),
      h('button', { id: 'add', onClick: () => { items.push(`item${items.length}`); rerender() } }, 'add'),
      h('button', { id: 'toggle', onClick: () => { show = !show; rerender() } }, 'toggle'),
      show ? h('div', { id: 'cond' }, 'shown') : null,
      h('ul', {}, items.map((it, i) => h('li', { key: it + i, 'data-it': it }, it))),
    ])
  }
  const handle = createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('[id="app"]') !== null, true, '应用渲染')
  assert.ok(root.querySelector('[id="cond"]'), '条件显示')

  // 交互：点击 +1 → count 更新
  ;(root.querySelector('#inc') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#inc')?.textContent, 'count:1', '计数器更新（组件状态驱动）')

  // 交互：add → 列表新增
  ;(root.querySelector('#add') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelectorAll('li').length, 2, '列表新增')

  // 交互：toggle → 条件隐藏
  ;(root.querySelector('#toggle') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('[id="cond"]'), null, '条件隐藏')
  document.body.removeChild(root)
})

test('demo：路由应用（/ → /list → /detail/:id）', async () => {
  stream.reset()
  const root = mkRoot()
  const Home = async (_init: any, _ctx: any) => async () => h('div', { id: 'home' }, 'home')
  const List = async (_init: any, _ctx: any) => async () => h('div', { id: 'list' }, 'list')
  const Detail = async (_init: any, ctx: any) => {
    const { render } = await import('../ui-dom/vdom3/root.ts')
    void render
    return async (props: any) => h('div', { id: 'detail' }, [`detail:${props.params?.id ?? '?'}`])
  }
  const router = createRouter([
    { path: '/', render: () => h(Home, {}) },
    { path: '/list', render: () => h(List, {}) },
    { path: '/detail/:id', render: (params) => h(Detail, { params }) },
  ], root, { initialPath: '/' })
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('[id="home"]'), '/ → home')

  router.navigate('/list')
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('[id="list"]'), '/list → list')

  router.navigate('/detail/42')
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('[id="detail"]')?.textContent.includes('42'), '/detail/:id → params')
  router.close()
  document.body.removeChild(root)
})

test('demo：录制 → 回放（用户操作序列 → 事件流 → 重放断言——事故转测试闭环）', async () => {
  const { createRoot } = await import('../ui-dom/vdom3/index.ts')
  stream.reset()
  const root = mkRoot()
  let count = 0
  const Counter = async (_init: any, ctx: any) => {
    return async () => h('div', { id: 'counter' }, [
      h('button', { id: 'btn', onClick: () => { count++; ctx.render() } }, `count:${count}`),
    ])
  }
  const handle = createRoot(h(Counter, {}), root)
  await new Promise((r) => setTimeout(r, 10))

  // 录制：点击 3 次（count 0→3）
  for (let i = 0; i < 3; i++) {
    ;(root.querySelector('#btn') as HTMLButtonElement)?.click()
    await new Promise((r) => setTimeout(r, 5))
  }
  assert.equal(root.querySelector('#btn')?.textContent, 'count:3', '交互后 count=3')
  const recorded = stream.events()
  assert.ok(recorded.some((e) => evKey(e) === 'comp:mount'), '录制包含状态/挂载事件')

  // 回放：事件流重放到新容器 → 最终状态一致（DOM = fold(事件流)）
  const target = document.createElement('div')
  document.body.appendChild(target)
  replay(recorded, target)
  // 回放的是"渲染事件"（COMP_MOUNT/NODE_CREATE/INSERT）——组件输出可重建
  const div = [...target.querySelectorAll('div')].find((d) => d.id === 'counter')
  assert.ok(div, '回放：计数器容器重建')
  // 事件序列断言：渲染过程精确可描述
  // 全链路事件流：决策先行（BUILD 组件构建）→ 生命周期（COMP_MOUNT）→ dom 指令
  expectEventSequence(recorded, ['comp:build', 'comp:mount'])
  document.body.removeChild(root)
  document.body.removeChild(target)
})
