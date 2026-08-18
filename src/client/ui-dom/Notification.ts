/**
 * weifuwu/ui-dom — Notification（命令式中间件）
 *
 * v1 退役（design 归档）：实现已收敛到 components/Notification（vdom 引擎，
 * mountCommand + render-only）。本文件保留为公开 API 兼容入口。
 */

export { Notification } from '../components/Notification/Notification.ts'
export type {
  NotificationType, NotificationPosition, NotificationItem, NotificationProps, NotificationOptions, NotificationInjected,
} from '../components/Notification/Notification.ts'
