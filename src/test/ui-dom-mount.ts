/**
 * ui-dom 测试辅助——用 vdom2 引擎（context 组装层 mountRoot）挂载组件
 */
import { h } from '../ui-dom/index.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { mountRoot } from '../ui-dom/context.ts'

export async function mountApp(container: Element, Comp: any): Promise<{ ctx: any; rerender: () => void }> {
  const handle = mountRoot({ browser: createClientBrowser(), root: container as HTMLElement })
  await handle.mount(h(Comp, {}))
  await new Promise((r) => setTimeout(r, 0))
  return {
    close: () => handle.unmount(),
    ctx: handle.ctx,
    rerender: () => handle.rerender(),
  }
}
