/**
 * Steps — progress through a sequence of steps.
 *
 * ```tsx
 * const step = signal(1)
 * <Steps current={step}>
 *   <Steps.Step title="基本信息" description="填写姓名和邮箱" />
 *   <Steps.Step title="详细资料" description="补充完整信息" />
 *   <Steps.Step title="完成" />
 * </Steps>
 * ```
 */
import { For } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface StepsProps {
  current: number | Signal<number>
  direction?: 'horizontal' | 'vertical'
  class?: string
  children?: any
}

export interface StepItemProps {
  title: string
  description?: string
  status?: 'pending' | 'active' | 'completed'
  class?: string
}

function StepItem(props: StepItemProps, ctx: any) {
  const { title, description, status = 'pending', class: extraClass } = props

  const statusClasses = {
    pending: 'border-gray-300 text-gray-400 bg-white',
    active: 'border-blue-600 text-blue-600 bg-blue-50',
    completed: 'border-blue-600 text-white bg-blue-600',
  }

  const lineClasses = {
    pending: 'bg-gray-200',
    active: 'bg-blue-200',
    completed: 'bg-blue-600',
  }

  return (
    <div class={cn('flex', extraClass)}>
      {/* Indicator */}
      <div class="flex flex-col items-center">
        <div class={cn(
          'size-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold shrink-0 transition-colors',
          statusClasses[status],
        )}>
          {status === 'completed' ? '✓' : null}
        </div>
        {/* Connector line */}
        <div class={cn('w-0.5 flex-1 min-h-6', lineClasses[status])} />
      </div>

      {/* Content */}
      <div class={cn('ml-3 pb-8', status === 'active' ? '' : 'opacity-60')}>
        <div class={cn('text-sm font-medium', status === 'active' ? 'text-blue-600' : 'text-gray-700')}>
          {title}
        </div>
        {description && (
          <div class="text-xs text-gray-500 mt-0.5">{description}</div>
        )}
      </div>
    </div>
  )
}

export function Steps(props: StepsProps, ctx: any) {
  const current = typeof props.current === 'object' ? props.current.value : props.current
  const { direction = 'vertical', class: extraClass, children } = props

  // Process children to add status
  const items = Array.isArray(children) ? children : [children]
  const processedItems = items.map((child: any, idx: number) => {
    if (!child || typeof child !== 'object') return child
    const stepIdx = idx + 1
    let status: 'pending' | 'active' | 'completed'
    if (stepIdx < current) status = 'completed'
    else if (stepIdx === current) status = 'active'
    else status = 'pending'

    return <StepItem
      title={child.props?.title ?? ''}
      description={child.props?.description}
      status={status}
    />
  })

  return (
    <div class={cn(
      direction === 'horizontal' ? 'flex' : 'flex flex-col',
      extraClass,
    )}>
      {processedItems}
    </div>
  )
}

Steps.Step = StepItem
