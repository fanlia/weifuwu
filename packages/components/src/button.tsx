/**
 * Button — primary action element.
 *
 * ```tsx
 * <Button variant="primary" onClick={() => save()}>保存</Button>
 * <Button variant="outline" size="sm">取消</Button>
 * ```
 */
import { cn } from './cn.ts'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  class?: string
  onClick?: (e: MouseEvent) => void
  children?: any
  type?: 'button' | 'submit' | 'reset'
}

const variantClasses: Record<string, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 disabled:bg-gray-50 disabled:text-gray-400',
  outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:text-gray-300 disabled:border-gray-200',
  ghost: 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300',
}

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function Button(props: ButtonProps, ctx?: any) {
  const { variant = 'primary', size = 'md', disabled = false, class: extraClass, onClick, children, type = 'button' } = props
  return (
    <button
      type={type}
      disabled={disabled}
      class={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        extraClass
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
