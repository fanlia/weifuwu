/**
 * vdom3 demo — 完整应用验证
 * 路由（/ /list /detail/:id）+ 计数器/列表/条件 + 事件流观测 + 回放
 */
import { h, createRouter, stream, replay, createRoot } from '../../src/ui-dom/vdom3/index.ts'

// 暴露事件流（浏览器观测）
;(window as any).__v3_events = () => stream.events()
;(window as any).__v3_replay = (targetId: string) => {
  const t = document.getElementById(targetId)
  if (t) { replay(stream.events(), t); return t.innerHTML.slice(0, 200) }
  return 'no-target'
}

// 共享状态（路由页面间）
let count = 0
const items = ['a', 'b', 'c']
let show = true

// ── 页面组件 ──
const Home = async (_init: any, ctx: any) => {
  const rerender = () => ctx.render()
  return async () => h('div', { id: 'home' }, [
    h('h2', {}, 'vdom3 demo — home'),
    h('div', {}, [
      h('button', { id: 'inc', onClick: () => { count++; rerender() } }, [`count: ${count}`]),
      h('button', { id: 'add', onClick: () => { items.push(`item${items.length + 1}`); rerender() } }, 'add item'),
      h('button', { id: 'toggle', onClick: () => { show = !show; rerender() } }, 'toggle'),
      h('button', { id: 'goto-list', onClick: () => router.navigate('/list') }, '→ /list'),
    ]),
    show ? h('div', { id: 'cond' }, 'conditional shown') : null,
    h('ul', { id: 'list' }, items.map((it, i) => h('li', { key: it + i }, it))),
  ])
}

const List = async (_init: any, _ctx: any) => {
  return async () => h('div', { id: 'list-page' }, [
    h('h2', {}, 'vdom3 demo — list'),
    h('ul', {}, items.map((it, i) => h('li', { key: it + i }, it))),
    h('button', { id: 'goto-detail', onClick: () => router.navigate('/detail/42') }, '→ /detail/42'),
    h('button', { id: 'goto-home', onClick: () => router.navigate('/') }, '← home'),
  ])
}

const Detail = async (_init: any, _ctx: any) => {
  return async (props: any) => h('div', { id: 'detail-page' }, [
    h('h2', {}, `vdom3 demo — detail:${props.params?.id ?? '?'}`),
    h('button', { id: 'goto-list', onClick: () => router.navigate('/list') }, '← /list'),
  ])
}

// ── 路由应用 ──
const root = document.getElementById('root')!
const router = createRouter([
  { path: '/', render: () => h(Home, {}) },
  { path: '/list', render: () => h(List, {}) },
  { path: '/detail/:id', render: (params) => h(Detail, { params }) },
], root)
