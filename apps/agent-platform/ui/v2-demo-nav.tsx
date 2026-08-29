/** v2 demo（导航验证——两页 + 链接拦截 + popstate） */
import { h, UIRouter } from '../../../src/client/vdom/index.ts'
import { uiServeV2 } from '../../../src/client/vdom/index.ts'

const PageA: any = (_p: any, _c: any) => {
  let clicks = 0
  return () => h('div', { class: 'page-a' }, [
    h('h1', { id: 'page-title' }, '页面 A'),
    h('button', { id: 'count-btn', onClick: () => { clicks++; (window as any).__rerender() } }, '点击 ' + clicks),
    h('a', { id: 'to-b', href: '/b' }, '去页面 B'),
  ])
}

const PageB: any = (_p: any, _c: any) => () => h('div', { class: 'page-b' }, [
  h('h1', { id: 'page-title' }, '页面 B'),
  h('a', { id: 'back-a', href: '/a' }, '回页面 A'),
])

let rerender: () => void = () => {}
;(window as any).__rerender = () => rerender()

const router = new UIRouter()
router.get('/a', (_req: any, ctx: any) => ctx.stream(h(PageA, {})))
router.get('/b', (_req: any, ctx: any) => ctx.stream(h(PageB, {})))
const srv = uiServeV2(router, { root: '#root' })
;(window as any).__srv = srv
try { history.replaceState({}, '', '/a') } catch { /* data url */ }
// 首帧直渲染（data url 环境 route 不匹配——引擎验证路径）
rerender = () => { void (srv as any).__apply?.(h(PageA, {})) }
rerender()
