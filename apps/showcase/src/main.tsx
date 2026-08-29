/**
 * showcase 平台入口——浏览器 boot（uiServe 收养渲染）
 *
 * **双端一体**：路由树在 app-router.ts（buildRouter 单一实现源）——
 * 本文件只做浏览器端落地（服务端 SSR 走同一棵树——server.ts uiSsr）。
 */
import { uiServeV2 as uiServe } from 'weifuwu/vdom'
import { buildRouter, toast, confirm, notification } from './app-router.ts'
import { preloadIndex } from './data.ts'

// ── 渲染落地（uiServe——UIRouter 唯一应用入口——仅浏览器执行） ──
// （SSR 侧 esbuild 节点 bundle 也会 import 本文件——document 未定义时
//   不 boot——仅导出 buildRouter 供 uiSsr 消费）
if (typeof document !== 'undefined') {
  // **SSR 种子预热（2027-08——SSR≡SPA 首帧一致性）**：__DATA__.showcaseIndex
  // → indexCache 预填——客户端首帧同步命中（吸收结构一致——零差异）
  preloadIndex((window as unknown as { __DATA__?: { showcaseIndex?: import('./data.ts').IndexJson } }).__DATA__?.showcaseIndex)
  const router = buildRouter()
  const serve = uiServe(router, {
    root: '#root',
    toast,
    confirm,
    notification,
  })
  ;(window as any).__wf_router = router
}
