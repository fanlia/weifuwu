/**
 * Sidebar — navigation sidebar with active state based on ctx.route.
 *
 * ```tsx
 * <Sidebar
 *   items={[
 *     { key: '/dashboard', icon: '📊', label: '概览' },
 *     { key: '/dashboard/settings', icon: '⚙️', label: '设置' },
 *     { type: 'group', label: '数据' },
 *     { key: '/dashboard/users', icon: '👥', label: '用户管理' },
 *   ]}
 * />
 * ```
 */
import { signal, computed, onMount } from 'weifuwu/client'
import type { Signal, WfuiContext } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface SidebarItem {
  key?: string
  label: string
  icon?: string
  type?: 'item' | 'group'
  children?: SidebarItem[]
  badge?: string | number
}

export interface SidebarProps {
  items: SidebarItem[]
  collapsed?: Signal<boolean>
  defaultCollapsed?: boolean
  onNavigate?: (key: string) => void
  class?: string
}

export function Sidebar(props: SidebarProps, ctx: WfuiContext) {
  const { items, onNavigate, class: extraClass } = props
  const collapsed = props.collapsed ?? signal(props.defaultCollapsed ?? false)
  const activePath = signal(ctx?.route?.path ?? '')

  // Track route changes
  if (ctx?.route) {
    onMount(() => {
      // Listen for route changes
      const handler = () => { activePath.value = ctx.route.path }
      window.addEventListener('wefu:route', handler)
      return () => window.removeEventListener('wefu:route', handler)
    })
  }

  function navigate(key: string) {
    if (ctx?.app?.navigate) {
      ctx.app.navigate(key)
    }
    activePath.value = key
    onNavigate?.(key)
  }

  function isActive(key: string): boolean {
    return activePath.value === key || activePath.value.startsWith(key + '/')
  }

  return (
    <aside class={cn(
      'bg-white border-r border-gray-200 flex flex-col transition-all duration-200',
      collapsed.value ? 'w-16' : 'w-60',
      extraClass,
    )}>
      {/* Toggle button */}
      <button
        type="button"
        class="flex items-center justify-center h-12 border-b border-gray-100 text-gray-400 hover:text-gray-600"
        onClick={() => collapsed.value = !collapsed.value}
      >
        {collapsed.value ? '☰' : '✕'}
      </button>

      {/* Navigation items */}
      <nav class="flex-1 overflow-y-auto py-2">
        {items.map(item => {
          if (item.type === 'group') {
            return (
              <div class={cn('px-4 py-2 text-xs font-medium text-gray-400 uppercase', collapsed.value && 'text-center')}>
                {collapsed.value ? '···' : item.label}
              </div>
            )
          }

          const active = isActive(item.key ?? '')
          return (
            <button
              type="button"
              class={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                active
                  ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
              onClick={() => item.key && navigate(item.key)}
              title={collapsed.value ? item.label : undefined}
            >
              {item.icon && <span class="text-lg flex-shrink-0">{item.icon}</span>}
              {!collapsed.value && (
                <>
                  <span class="flex-1 text-left truncate">{item.label}</span>
                  {item.badge != null && (
                    <span class="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
