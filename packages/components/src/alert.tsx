/**
 * Alert — contextual feedback message.
 *
 * ```tsx
 * <Alert variant="error" title="错误">操作失败，请重试</Alert>
 * <Alert variant="success">保存成功</Alert>
 * ```
 */
import { cn } from './cn.ts'

export interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  class?: string
  children?: any
}

const alertVariants: Record<string, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  error: 'bg-red-50 border-red-200 text-red-800',
}

const icons: Record<string, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
}

export function Alert(props: AlertProps) {
  const { variant = 'info', title, class: extraClass, children } = props
  return (
    <div class={cn('flex gap-3 p-4 rounded-lg border', alertVariants[variant], extraClass)} role="alert">
      <span class="flex-shrink-0 mt-0.5">{icons[variant]}</span>
      <div class="flex-1">
        {title && <p class="font-medium">{title}</p>}
        {children && <div class={cn('text-sm', title && 'mt-1')}>{children}</div>}
      </div>
    </div>
  )
}
