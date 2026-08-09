import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
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
 * 下拉经 createPortal + position:fixed（usePopupPosition 定位/跟随/夹紧）——
 * 与 DatePicker 同模式：父容器 overflow/transform 不影响弹出层。
 * 单选 selectedKeys / 多选 checkable checkedKeys（父子联动）。
 * 受控纪律：value 受控无 onChange → warn。
 */
export const TreeSelect: Component<TreeSelectProps> = (_init, ctx) => {
  let open = false
  let expanded: string[] = []
  let triggerEl: HTMLElement | null = null
  let panelEl: HTMLElement | null = null

  const popup = ctx.ui.usePopupPosition?.({
    el: () => triggerEl,
    isOpen: () => open,
    compute: (r) => ({ top: r.bottom + 4, left: r.left, width: r.width }),
    // 视口夹紧：dropdown 靠近右/下边缘时平移回视口内（防溢出不可点/点击穿透）
    panel: () => panelEl,
    margin: 4,
  }) ?? { top: 0, left: 0, width: 0, refresh: () => {} }

  const toggle = () => {
    open = !open
    // 打开时立即定位（ref 已就绪）
    if (open) popup.refresh()
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

  const triggerRef = (el: any) => {
    triggerEl = el as HTMLElement | null
    // 首次挂载后（含重渲染）若已打开 → 跟随定位
    if (el && open) popup.refresh()
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
      // 点击有子节点行 = 展开/折叠（直观）；叶子行 = 选中
      expandOnClick: true,
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

    const dropdown = open ? createPortal(
      h('div', {
        class: 'wf-treeselect-dropdown',
        style: { position: 'fixed', top: `${popup.top}px`, left: `${popup.left}px`, width: `${popup.width ?? 0}px` },
        ref: (el: any) => { panelEl = el as HTMLElement | null },
      }, tree),
      'treeselect',
    ) : null

    return h('div', { class: `wf-treeselect${className ? ` ${className}` : ''}` }, [
      h('div', {
        class: `wf-treeselect-trigger${open ? ' wf-treeselect-trigger--open' : ''}`,
        role: 'combobox',
        tabindex: 0,
        ref: triggerRef,
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
      dropdown,
    ].filter(Boolean))
  }
}
