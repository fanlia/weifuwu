import type { Component } from '../../client/vnode.ts'
import { createClientBrowser } from '../../client/browser.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface TreeNode {
  key: string
  label: string
  children?: TreeNode[]
  disabled?: boolean
  icon?: any
}

export interface TreeProps {
  data?: TreeNode[]
  /** 受控选中 keys */
  selectedKeys?: string[]
  onSelect?: (keys: string[]) => void
  /** 受控展开 keys */
  expandedKeys?: string[]
  onExpand?: (keys: string[]) => void
  /** 勾选模式（父子联动，antd 非 strict 语义） */
  checkable?: boolean
  /** 点击有子节点的行 = 展开/折叠（不触发选中）——TreeSelect 场景（点行展开比点箭头直观） */
  expandOnClick?: boolean
  checkedKeys?: string[]
  onCheck?: (keys: string[]) => void
  className?: string
}

function allKeys(node: TreeNode): string[] {
  return [node.key, ...(node.children ?? []).flatMap(allKeys)]
}

/** 构建 key → 父节点 映射 */
function buildParentMap(nodes: TreeNode[], map: Map<string, TreeNode | null>, parent: TreeNode | null = null): void {
  for (const n of nodes) {
    map.set(n.key, parent)
    if (n.children) buildParentMap(n.children, map, n)
  }
}

/**
 * 树形（对应 antd/EP Tree）：递归节点 + 展开/折叠 + 单选 + 勾选（父子联动 +
 * indeterminate 半选态）。裁剪：拖拽、异步加载、搜索过滤。
 */
export const Tree: Component<TreeProps> = (_init, ctx) => {
  // 浏览器环境（ctx.browser 优先，测试/无注入环境 fallback jsdom）
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  const $ = ctx.ui.$()
  $.internalExpanded = [] as string[]

  let rowEls: (HTMLElement | null)[] = []
  const rowRefs: ((el: HTMLElement | null) => void)[] = []

  return (props) => {
    const {
      data = [], selectedKeys, onSelect, expandedKeys, onExpand, expandOnClick,
      checkable, checkedKeys, onCheck, className,
    } = props

    const parentMap = new Map<string, TreeNode | null>()
    buildParentMap(data, parentMap)

    // 展开状态
    const isControlledExpand = expandedKeys !== undefined
    const expanded: string[] = isControlledExpand ? expandedKeys : $.internalExpanded
    const isExpanded = (key: string) => expanded.includes(key)
    const toggleExpand = (key: string) => {
      // 受控（expandedKeys 已传）但无 onExpand：折叠/展开无法生效——开发期提示
      if (isControlledExpand && !onExpand) {
        console.warn(`[weifuwu/Tree] 受控模式（expandedKeys 已传）但未提供 onExpand，展开/折叠无法生效。\n非受控：去掉 expandedKeys；受控：传入 onExpand={(keys) => setExpanded(keys)}`)
        return
      }
      const next = isExpanded(key)
        ? expanded.filter(k => k !== key)
        : [...expanded, key]
      if (isControlledExpand) onExpand?.(next)
      else $.internalExpanded = next
    }

    // 选中
    const toggleSelect = (key: string) => {
      if (!onSelect) return
      const next = (selectedKeys ?? []).includes(key)
        ? []
        : [key]
      onSelect(next)
    }

    // 勾选（父子联动）
    const toggleCheck = (node: TreeNode) => {
      if (!onCheck) {
        // 受控（checkedKeys 已传）但无 onCheck：点击无法生效——开发期提示（与 Collapse 一致）
        if (checkedKeys !== undefined) {
          console.warn(`[weifuwu/Tree] 受控模式（checkedKeys 已传）但未提供 onCheck，勾选无法生效。\n非受控：去掉 checkedKeys；受控：传入 onCheck={(keys) => setKeys(keys)}`)
        }
        return
      }
      const current = new Set(checkedKeys ?? [])
      const all = allKeys(node)
      if (current.has(node.key)) {
        // 取消：移除自身 + 后代
        for (const k of all) current.delete(k)
        // 祖先更新：部分子选中 → 保留（半选）；全不选 → 移除
        let p = parentMap.get(node.key)
        while (p) {
          const kids = p.children ?? []
          const anyKid = kids.some(c => current.has(c.key))
          if (!anyKid) current.delete(p.key)
          p = parentMap.get(p.key)
        }
      } else {
        // 勾选：添加自身 + 后代
        for (const k of all) current.add(k)
        // 祖先：任一子选中 → 父加入（半选态也加入，antd 非 strict）
        let p = parentMap.get(node.key)
        while (p) {
          const kids = p.children ?? []
          if (kids.some(c => current.has(c.key))) current.add(p.key)
          p = parentMap.get(p.key)
        }
      }
      onCheck(Array.from(current))
    }

    // 节点勾选状态推导（递归）：叶子看 checkedKeys；父节点 = 所有子都 checked → checked，
    // 部分 checked/half → half。半选必须向上传播（前端勾选 → 技术部半选 → 总部半选）
    const nodeState = (n: TreeNode): 'checked' | 'half' | 'unchecked' => {
      const kids = n.children ?? []
      const checked = checkedKeys ?? []
      if (!kids.length) return checked.includes(n.key) ? 'checked' : 'unchecked'
      const states = kids.map(nodeState)
      if (states.every((s) => s === 'checked')) return 'checked'
      if (states.some((s) => s !== 'unchecked')) return 'half'
      return 'unchecked'
    }
    const isHalf = (node: TreeNode) => nodeState(node) === 'half'

    // 键盘：容器方向键移动焦点
    let flatNodes: TreeNode[] = []

    const renderNode = (node: TreeNode, level: number): any => {
      flatNodes.push(node)
      const rowIndex = flatNodes.length - 1
      if (!rowRefs[rowIndex]) {
        rowRefs[rowIndex] = (el: HTMLElement | null) => { rowEls[rowIndex] = el }
      }

      const hasChildren = !!node.children?.length
      const open = isExpanded(node.key)
      const selected = (selectedKeys ?? []).includes(node.key)
      const checked = nodeState(node) === 'checked' // 推导状态（祖先全选时即使不在 checkedKeys 也显示勾选）

      const switcher = hasChildren
        ? h('button', {
            type: 'button',
            class: `wf-tree-switcher${open ? ' wf-tree-switcher--open' : ''}`,
            'aria-label': open ? '折叠' : '展开',
            onClick: (e: Event) => { e.stopPropagation(); toggleExpand(node.key) },
          }, h(Icon, { name: 'chevron-down', size: 12 }))
        : h('span', { class: 'wf-tree-switcher-placeholder' })

      const checkbox = checkable
        ? h('button', {
            type: 'button',
            class: [
              'wf-tree-checkbox',
              checked ? 'wf-tree-checkbox--checked' : '',
              isHalf(node) ? 'wf-tree-checkbox--half' : '',
            ].filter(Boolean).join(' '),
            role: 'checkbox',
            'aria-checked': isHalf(node) ? 'mixed' : (checked ? 'true' : 'false'),
            onClick: (e: Event) => { e.stopPropagation(); toggleCheck(node) },
          })
        : null

      const rowChildren: any[] = [
        switcher,
        checkbox,
        node.icon,
        h('span', { class: 'wf-tree-label' }, node.label),
      ].filter(Boolean)

      return h('div', { class: 'wf-tree-node', key: node.key }, [
        h('div', {
          class: [
            'wf-tree-row',
            selected ? 'wf-tree-row--selected' : '',
            node.disabled ? 'wf-tree-row--disabled' : '',
          ].filter(Boolean).join(' '),
          style: { paddingLeft: `${level * 20}px` },
          ref: rowRefs[rowIndex],
          tabIndex: node.disabled ? undefined : 0,
          'aria-selected': selected ? 'true' : 'false',
          onClick: node.disabled ? undefined : () => {
            // expandOnClick：有子节点 → 展开/折叠；叶子 → 选中
            if (hasChildren && expandOnClick) toggleExpand(node.key)
            else toggleSelect(node.key)
          },
          onKeyDown: node.disabled ? undefined : (e: any) => {
            if (e.key === 'Enter') { e.preventDefault(); toggleSelect(node.key) }
            else if (e.key === ' ' && checkable) { e.preventDefault(); toggleCheck(node) }
            else if (e.key === 'ArrowRight' && hasChildren) { e.preventDefault(); if (!open) toggleExpand(node.key) }
            else if (e.key === 'ArrowLeft' && hasChildren) { e.preventDefault(); if (open) toggleExpand(node.key) }
          },
        }, rowChildren),
        open && hasChildren
          ? h('div', { class: 'wf-tree-children' }, node.children!.map(c => renderNode(c, level + 1)))
          : null,
      ].filter(Boolean))
    }

    // 容器键盘（方向键上下移动焦点）
    const onKeyDown = (e: any) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const current = (_browser?.activeElement() ?? null)
      const idx = rowEls.indexOf(current as HTMLElement)
      if (idx < 0) return
      e.preventDefault()
      const next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, rowEls.length - 1)
        : Math.max(idx - 1, 0)
      rowEls[next]?.focus()
    }

    flatNodes = []
    const roots = data.map(n => renderNode(n, 0))

    return h('div', {
      class: ['wf-tree', className].filter(Boolean).join(' '),
      role: 'tree',
      onKeyDown,
    }, roots)
  }
}
