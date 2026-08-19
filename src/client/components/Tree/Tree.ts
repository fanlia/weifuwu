import type { Component } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { VirtualList } from '../VirtualList/VirtualList.ts'
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
  /** 搜索过滤（label 含 searchValue 的节点 + 祖先；自动展开匹配路径 + 高亮） */
  searchValue?: string
  /** 虚拟滚动（大数据树——固定行高 28px，只渲染可见窗口） */
  virtual?: boolean
  /** 虚拟滚动视口高度（px） */
  height?: number
  className?: string
}

function allKeys(node: TreeNode): string[] {
  return [node.key, ...(node.children ?? []).flatMap(allKeys)]
}

/** 搜索过滤：保留 label 含 q 的节点及其祖先（递归过滤子树） */
function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  const out: TreeNode[] = []
  for (const n of nodes) {
    const self = n.label.toLowerCase().includes(q)
    const kids = n.children ? filterTree(n.children, q) : []
    if (self || kids.length) {
      out.push({ ...n, children: kids.length ? kids : n.children })
    }
  }
  return out
}

/** 所有含子节点的 key（搜索时全部展开） */
function expandableKeys(nodes: TreeNode[]): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.children?.length) { out.push(n.key); out.push(...expandableKeys(n.children)) }
  }
  return out
}

/** 高亮 label 中匹配 q 的部分 */
function highlightLabel(label: string, q: string): any {
  if (!q) return label
  const lower = label.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) return label
  return [
    label.slice(0, idx),
    h('mark', { class: 'wf-tree-match' }, label.slice(idx, idx + q.length)),
    label.slice(idx + q.length),
  ]
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
 * indeterminate 半选态 + 搜索过滤 searchValue）。裁剪：拖拽、异步加载。
 */
export const Tree: Component<TreeProps> = async (_init, ctx) => {
  // 浏览器环境（ctx.browser 优先，测试/无注入环境 fallback createClientBrowser——自研惰性防御）
  const _browser = ctx.browser ?? createClientBrowser()
  // render-only：内部状态 let + 显式 render（非受控展开 keys）
  let internalExpanded: string[] = []

  let rowEls: (HTMLElement | null)[] = []
  const rowRefs: ((el: HTMLElement | null) => void)[] = []

  return async (props) => {
    const {
      data = [], expandedKeys, onExpand, expandOnClick,
      checkable, className, searchValue,
    } = props

    // 搜索过滤
    const q = (searchValue ?? '').trim().toLowerCase()
    const filteredData = q ? filterTree(data, q) : data
    const searchExpand = q ? new Set(expandableKeys(filteredData)) : null

    // useControlled：受控/非受控统一（缺回调 warn + 非受控内部态——
    // 原实现非受控选中/勾选静默不可点，受控纪律违规）
    const selCtrl = ctx?.ui?.useControlled<string[]>({ value: props.selectedKeys, onChange: props.onSelect, name: 'Tree' })
    const checkCtrl = ctx?.ui?.useControlled<string[]>({ value: props.checkedKeys, onChange: props.onCheck, name: 'Tree' })

    const parentMap = new Map<string, TreeNode | null>()
    buildParentMap(data, parentMap)

    // 展开状态
    const isControlledExpand = expandedKeys !== undefined
    const expanded: string[] = isControlledExpand ? expandedKeys : internalExpanded
    const isExpanded = (key: string) => searchExpand ? searchExpand.has(key) : expanded.includes(key)
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
      else { internalExpanded = next; ctx.render() }
    }

    // 选中（useControlled：非受控内部态 + 受控走 onSelect；缺回调 warn 幂等）
    const toggleSelect = (key: string) => {
      const current = selCtrl?.value ?? []
      const next = current.includes(key) ? [] : [key]
      const wasControlled = selCtrl?.controlled?.value !== undefined
      selCtrl?.setValue(next)
      // onSelect 通知语义（非受控也调）；受控时 setValue 已调
      if (!wasControlled) props.onSelect?.(next)
    }

    // 勾选（父子联动）——useControlled：非受控内部态 + 受控走 onCheck
    const toggleCheck = (node: TreeNode) => {
      const current = new Set(checkCtrl?.value ?? [])
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
      checkCtrl?.setValue(Array.from(current))
    }

    // 节点勾选状态推导（递归）：叶子看 checkedKeys；父节点 = 所有子都 checked → checked，
    // 部分 checked/half → half。半选必须向上传播（前端勾选 → 技术部半选 → 总部半选）
    const nodeState = (n: TreeNode): 'checked' | 'half' | 'unchecked' => {
      const kids = n.children ?? []
      const checked = checkCtrl?.value ?? []
      if (!kids.length) return checked.includes(n.key) ? 'checked' : 'unchecked'
      const states = kids.map(nodeState)
      if (states.every((s) => s === 'checked')) return 'checked'
      if (states.some((s) => s !== 'unchecked')) return 'half'
      return 'unchecked'
    }
    const isHalf = (node: TreeNode) => nodeState(node) === 'half'

    // 键盘：容器方向键移动焦点
    let flatNodes: TreeNode[] = []

    // 单行渲染（虚拟/非虚拟共用——行内容同一实现，防双份漂移）
    const renderRow = (node: TreeNode, level: number, rowIndex: number): any => {
      if (!rowRefs[rowIndex]) {
        rowRefs[rowIndex] = (el: HTMLElement | null) => { rowEls[rowIndex] = el }
      }
      const hasChildren = !!node.children?.length
      const open = isExpanded(node.key)
      const selected = (selCtrl?.value ?? []).includes(node.key)
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
        h('span', { class: 'wf-tree-label' }, highlightLabel(node.label, q)),
      ].filter(Boolean)

      return h('div', {
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
      }, rowChildren)
    }

    // 非虚拟：递归渲染（renderNode = 行 + 子节点容器）
    const renderNode = (node: TreeNode, level: number): any => {
      flatNodes.push(node)
      const rowIndex = flatNodes.length - 1
      const hasChildren = !!node.children?.length
      const open = isExpanded(node.key)
      return h('div', { class: 'wf-tree-node', key: node.key }, [
        renderRow(node, level, rowIndex),
        open && hasChildren
          ? h('div', { class: 'wf-tree-children' }, node.children!.map(c => renderNode(c, level + 1)))
          : null,
      ].filter(Boolean))
    }

    // 虚拟模式：可见节点扁平收集（展开态 DFS）——固定行高 28px
    const collectVisible = (nodes: TreeNode[], level: number): Array<{ node: TreeNode; level: number }> => {
      const out: Array<{ node: TreeNode; level: number }> = []
      const walk = (list: TreeNode[], lv: number) => {
        for (const n of list) {
          out.push({ node: n, level: lv })
          if (n.children?.length && isExpanded(n.key)) walk(n.children, lv + 1)
        }
      }
      walk(nodes, level)
      return out
    }

    // 空态提示：搜索无结果 vs 无数据（F2 状态矩阵——容器类基线）
    const emptyHint = filteredData.length === 0
      ? h('div', { class: 'wf-tree-empty' }, q ? '无匹配节点' : '暂无数据')
      : null

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
    const { virtual, height = 400 } = props
    if (virtual) {
      // 虚拟滚动：只渲染可见窗口（裁剪登记：virtual 模式键盘导航限于可见窗口——
      // VirtualList 无 scrollTo，跨窗口焦点移动不可达；滚动条滚动可达）
      const visible = collectVisible(filteredData, 0)
      flatNodes = visible.map((v) => v.node)
      const items = visible.map((v, i) => {
        // key = 节点 key（虚拟行身份——展开/折叠后行集合变化，key 防状态错位）
        return { key: v.node.key, node: v.node, level: v.level, i }
      })
      return h('div', {
        class: ['wf-tree', className].filter(Boolean).join(' '),
        role: 'tree',
      }, [
        h(VirtualList, {
          items,
          height,
          itemHeight: 28,
          overscan: 6,
          keyBy: (item: any) => item.key,
          renderItem: (item: any) => renderRow(item.node, item.level, item.i),
          emptyText: q ? '无匹配节点' : '暂无数据',
        }),
      ])
    }

    const roots = filteredData.map(n => renderNode(n, 0))

    return h('div', {
      class: ['wf-tree', className].filter(Boolean).join(' '),
      role: 'tree',
      onKeyDown,
    }, [emptyHint, ...roots].filter(Boolean))
  }
}
