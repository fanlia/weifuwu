import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface TransferItem {
  key: string
  label: string
  disabled?: boolean
}

export interface TransferProps {
  data?: TransferItem[]
  /** 目标侧已选 keys */
  targetKeys?: string[]
  onChange?: (targetKeys: string[]) => void
  titles?: [string, string]
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  /** 显示搜索框（每侧独立过滤，内部态） */
  showSearch?: boolean
  /** 搜索占位符 */
  searchPlaceholder?: string
}

/** 穿梭框（对应 antd/EP Transfer）：双列表 + 中间穿梭按钮 + 可选搜索。
 * 裁剪：拖拽排序、自定义渲染。 */
export const Transfer: Component<TransferProps> = async (_init, ctx) => {
  // render-only：内部状态 let + 显式 render（选中/搜索词）
  let selLeft: string[] = []
  let selRight: string[] = []
  let kwLeft = ''
  let kwRight = ''

  return async (props) => {
    const {
      data = [], targetKeys = [], onChange, titles = ['源列表', '目标列表'],
      size = 'md', disabled, showSearch, searchPlaceholder = '搜索…',
    } = props

    const leftData = data.filter(d => !targetKeys.includes(d.key))
    const rightData = data.filter(d => targetKeys.includes(d.key))

    const toggleSel = (side: 'left' | 'right', key: string) => {
      if (disabled) return
      const arr: string[] = side === 'left' ? selLeft : selRight
      const next = arr.includes(key) ? arr.filter((k: string) => k !== key) : [...arr, key]
      if (side === 'left') selLeft = next
      else selRight = next
      ctx.ui.render()
    }

    const moveRight = () => {
      if (!onChange || selLeft.length === 0) return
      const next = [...targetKeys, ...selLeft]
      selLeft = []
      ctx.ui.render()
      onChange(next)
    }

    const moveLeft = () => {
      if (!onChange || selRight.length === 0) return
      const next = targetKeys.filter(k => !selRight.includes(k))
      selRight = []
      ctx.ui.render()
      onChange(next)
    }

    const renderList = (side: 'left' | 'right', items: TransferItem[]) => {
      const sel = side === 'left' ? selLeft : selRight
      const kw = (side === 'left' ? kwLeft : kwRight).toLowerCase()
      const filtered = kw ? items.filter(it => it.label.toLowerCase().includes(kw)) : items
      const searchInput = showSearch
        ? h('input', {
            class: 'wf-transfer-search wf-input',
            type: 'text',
            placeholder: searchPlaceholder,
            value: side === 'left' ? kwLeft : kwRight,
            onInput: (e: any) => { if (side === 'left') kwLeft = e.target.value; else kwRight = e.target.value; ctx.ui.render() },
          })
        : null
      return h('div', { class: `wf-transfer-list wf-transfer-list--${side}` }, [
        h('div', { class: 'wf-transfer-title' }, titles[side === 'left' ? 0 : 1]),
        searchInput,
        h('div', { class: 'wf-transfer-body' },
          filtered.length === 0
            ? [h('div', { class: 'wf-transfer-empty' }, kw ? '无匹配' : '暂无数据')]
            : filtered.map(item =>
                h('button', {
                  type: 'button',
                  class: [
                    'wf-transfer-item',
                    sel.includes(item.key) ? 'wf-transfer-item--sel' : '',
                    item.disabled ? 'wf-transfer-item--dis' : '',
                  ].filter(Boolean).join(' '),
                  key: item.key,
                  disabled: item.disabled || undefined,
                  onClick: item.disabled ? undefined : () => toggleSel(side, item.key),
                }, item.label)
              )
        ),
      ].filter(Boolean))
    }

    const rightDisabled = selLeft.length === 0 || disabled
    const leftDisabled = selRight.length === 0 || disabled

    const actions = h('div', { class: 'wf-transfer-actions' }, [
      h('button', {
        type: 'button',
        class: 'wf-transfer-btn',
        disabled: leftDisabled || undefined,
        'aria-label': '移回左侧',
        onClick: leftDisabled ? undefined : moveLeft,
      }, h(Icon, { name: 'arrow-left', size: 14 })),
      h('button', {
        type: 'button',
        class: 'wf-transfer-btn',
        disabled: rightDisabled || undefined,
        'aria-label': '移至右侧',
        onClick: rightDisabled ? undefined : moveRight,
      }, h(Icon, { name: 'arrow-right', size: 14 })),
    ])

    return h('div', { class: `wf-transfer wf-transfer--${size}` }, [
      renderList('left', leftData),
      actions,
      renderList('right', rightData),
    ])
  }
}
