/**
 * agent-platform UIContext 类型增强——中间件注入面声明
 *
 * 与运行时一致（v3-main.tsx uiServe options 注入）：
 * ctx.api（ApiClient）/ ctx.auth（AuthClient）/ ctx.ws / ctx.i18n /
 * ctx.toast / ctx.confirm / ctx.app（{ navigate }）——页面消费类型安全。
 */
import type { ApiClient, AuthClient, WsClient, I18nState } from 'weifuwu/vdom'

declare module 'weifuwu/vdom' {
  interface UIContext {
    /** API 客户端（自动鉴权 + 401 刷新重试） */
    api: ApiClient
    /** 认证客户端（user/isLoggedIn/login/logout） */
    auth: AuthClient
    /** WebSocket 客户端 */
    ws: WsClient
    /** 国际化 */
    i18n?: I18nState
    /** 命令式轻提示 */
    toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => void
    /** 命令式确认 */
    confirm: (message: string, options?: Record<string, unknown>) => Promise<boolean>
    /** 应用面（编程式导航） */
    app: { navigate: (path: string) => Promise<void> }
  }
}
