/**
 * vdom3 demo — 真实浏览器验证
 * 计数器 + 动态列表 + 条件显示 + 路由——事件流挂 window 可观测
 */
import { h, createRoot, createRouter, stream } from '../../src/ui-dom/vdom3/index.ts'

// 暴露事件流（浏览器观测——agent-browser eval 可查）
;(window as any).__v3_events = () => stream.events()
;(window as any).__v3_stream = stream

// 组件：计数器 + 列表 + 条件
let count = 0
let show = true
const items = ['a', 'b', 'c']

const App = async (_init: any, ctx: any) => {
  const rerender = () => ctx.render()
  return async () => h('div', { id: 'app' }, [
    h('h2', {}, 'vdom3 demo'),
    h('div', {}, [
      h('button', { id: 'inc', onClick: () => { count++; rerender() } }, [`count: ${count}`]),
      h('button', { id: 'add', onClick: () => { items.push(`item${items.length + 1}`); rerender() } }, 'add item'),
      h('button', { id: 'toggle', onClick: () => { show = !show; rerender() } }, 'toggle'),
    ]),
    show ? h('div', { id: 'cond' }, 'conditional shown') : null,
    h('ul', { id: 'list' }, items.map((it, i) => h('li', { key: it + i }, it))),
    h('div', { id: 'page' }, 'route: /'),
  ])
}

const root = document.getElementById('root')!
createRoot(h(App, {}), root)
