/**
 * ui-dom 测试辅助——用 uiServe 挂载组件（替代已删除的 createApp.mount）
 */
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'

export async function mountApp(container: Element, Comp: any): Promise<{ ctx: any; rerender: () => void }> {
  const router = new UIRouter()
  router.get('/', () => h(Comp, {}))
  const handle = uiServe(router, { root: container })
  await new Promise((r) => setTimeout(r, 0))
  return {
    close: () => handle.close(),
    ctx: handle.ctx,
    rerender: () => {
      // 对齐 createApp ctx.ui.render()：bump 版本失效三态 skip + 整树重渲染
      ;(handle.ctx.ui as any).bumpCtxVersion?.()
      ;(handle.ctx as any).__rerender?.()
    },
  }
}
