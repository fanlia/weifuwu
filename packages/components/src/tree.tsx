/**
 * Tree — hierarchical tree view with expand/collapse.
 *
 * ```tsx
 * const treeData: TreeNode[] = [
 *   {
 *     key: 'src',
 *     title: 'src',
 *     children: [
 *       { key: 'src/index.ts', title: 'index.ts' },
 *       {
 *         key: 'src/components',
 *         title: 'components',
 *         children: [
 *           { key: 'src/components/button.tsx', title: 'button.tsx' },
 *           { key: 'src/components/modal.tsx', title: 'modal.tsx' },
 *         ],
 *       },
 *     ],
 *   },
 * ]
 * <Tree data={treeData} />
 * ```
 */
import { signal, computed } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface TreeNode {
  key: string
  title: string
  icon?: string
  children?: TreeNode[]
  disabled?: boolean
}

export interface TreeProps {
  data: TreeNode[]
  defaultExpandedKeys?: string[]
  selectedKey?: Signal<string | null>
  onSelect?: (key: string) => void
  showLine?: boolean
  class?: string
}

function TreeNodeItem(props: {
  node: TreeNode
  depth: number
  expandedKeys: Signal<Set<string>>
  selectedKey?: Signal<string | null>
  onSelect?: (key: string) => void
  showLine?: boolean
}) {
  const { node, depth, expandedKeys, selectedKey, onSelect, showLine } = props
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = computed(() => expandedKeys.value.has(node.key))
  const isSelected = computed(() => selectedKey?.value === node.key)

  function toggle() {
    const set = expandedKeys.value
    if (isExpanded.value) {
      set.delete(node.key)
    } else {
      set.add(node.key)
    }
    expandedKeys.value = new Set(set)
  }

  function select() {
    if (node.disabled) return
    if (selectedKey) selectedKey.value = node.key
    onSelect?.(node.key)
  }

  return (
    <div>
      {/* Node row */}
      <div
        class={cn(
          'flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer transition-colors text-sm',
          isSelected.value ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100 text-gray-700',
          node.disabled && 'opacity-50 cursor-not-allowed',
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={select}
      >
        {/* Expand/collapse caret */}
        {hasChildren ? (
          <button
            type="button"
            class="size-4 flex items-center justify-center text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"
            onClick={(e: MouseEvent) => { e.stopPropagation(); toggle() }}
          >
            {computed(() => isExpanded.value ? '▼' : '▶')}
          </button>
        ) : (
          <span class="size-4 flex-shrink-0" />
        )}

        {/* Icon */}
        {node.icon && <span class="text-sm flex-shrink-0">{node.icon}</span>}

        {/* Title */}
        <span class="truncate">{node.title}</span>
      </div>

      {/* Children */}
      {hasChildren && computed(() => {
        if (!isExpanded.value) return null
        return (
          <div>
            {node.children!.map(child => (
              <TreeNodeItem
                node={child}
                depth={depth + 1}
                expandedKeys={expandedKeys}
                selectedKey={selectedKey}
                onSelect={onSelect}
                showLine={showLine}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function Tree(props: TreeProps) {
  const { data, defaultExpandedKeys, selectedKey, onSelect, showLine, class: extraClass } = props
  const expandedKeys = signal(new Set(defaultExpandedKeys ?? []))
  const internalSelected = selectedKey ?? signal<string | null>(null)

  return (
    <div class={cn('select-none', extraClass)}>
      {data.map(node => (
        <TreeNodeItem
          node={node}
          depth={0}
          expandedKeys={expandedKeys}
          selectedKey={internalSelected}
          onSelect={onSelect}
          showLine={showLine}
        />
      ))}
    </div>
  )
}
