/**
 * weifuwu/ui-dom — Toast（命令式中间件）
 *
 * v1 退役（design 归档）：实现已收敛到 components/Toast（vdom 引擎，
 * mountCommand + render-only）。本文件保留为公开 API 兼容入口。
 */

export { Toast } from '../components/Toast/Toast.ts'
export type {
  ToastType, ToastPosition, ToastItem, ToastProps, ToastOptions, ToastInjected,
} from '../components/Toast/Toast.ts'
