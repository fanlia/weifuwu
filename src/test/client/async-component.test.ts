/**
 * weifuwu/client async 工厂组件测试 — 形态 C
 *
 * async (ctx) => (initProps, ctx) => (props) => VNode
 *
 * 覆盖：
 *   - async 工厂组件首次渲染：占位 → 完成后整树重渲染 → 内容出现
 *   - 工厂只执行一次（WeakMap 缓存）
 *   - 工厂数据通过闭包传给组件（mount/render 同步）
 *   - 工厂返回非函数定义 → 报错
 *   - 未解析工厂的组件在更新路径也走占位重试
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { h, asyncComponent } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

before(setupJsdom)

const { createApp } = await import('../../client/app.ts')

/** 等微任务（工厂 resolve + 整树重渲染调度） */
function flush(): Promise<void> {
  return new Promise(r => setTimeout(r, 0))
}

/** 渲染一个 root 组件到独立容器 */
async function mountApp(root: any) {
  const app = createApp()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const id = 'ac_' + Math.random().toString(36).slice(2)
  el.id = id
  await app.mount('#' + id, root)
  return { app, el }
}

describe('asyncComponent 工厂组件', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('首次渲染：占位 → 工厂 resolve 后整树重渲染 → 内容出现', async () => {
    const Profile = asyncComponent(async (ctx: WfuiContext) => {
      const user = { name: 'Alice' }
      return (initProps: any, c: WfuiContext) =>
        (props: any) => h('div', {}, user.name)
    })

    const { el } = await mountApp(() => () => h(Profile, {}))
    // 工厂尚未 resolve：占位（无内容）
    assert.equal(el.textContent, '')

    await flush()
    // 工厂 resolve → 整树重渲染 → 内容出现
    assert.equal(el.textContent, 'Alice')
  })

  it('工厂只执行一次（缓存），重复渲染复用定义', async () => {
    let factoryRuns = 0
    const Panel = asyncComponent(async () => {
      factoryRuns++
      return (_init: any) => (props: any) => h('div', {}, `run-${props.n}`)
    })

    const { el, app } = await mountApp(() => {
      let n = 0
      return () => h(Panel, { n: ++n })
    })
    await flush()
    // 占位补全触发一次整树重渲染（n 自增到 2）
    assert.equal(el.textContent, 'run-2')
    assert.equal(factoryRuns, 1)

    // 再次触发根组件重渲染（props 变化）——工厂仍不重复执行
    ;(app as any).ctx.ui.render()
    assert.equal(el.textContent, 'run-3')
    assert.equal(factoryRuns, 1, '工厂不应重复执行')
  })

  it('工厂数据经闭包注入，mount/render 保持同步', async () => {
    const Data = asyncComponent(async () => {
      const data = await Promise.resolve({ count: 42 })
      return (_init: any, ctx: WfuiContext) => {
        // mount 阶段同步可读（数据在闭包）
        return (props: any) => h('p', {}, `count=${data.count}`)
      }
    })

    const { el } = await mountApp(() => () => h(Data, {}))
    assert.equal(el.textContent, '')
    await flush()
    assert.equal(el.textContent, 'count=42')
  })

  it('工厂返回非函数定义 → 渲染错误处理（不崩溃）', async () => {
    const Bad = asyncComponent(async () => {
      return 42 as any
    })

    const { el } = await mountApp(() => () => h(Bad, {}))
    await flush()
    // 占位保持（错误被吞掉，不崩溃）
    assert.equal(el.textContent, '')
  })

  it('多个 async 工厂组件并存', async () => {
    const A = asyncComponent(async () => {
      const a = await Promise.resolve('AAA')
      return () => () => h('span', {}, a)
    })
    const B = asyncComponent(async () => {
      const b = await Promise.resolve('BBB')
      return () => () => h('span', {}, b)
    })

    const { el } = await mountApp(() => () =>
      h('div', {}, h(A, {}), h('i', {}, '-'), h(B, {})))
    assert.equal(el.textContent, '-')
    await flush()
    assert.equal(el.textContent, 'AAA-BBB')
  })

  it('嵌套：async 工厂组件包含同步子组件与普通元素', async () => {
    const Inner = (_init: any) => (props: any) => h('b', {}, props.label)
    const Outer = asyncComponent(async () => {
      const title = await Promise.resolve('title')
      return (_init: any, ctx: WfuiContext) =>
        (props: any) => h('section', {}, h('h1', {}, title), h(Inner, { label: 'inner' }))
    })

    const { el } = await mountApp(() => () => h(Outer, {}))
    await flush()
    assert.equal(el.textContent, 'titleinner')
    assert.equal(el.querySelector('h1')?.textContent, 'title')
    assert.equal(el.querySelector('b')?.textContent, 'inner')
  })

  it('更新路径：条件渲染未解析 async 工厂 → 占位后补全', async () => {
    const Heavy = asyncComponent(async () => {
      await Promise.resolve()
      return () => () => h('div', { class: 'heavy' }, 'heavy-content')
    })

    ;(window as any).__show = false
    const { el, app } = await mountApp(() => () =>
      h('div', {}, (window as any).__show ? h(Heavy, {}) : null))

    await flush()
    assert.equal(el.querySelector('.heavy'), null)

    // 条件渲染新增 async 组件（更新路径）
    ;(window as any).__show = true
    ;(app as any).ctx.ui.render()
    // 更新路径占位（工厂未解析）
    assert.equal(el.querySelector('.heavy'), null)
    await flush()
    // 补全
    assert.equal(el.querySelector('.heavy')?.textContent, 'heavy-content')
  })
})
