import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
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
  disabled?: boolean
  error?: string
  /** 虚拟滚动（大数据树——透传 Tree；固定行高 28） */
  virtual?: boolean
  /** 虚拟滚动视口高度（px） */
  height?: number
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
 * 弹层经 ctx.ui.usePopup（§5.4 弹窗纪律统一组合器）：portal 到 #__wf_portal +
 * fixed 定位/视口夹紧 + 外部点击关闭 + Escape 关闭 + ref 稳定——不再手写
 * usePopupPosition/createPortal/panelRef（此前缺外部点击关闭的真实 bug）。
 * 单选 selectedKeys / 多选 checkable checkedKeys（父子联动）。
 * 受控纪律：value 受控无 onChange → warn。
 */
export const TreeSelect: Component<TreeSelectProps> = async (_init, ctx) => {
  let open = false
  let expanded: string[] = []
  let triggerEl: HTMLElement | null = null

  // 弹层组合器：portal + 定位/夹紧 + 外部点击/Escape 关闭（统一能力）
  const popup = ctx.ui.usePopup?.({
    trigger: () => 'click',
    placement: () => 'bottom',
    center: false,
    gap: 4,
    el: () => triggerEl,
    isOpen: () => open,
    setOpen: (v) => { open = v; ctx.render() }, // 外部点击/Escape 关闭必须显式渲染
  }) ?? {
    open: false, setOpen: () => {}, wrapProps: {},
    portal: () => null, refresh: () => {},
  }

  const toggle = () => {
    popup.setOpen(!popup.open)
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

  // 稳定 ref（AGENTS.md 纪律）：内联 ref 每次渲染新引用 → 回调重复执行
  const triggerRef = (el: any) => {
    triggerEl = el as HTMLElement | null
    // 首次挂载后（含重渲染）若已打开 → 跟随定位
    if (el && popup.open) popup.refresh()
  }

  return async (props) => {
    const {
      options,
      value,
      onChange,
      multiple = false,
      placeholder = '请选择',
      disabled,
      error,
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
      virtual: props.virtual,
      height: props.height ?? 320,
      // 点击有子节点行 = 展开/折叠（直观）；叶子行 = 选中
      expandOnClick: true,
      selectedKeys: isMultiple ? undefined : value ? [value as string] : [],
      onSelect: (keys: string[]) => {
        if (keys.length === 0) return
        onChange?.(keys[0])
        popup.setOpen(false)
      },
      checkable: multiple || undefined,
      checkedKeys: isMultiple ? (value as string[]) : undefined,
      onCheck: multiple ? (keys: string[]) => {
        onChange?.(keys)
      } : undefined,
      expandedKeys: expanded,
      onExpand: (keys: string[]) => {
        expanded = keys
        ctx.render()
      },
    })

    const dropdown = popup.portal(
      h('div', { class: 'wf-treeselect-dropdown' }, tree),
      'treeselect',
    )

    // 不 spread popup.wrapProps：TreeSelect 自管 trigger（click 切换开/关）——
    // usePopup 的 wrapProps.onClick 是「只开不关」（Select 教训），spread 会导致
    // 外层 div 点击误开。只用 portal（外部点击关闭/Escape/定位）能力。
    return h('div', {
      class: `wf-treeselect${className ? ` ${className}` : ''}`,
    }, [
      h('div', {
        class: [
          'wf-treeselect-trigger',
          open ? ' wf-treeselect-trigger--open' : '',
          disabled ? ' wf-treeselect-trigger--dis' : '',
          error ? ' wf-treeselect-trigger--err' : '',
        ].filter(Boolean).join(' '),
        role: 'combobox',
        tabindex: disabled ? -1 : 0,
        'aria-haspopup': 'listbox',
        'aria-expanded': String(open),
        'aria-disabled': disabled ? 'true' : undefined,
        ref: triggerRef,
        onClick: disabled ? undefined : toggle,
        onKeyDown: (e: KeyboardEvent) => {
          if (disabled) return
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
