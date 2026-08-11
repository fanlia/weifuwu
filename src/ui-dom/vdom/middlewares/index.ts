/**
 * vdom/middlewares — 命令式挂载中间件（vdom 引擎版）
 *
 * 与第 1 代（src/ui-dom/Toast.ts/Confirm.ts + 组件库 confirm/toast）的区别：
 * - 挂载走 vdom（buildVNode await 工厂 → renderValue）——无占位/同步工厂
 * - $ 状态走 ctx.ui.dirty（vdom scheduler——无自动渲染，仅 $ 赋值触发）
 * - 卸载走 vdom registry（cleanupComponent + ref 清理 + 容器移除）
 */

export { toast, type ToastInjected, type ToastOptions } from './toast.ts'
export { confirm, type ConfirmInjected, type ConfirmOptions } from './confirm.ts'
export { mountCommand, unmountCommand, createCommandContainer } from './host.ts'
