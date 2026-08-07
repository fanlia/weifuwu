/**
 * ctx.ui.useAsync — 普通组件异步取数工具
 *
 * 验证：成功/失败/重跑/卸载后过期 resolve 不渲染/响应式自动渲染
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { h } from '../../client/vnode.ts'
import { createApp } from '../../client/app.ts'

function makeMount(Comp: any) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp()
  return { container, app, mount: () => app.mount(container as any, Comp, {} as any) }
}

test('useAsync 成功：data 就绪后自动渲染', async () => {
  let resolveFn: (d: any) => void = () => {}
  const fetcher = () => new Promise(r => { resolveFn = r })

  const Comp: any = (_init: any, ctx: any) => {
    const list = ctx.ui.useAsync(fetcher)
    return () => h('div', { class: 'async-comp' }, list.loading ? '加载中' : `数据:${JSON.stringify(list.data)}`)
  }
  const { container, app, mount } = makeMount(Comp)
  await mount()

  assert.equal(container.textContent, '加载中', '初始 loading')
  resolveFn([{ id: 1 }, { id: 2 }])
  await new Promise(r => setTimeout(r, 10))

  assert.equal(container.textContent, '数据:[{"id":1},{"id":2}]', 'resolve 后自动渲染')
  ;(app as any).destroy()
})

test('useAsync 失败：error 被设置且 UI 反映', async () => {
  const fetcher = () => Promise.reject(new Error('网络错误'))

  const Comp: any = (_init: any, ctx: any) => {
    const list = ctx.ui.useAsync(fetcher)
    return () => h('div', { class: 'async-comp' }, list.error ? `错误:${(list.error as Error).message}` : '无错误')
  }
  const { container, app, mount } = makeMount(Comp)
  await mount()
  await new Promise(r => setTimeout(r, 10))

  assert.equal(container.textContent, '错误:网络错误', 'error 状态渲染')
  ;(app as any).destroy()
})

test('useAsync reload：重跑取数并更新', async () => {
  let call = 0
  const fetcher = () => Promise.resolve(++call)

  const Comp: any = (_init: any, ctx: any) => {
    const list = ctx.ui.useAsync(fetcher)
    return () => h('button', { class: 'async-comp', onClick: () => list.reload() }, `值:${list.data}`)
  }
  const { container, app, mount } = makeMount(Comp)
  await mount()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(container.textContent, '值:1', '首次取数')

  ;(container.querySelector('.async-comp') as HTMLElement).click()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(container.textContent, '值:2', 'reload 重跑')
  ;(app as any).destroy()
})

test('useAsync 卸载后过期 resolve 不触发渲染（不炸）', async () => {
  let resolveFn: (d: any) => void = () => {}
  const fetcher = () => new Promise(r => { resolveFn = r })

  let renders = 0
  const Comp: any = (_init: any, ctx: any) => {
    const list = ctx.ui.useAsync(fetcher)
    return () => { renders++; return h('div', { class: 'async-comp' }, 'x') }
  }
  const { container, app, mount } = makeMount(Comp)
  await mount()
  ;(app as any).destroy()   // 卸载

  resolveFn([1])            // 过期 resolve——应被安全忽略
  await new Promise(r => setTimeout(r, 10))
  const before = renders
  resolveFn([2])
  await new Promise(r => setTimeout(r, 10))
  assert.equal(renders, before, '卸载后 resolve 不再触发渲染')
  assert.equal(container.children.length, 0)
})
