/**
 * routes.tsx——路由声明（两阶段异步组件）
 *
 * 新手必读（概念见 content/guides/component-model.md）：
 * - 外层 async 工厂 = mount（只一次）：await 数据 / 初始化状态
 * - 内层 async renderFn = 每次渲染：读最新 props / 输出视图
 * - 状态 = 普通对象 let + 改后 ctx.render()（render-only）
 */
import { h } from 'weifuwu/vdom'

// 两阶段异步组件：工厂层 await 数据（ctx.data——缓存 + 并发合并）
const Home = async (_init: any, ctx: any) => {
  const data = await ctx.data.get('/api/hello')
  let count = 0 // 组件状态（render-only）
  return async (_props: any) =>
    h('div', { class: 'wf-container wf-stack', style: '--wf-max:640px;--wf-gap:16px;padding:40px 16px;text-align:center' },
      h('h1', { class: 'wf-text-3xl wf-m-0' }, 'weifuwu hello-world'),
      h('p', { class: 'wf-text-secondary' }, `数据管道：${(data as any).msg}`),
      h('button', {
        class: 'wf-btn wf-btn--primary',
        onClick: () => { count++; ctx.render() }, // 改状态 → 显式 render()
      }, `点击 ${count} 次`),
    )
}

export const routes = [{ path: '/', render: () => h(Home, {}) }]
