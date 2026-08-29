/** v2 demo（真实浏览器验证——uiServeV2 引擎） */
import { h, UIRouter } from '../../../src/client/vdom/index.ts'
import { uiServeV2 } from '../../../src/client/vdom/index.ts'

let count = 0
const App: any = (_p: any, _c: any) => {
  return (props: any) => {
    return h('div', { class: 'app' }, [
      h('h1', { id: 'title' }, 'v2 引擎验证'),
      h('button', {
        id: 'btn',
        onClick: () => { count++; (window as any).__rerender() },
      }, '涨 ' + count),
      h('span', { id: 'cnt' }, String(count)),
      h('div', { id: 'list' }, Array.from({ length: 3 }, (_, i) =>
        h('span', { key: i, 'data-k': String(i) }, 'item' + i))),
    ])
  }
}

let rerender: () => void = () => {}
;(window as any).__rerender = () => rerender()

const router = new UIRouter()
router.get('/', (_req: any, ctx: any) => ctx.stream(h(App, {})))
const srv = uiServeV2(router, { root: '#root' })
;(window as any).__srv = srv
// 手工首帧（about:blank 环境——route '/' 手工 resolve）
rerender = () => { void (srv as any).__apply(h(App, {})) }
rerender()
