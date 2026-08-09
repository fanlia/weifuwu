import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
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

/** 级联选择（对应 antd/EP Cascader）：多列面板逐级选择，点击叶子完成。
 * 裁剪：hover 展开、搜索、任意层级配置、异步加载。 */
export const Cascader: Component<CascaderProps> = (_init, ctx) => {
  // ── mount（只一次）──
  const $ = ctx.ui.$()
  $.open = false
  $.activePath = [] as string[] // 面板内推进的路径（不含最终选中提交）

  let triggerEl: HTMLElement | null = null
  const triggerRef = (el: HTMLElement | null) => { triggerEl = el }

  // usePopup：借用外部点击/Escape 关闭 + 面板定位/视口 clamp + portal
  // （触发仍走 trigger 自身 onClick=toggleOpen，不 spread wrapProps）
  const popup = ctx.ui.usePopup({
    trigger: 'click',
    placement: 'bottom',
    center: false,
    gap: 6,
    el: () => triggerEl,
    isOpen: () => $.open,
    setOpen: (v) => { $.open = v },
  })

  return (props) => {
    const {
      options = [], value, onChange, placeholder = '请选择', disabled,
      error, label, 'aria-label': ariaLabel,
    } = props

    // 当前面板路径：从 value 或内部 activePath
    const panelPath: string[] = $.open ? $.activePath : []

    // 打开瞬间坐标由 usePopup.portal 内部处理
    const toggleOpen = () => {
      if (disabled) return
      $.open = !$.open
      $.activePath = Array.isArray(value) ? [...value] : []
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
        $.activePath = nextPath
      } else {
        if (Array.isArray(value) && !onChange) {
          // 受控（value 已传）但无 onChange：选中无法生效——开发期提示（与 Collapse/Tree/Calendar 一致）
          console.warn(`[weifuwu/Cascader] 受控模式（value 已传）但未提供 onChange，选择无法生效。\n非受控：去掉 value；受控：传入 onChange={(path) => setPath(path)}`)
        }
        $.open = false
        onChange?.(nextPath)
      }
    }

    // 弹层列
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
      columns.push(h('div', {
        class: 'wf-cascader-col',
        key: level,
      }, levelOptions.map(opt => {
        const sel = activeOpt?.value === opt.value
        return h('button', {
          type: 'button',
          class: [
            'wf-cascader-opt',
            sel ? 'wf-cascader-opt--active' : '',
            opt.disabled ? 'wf-cascader-opt--dis' : '',
          ].filter(Boolean).join(' '),
          key: opt.value,
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

    const panel = popup.portal(h('div', {
      class: 'wf-cascader-panel',
      role: 'listbox',
    }, columns), 'popover')

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
      'aria-expanded': String($.open),
      ref: triggerRef,
      onClick: disabled ? undefined : toggleOpen,
    }, [
      h('span', {
        class: `wf-cascader-value${value?.length ? '' : ' wf-cascader-value--placeholder'}`,
      }, display),
      h('span', { class: `wf-cascader-arrow${$.open ? ' wf-cascader-arrow--open' : ''}` }, h(Icon, { name: 'chevron-down', size: 12 })),
    ])

    wrapChildren.push(h('div', { class: 'wf-cascader' }, [trigger, panel].filter(Boolean)))
    if (error) wrapChildren.push(h('div', { class: 'wf-cascader-err' }, error))

    return h('div', {
      class: 'wf-cascader-wrap',
    }, wrapChildren)
  }
}
