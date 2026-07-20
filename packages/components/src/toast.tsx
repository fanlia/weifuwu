/**
 * Toast — global notification system.
 *
 * ```tsx
 * toast.success('保存成功')
 * toast.error('操作失败', { duration: 5000 })
 * <ToastContainer />
 * ```
 */
import { signal, computed, } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface ToastMessage {
  id: number
  title: string
  description?: string
  variant: 'success' | 'error' | 'info' | 'warning'
}

const toasts = signal<ToastMessage[]>([])
let toastId = 0

export interface ToastOptions { duration?: number; description?: string }

function addToast(title: string, variant: ToastMessage['variant'], opts?: ToastOptions) {
  const id = ++toastId
  toasts.value = [...toasts.value, { id, title, description: opts?.description, variant }]
  const duration = opts?.duration ?? (variant === 'error' ? 5000 : 3000)
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, duration)
}

export const toast = {
  success: (title: string, opts?: ToastOptions) => addToast(title, 'success', opts),
  error: (title: string, opts?: ToastOptions) => addToast(title, 'error', opts),
  info: (title: string, opts?: ToastOptions) => addToast(title, 'info', opts),
  warning: (title: string, opts?: ToastOptions) => addToast(title, 'warning', opts),
}

const toastStyles: Record<string, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
}

const toastIcons: Record<string, string> = {
  success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️',
}

export function ToastContainer() {
  return computed(() => {
    if (toasts.value.length === 0) return null
    return (
      <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.value.map((t) => (
          <div class={cn('flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-in slide-in-from-top-2', toastStyles[t.variant])} role="alert">
            <span>{toastIcons[t.variant]}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium">{t.title}</p>
              {t.description && <p class="text-sm mt-0.5 opacity-80">{t.description}</p>}
            </div>
            <button type="button" class="flex-shrink-0 text-sm opacity-60 hover:opacity-100" onClick={() => { toasts.value = toasts.value.filter(x => x.id !== t.id) }}>✕</button>
          </div>
        ))}
      </div>
    )
  })
}
