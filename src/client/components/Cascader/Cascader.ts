import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface CascaderOption {
  value: string
  label: string
  children?: CascaderOption[]
  disabled?: boolean
}

export interface CascaderProps {
  options?: CascaderOption[]
  /** 选中路径（数组，如 ['zj','hz','xh']） */
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
  error?: string
  label?: string
  /** 显示搜索框（面板内，关键词时扁平过滤结果列表） */
  showSearch?: boolean
  /** 搜索占位符 */
  searchPlaceholder?: string
  'aria-label'?: string
}

function findPathLabel(options: CascaderOption[], path: string[], sep = ' / '): string {
  let cur: CascaderOption[] | undefined = options
  const labels: string[] = []
  for (const key of path) {
    const opt: CascaderOption | undefined = cur?.find((o: CascaderOption) => o.value === key)
    if (!opt) break
    labels.push(opt.label)
    cur = opt.children
  }
  return labels.join(sep)
}

/** 展开所有叶子路径（用于搜索扁平结果；递归累积 label） */
function flattenLeafPaths(options: CascaderOption[], prefix: string[] = [], prefixLabels: string[] = []): { path: string[]; labels: string[] }[] {
  const out: { path: string[]; labels: string[] }[] = []
  for (const o of options) {
    const p = [...prefix, o.value]
    const ls = [...prefixLabels, o.label]
    if (o.children?.length) {
      out.push(...flattenLeafPaths(o.children, p, ls))
    } else {
      out.push({ path: p, labels: ls })
    }
  }
  return out
}

/** 级联选择（对应 antd/EP Cascader）：多列面板逐级选择，点击叶子完成 + 可选搜索。
 * 裁剪（CS-05，见 design/components-cuts.md）：hover 展开、任意层级配置、异步加载。 */
export const Cascader: Component<CascaderProps> = async (_init, ctx) => {
  // render-only：内部状态 let + 显式 render（open/面板路径/搜索词）
  let open = false
  let activePath: string[] = [] // 面板内推进的路径（不含最终选中提交）
  let kw = ''

  let triggerEl: HTMLElement | null = null
  const triggerRef = (el: HTMLElement | null) => { triggerEl = el }

  // 键盘导航高亮（R43 W1：listbox 方向键 + Enter/Home/End/←→ 列推进）
  let hl: { col: number; idx: number } = { col: 0, idx: 0 }
  let hlSearch = 0

  // usePopup：借用外部点击/Escape 关闭 + 面板定位/视口 clamp + portal
  // （触发仍走 trigger 自身 onClick=toggleOpen，不 spread wrapProps）
  const popup = ctx.ui.usePopup({
    trigger: 'click',
    placement: 'bottom',
    center: false,
    gap: 6,
    el: () => triggerEl,
    isOpen: () => open,
    setOpen: (v) => { open = v; ctx.render() }, // 外部点击/Escape 关闭必须显式渲染
  })

  return async (props) => {
    const {
      options = [], value, onChange, placeholder = '请选择', disabled,
      error, label, showSearch, searchPlaceholder = '搜索…', 'aria-label': ariaLabel,
    } = props

    // 当前面板路径：从 value 或内部 activePath
    const panelPath: string[] = open ? activePath : []

    // 打开瞬间坐标由 usePopup.portal 内部处理
    const toggleOpen = () => {
      if (disabled) return
      open = !open
      activePath = Array.isArray(value) ? [...value] : []
      if (open) { hl = { col: 0, idx: 0 }; hlSearch = 0 } // 打开重置键盘高亮
      ctx.render()
    }

    const resolve = (path: string[]): CascaderOption[] => {
      let cur: CascaderOption[] = options
      for (const key of path) {
        const opt = cur.find(o => o.value === key)
        if (!opt?.children) return cur
        cur = opt.children
      }
      return cur
    }

    const pick = (opt: CascaderOption, path: string[]) => {
      if (opt.disabled) return
      const nextPath = [...path, opt.value]
      if (opt.children?.length) {
        activePath = nextPath
        hl = { col: hl.col + 1, idx: 0 } // 键盘焦点跟随推进列（否则 Enter 后仍操作旧列）
        ctx.render()
      } else {
        if (Array.isArray(value) && !onChange) {
          // 受控（value 已传）但无 onChange：选中无法生效——开发期提示（与 Collapse/Tree/Calendar 一致）
          console.warn(`[weifuwu/Cascader] 受控模式（value 已传）但未提供 onChange，选择无法生效。\n非受控：去掉 value；受控：传入 onChange={(path) => setPath(path)}`)
        }
        open = false
        ctx.render()
        onChange?.(nextPath)
      }
    }

    // 搜索态选择（键盘 Enter 与点击共用——受控提示/关闭/提交）
    const pickMatched = (m: { path: string[]; labels: string[] }) => {
      if (Array.isArray(value) && !onChange) {
        console.warn(`[weifuwu/Cascader] 受控模式（value 已传）但未提供 onChange，选择无法生效。`)
      }
      open = false; kw = ''
      ctx.render()
      onChange?.(m.path)
    }

    // 弹层列 + 列数据（colData 供键盘定位——path/options 快照与 columns 同步）
    const colData: { path: string[]; options: typeof options }[] = []
    let columns: any[] = []
    let path: string[] = []
    let level = 0
    while (true) {
      const levelOptions = resolve(path)
      const activeOpt = panelPath[level]
        ? levelOptions.find(o => o.value === panelPath[level])
        : undefined
      // 闭包陷阱：所有列 onClick 若捕获外层 path 变量，点击时读的是循环结束值。
      // 必须为每列快照当前 path（levelPath），否则从根重新选择时 path 错误。
      const levelPath = [...path]
      colData.push({ path: levelPath, options: levelOptions })
      // 键盘高亮钳制（列结构变化后不越界）
      const curIdx = hl.col === level ? Math.min(hl.idx, Math.max(levelOptions.length - 1, 0)) : -1
      columns.push(h('div', {
        class: 'wf-cascader-col',
        key: level,
      }, levelOptions.map((opt, idx) => {
        const sel = activeOpt?.value === opt.value
        const hlThis = hl.col === level && idx === curIdx
        return h('button', {
          type: 'button',
          class: [
            'wf-cascader-opt',
            sel ? 'wf-cascader-opt--active' : '',
            hlThis ? 'wf-cascader-opt--hl' : '',
            opt.disabled ? 'wf-cascader-opt--dis' : '',
          ].filter(Boolean).join(' '),
          key: opt.value,
          'aria-selected': String(hlThis || sel),
          onClick: () => pick(opt, levelPath),
        }, [
          h('span', { class: 'wf-cascader-opt-label' }, opt.label),
          opt.children?.length
            ? h('span', { class: 'wf-cascader-opt-arrow' }, h(Icon, { name: 'chevron-right', size: 12 }))
            : null,
        ].filter(Boolean))
      })))
      if (!activeOpt?.children?.length) break
      path = [...path, activeOpt.value]
      level++
    }

    // 搜索态：扁平过滤结果列表
    const kwLower = kw.trim().toLowerCase()
    let panelBody: any
    let matched: { path: string[]; labels: string[] }[] = []
    if (showSearch && kwLower) {
      const all = flattenLeafPaths(options)
      matched = all.filter(m => m.labels.some(lb => lb.toLowerCase().includes(kwLower)))
      panelBody = matched.length === 0
        ? h('div', { class: 'wf-cascader-empty' }, '无匹配')
        : h('div', { class: 'wf-cascader-search-results' }, matched.map(m =>
            h('button', {
              type: 'button',
              class: 'wf-cascader-search-item',
              key: m.path.join('/'),
              'aria-selected': String(hlSearch === matched.indexOf(m)),
              onClick: () => pickMatched(m),
            }, m.labels.join(' / '))
          ))
    } else {
      panelBody = columns
    }

    const searchInput = showSearch
      ? h('input', {
          class: 'wf-cascader-search wf-input',
          type: 'text',
          placeholder: searchPlaceholder,
          value: kw,
          onInput: (e: any) => { kw = e.target.value; ctx.render() },
        })
      : null

    // 面板键盘导航（render 内定义——依赖最新 colData/matched；Escape 由 usePopup 处理）
    const onPanelKeyDown = (e: any) => {
      const k = e.key
      if (k === 'Escape') return
      // 搜索态：扁平结果 ↑↓/Home/End/Enter
      if (showSearch && kwLower) {
        const total = matched.length
        if (!total) return
        if (k === 'ArrowDown') { e.preventDefault(); hlSearch = Math.min(hlSearch + 1, total - 1); ctx.render() }
        else if (k === 'ArrowUp') { e.preventDefault(); hlSearch = Math.max(hlSearch - 1, 0); ctx.render() }
        else if (k === 'Home') { e.preventDefault(); hlSearch = 0; ctx.render() }
        else if (k === 'End') { e.preventDefault(); hlSearch = total - 1; ctx.render() }
        else if (k === 'Enter' && matched[hlSearch]) { e.preventDefault(); pickMatched(matched[hlSearch]) }
        return
      }
      // 列态：当前列 ↑↓ 移动 / ←→ 推进回退 / Home/End / Enter 选择
      const col = colData[hl.col]
      if (!col || !col.options.length) return
      const n = col.options.length
      if (k === 'ArrowDown') { e.preventDefault(); hl = { col: hl.col, idx: Math.min(hl.idx + 1, n - 1) }; ctx.render() }
      else if (k === 'ArrowUp') { e.preventDefault(); hl = { col: hl.col, idx: Math.max(hl.idx - 1, 0) }; ctx.render() }
      else if (k === 'Home') { e.preventDefault(); hl = { col: hl.col, idx: 0 }; ctx.render() }
      else if (k === 'End') { e.preventDefault(); hl = { col: hl.col, idx: n - 1 }; ctx.render() }
      else if (k === 'ArrowRight') {
        const opt = col.options[Math.min(hl.idx, n - 1)]
        if (opt?.children?.length) {
          e.preventDefault()
          activePath = [...col.path, opt.value]
          hl = { col: hl.col + 1, idx: 0 }
          ctx.render()
        }
      }
      else if (k === 'ArrowLeft') {
        if (hl.col > 0) {
          e.preventDefault()
          // 回退目标列路径（列由 activePath 驱动——只改 hl 不会减列）
          const target = colData[hl.col - 1]
          activePath = [...target.path]
          hl = { col: hl.col - 1, idx: 0 }
          ctx.render()
        }
      }
      else if (k === 'Enter' && !col.options[Math.min(hl.idx, n - 1)]?.disabled) {
        e.preventDefault()
        pick(col.options[Math.min(hl.idx, n - 1)], col.path)
      }
    }

    const panel = popup.portal(h('div', {
      class: 'wf-cascader-panel',
      role: 'listbox',
      onKeyDown: onPanelKeyDown,
    }, showSearch ? [searchInput, panelBody].filter(Boolean) : panelBody), 'popover')

    const display = Array.isArray(value) && value.length
      ? findPathLabel(options, value)
      : placeholder

    const wrapChildren: any[] = []
    if (label) wrapChildren.push(h('label', { class: 'wf-cascader-label' }, label))

    const trigger = h('button', {
      type: 'button',
      class: `wf-cascader-trigger${disabled ? ' wf-cascader-trigger--dis' : ''}${error ? ' wf-cascader-trigger--err' : ''}`,
      'aria-label': ariaLabel,
      'aria-haspopup': 'listbox',
      'aria-expanded': String(open),
      ref: triggerRef,
      onClick: disabled ? undefined : toggleOpen,
    }, [
      h('span', {
        class: `wf-cascader-value${value?.length ? '' : ' wf-cascader-value--placeholder'}`,
      }, display),
      h('span', { class: `wf-cascader-arrow${open ? ' wf-cascader-arrow--open' : ''}` }, h(Icon, { name: 'chevron-down', size: 12 })),
    ])

    wrapChildren.push(h('div', { class: 'wf-cascader' }, [trigger, panel].filter(Boolean)))
    if (error) wrapChildren.push(h('div', { class: 'wf-cascader-err' }, error))

    return h('div', {
      class: 'wf-cascader-wrap',
    }, wrapChildren)
  }
}
