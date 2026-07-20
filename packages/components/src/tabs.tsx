/**
 * Tabs — tabbed content switching.
 *
 * ```tsx
 * const tab = signal('overview')
 * <Tabs value={tab}>
 *   <TabList>
 *     <Tab value="overview">概览</Tab>
 *     <Tab value="details">详情</Tab>
 *   </TabList>
 *   <TabPanel value="overview">概览</TabPanel>
 *   <TabPanel value="details">详情</TabPanel>
 * </Tabs>
 * ```
 */
import { signal, computed, onCleanup } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

const _tabsMap = new Map<object, Signal<string>>()
let _tabGroupId = 0

export interface TabsProps {
  value?: Signal<string>
  defaultValue?: string
  onChange?: (key: string) => void
  class?: string
  children?: any
}
export function Tabs(props: TabsProps, ctx: any) {
  const key = {}
  const value = props.value ?? signal(props.defaultValue ?? '')
  _tabsMap.set(key, value)
  onCleanup(() => _tabsMap.delete(key))
  return <div class={cn('flex flex-col', props.class)}>{props.children}</div>
}

export interface TabListProps { class?: string; children?: any }
export function TabList(props: TabListProps, ctx: any) {
  return <div role="tablist" class={cn('flex border-b border-gray-200', props.class)}>{props.children}</div>
}

export interface TabProps {
  value: string
  disabled?: boolean
  class?: string
  children?: any
}
export function Tab(props: TabProps, ctx: any) {
  // Find the nearest Tabs signal - walk up parent els
  // Simple approach: use a shared signal reference
  const key = _getTabsKey(ctx)
  const selected = key ? _tabsMap.get(key) : null
  if (!selected) return <button disabled>{props.children}</button>

  const isActive = computed(() => (selected?.value ?? '') === props.value)

  function onClick() {
    if (selected) selected.value = props.value
  }

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={props.disabled}
      class={cn(
        'px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset',
        computed(() => isActive.value
          ? 'text-blue-600 border-b-2 border-blue-600 -mb-[1px]'
          : 'text-gray-500 hover:text-gray-700'
        ),
        props.disabled && 'opacity-50 cursor-not-allowed',
        props.class,
      )}
      onClick={onClick}
    >
      {props.children}
    </button>
  )
}

export interface TabPanelProps {
  value: string
  class?: string
  children?: any
}
export function TabPanel(props: TabPanelProps, ctx: any) {
  const key = _getTabsKey(ctx)
  const selected = key ? _tabsMap.get(key) : null
  if (!selected) return null

  const isActive = computed(() => selected.value === props.value)
  const style = computed(() => isActive.value ? '' : 'display:none')

  return <div role="tabpanel" class={cn('pt-4', props.class)} style={style as any}>{props.children}</div>
}

// Walk up ctx to find Tabs key
function _getTabsKey(ctx: any): object | undefined {
  // In weifuwu/client, context is shared via the CTX singleton during rendering.
  // For simplicity, return the most recently created Tabs key.
  // This works for non-nested Tabs. For nested Tabs, the user should provide `value`.
  const keys = [..._tabsMap.keys()]
  return keys[keys.length - 1]
}
