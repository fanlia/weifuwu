/**
 * Accordion — collapsible panels with a cleaner API.
 *
 * ```tsx
 * <Accordion>
 *   <AccordionItem value="1" title="标题一">内容一</AccordionItem>
 *   <AccordionItem value="2" title="标题二">内容二</AccordionItem>
 * </Accordion>
 * ```
 */
import { signal, computed } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface AccordionProps {
  value?: Signal<string | null>
  defaultValue?: string
  class?: string
  children?: any
}

export function Accordion(props: AccordionProps) {
  const val = props.value ?? signal<string | null>(props.defaultValue ?? null)
  const key = {}  // unique identity for this instance

  // Pass signal to children via a shared approach
  ;(Accordion as any)._active = { key, signal: val }

  return <div class={cn('divide-y divide-gray-200 border border-gray-200 rounded-lg', props.class)}>
    {props.children}
  </div>
}

export interface AccordionItemProps {
  value: string
  title: string
  class?: string
  children?: any
}

export function AccordionItem(props: AccordionItemProps) {
  const state = (Accordion as any)._active as { key: object; signal: Signal<string | null> }
  if (!state) return <div>{props.children}</div>

  const isOpen = computed(() => state.signal.value === props.value)

  function toggle() {
    state.signal.value = isOpen.value ? null : props.value
  }

  return (
    <div class={cn(props.class)}>
      <button
        type="button"
        class={cn(
          'flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-left',
          'hover:bg-gray-50 transition-colors',
        )}
        onClick={toggle}
        aria-expanded={isOpen}
      >
        <span>{props.title}</span>
        <span class={cn('transition-transform', computed(() => isOpen.value ? 'rotate-180' : ''))}>▼</span>
      </button>
      <div class={cn('overflow-hidden transition-all')} style={(computed(() => isOpen.value ? '' : 'display:none')) as any}>
        <div class="px-4 pb-3 text-sm text-gray-600">{props.children}</div>
      </div>
    </div>
  )
}
