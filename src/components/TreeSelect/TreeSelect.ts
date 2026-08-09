import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Tree } from '../Tree/Tree.ts'
import type { TreeNode } from '../Tree/Tree.ts'

export interface TreeSelectProps {
  /** 树选项（复用 TreeNode 结构） */
  options: TreeNode[]
  /** 受控：单选 string / 多选 string[] */
  value?: string | string[]
  /** 受控回调：单选 key / 多选 keys[] */
  onChange?: (value: any) => void
  /** 多选（checkable 父子联动语义） */
  multiple?: boolean
  placeholder?: string
  className?: string
}

/** 在树中按 key 找 label（选中显示用） */
export function findLabel(nodes: TreeNode[], key: string): string | undefined {
  for (const n of nodes) {
    if (n.key === key) return n.label
    if (n.children) {
      const found = findLabel(n.children, key)
      if (found) return found
    }
  }
  return undefined
}

/**
 * TreeSelect — 树形选择（Tree + 下拉组合）。
 * 单选 selectedKeys / 多选 checkable checkedKeys（父子联动）。
 * 受控纪律：value 受控无 onChange → warn。
 */
export const TreeSelect: Component<TreeSelectProps> = (_init, ctx) => {
  let open = false
  let expanded: string[] = []

  const toggle = () => {
    open = !open
    ctx.ui.render()
  }

  const pickLabel = (value: string | string[] | undefined, options: TreeNode[]): string => {
    if (value === undefined || value === null) return ''
    if (Array.isArray(value)) {
      if (value.length === 0) return ''
      const labels = value.map(k => findLabel(options, k)).filter(Boolean)
      if (labels.length === 0) return ''
      return labels.length > 2
        ? `${labels.slice(0, 2).join('、')} 等 ${labels.length} 项`
        : labels.join('、')
    }
    return findLabel(options, value) ?? ''
  }

  return (props) => {
    const {
      options,
      value,
      onChange,
      multiple = false,
      placeholder = '请选择',
      className = '',
    } = props

    // 受控纪律
    if (value !== undefined && !onChange) {
      console.warn('[weifuwu] TreeSelect: 传入了受控 value 但缺少 onChange 回调——选择将静默失效')
    }

    const label = pickLabel(value, options)
    const isMultiple = multiple && Array.isArray(value)

    const tree = h(Tree, {
      data: options,
      selectedKeys: isMultiple ? undefined : value ? [value as string] : [],
      onSelect: (keys: string[]) => {
        if (keys.length === 0) return
        onChange?.(keys[0])
        open = false
        ctx.ui.render()
      },
      checkable: multiple || undefined,
      checkedKeys: isMultiple ? (value as string[]) : undefined,
      onCheck: multiple ? (keys: string[]) => {
        onChange?.(keys)
      } : undefined,
      expandedKeys: expanded,
      onExpand: (keys: string[]) => {
        expanded = keys
        ctx.ui.render()
      },
    })

    return h('div', { class: `wf-treeselect${className ? ` ${className}` : ''}` }, [
      h('div', {
        class: `wf-treeselect-trigger${open ? ' wf-treeselect-trigger--open' : ''}`,
        role: 'combobox',
        tabindex: 0,
        onClick: toggle,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        },
      }, [
        h('span', { class: label ? 'wf-treeselect-label' : 'wf-treeselect-placeholder' }, label || placeholder),
        h('span', { class: `wf-treeselect-arrow${open ? ' wf-treeselect-arrow--open' : ''}` }),
      ]),
      open && h('div', { class: 'wf-treeselect-dropdown' }, tree),
    ].filter(Boolean))
  }
}
