/**
 * ui-dom 测试辅助——用 vdom 引擎（mountRoot）挂载组件（v1 退役后）
 */
import { h } from '../ui-dom/index.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { mountRoot } from '../ui-dom/vdom/mount.ts'

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
