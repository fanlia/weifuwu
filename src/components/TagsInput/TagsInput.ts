/**
 * weifuwu/components — TagsInput
 *
 * 标签输入：回车/逗号添加、Backspace 删除、去重、maxTags 限制。
 * 中文输入法 composition 感知（输入法候选词确认的 Enter 不触发添加）。
 * 裁剪：不做下拉建议（组合 Select searchable）。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface TagsInputProps {
  value?: string[]
  onChange?: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
  allowDuplicates?: boolean
  disabled?: boolean
  label?: string
  error?: string
  hint?: string
  className?: string
}

export const TagsInput: Component<TagsInputProps> = async (_init, ctx) => {
  // 输入法 composition 状态（中文候选词确认 Enter 不应提交标签）
  let composing = false

  return (props: TagsInputProps) => {
    const {
      placeholder, maxTags, allowDuplicates,
      disabled, label, error, hint, className,
    } = props

    // useControlled：受控/非受控统一（原非受控 add/remove 不可用——受控纪律违规）
    const ctrl = ctx?.ui?.useControlled<string[]>({ value: props.value, onChange: props.onChange, name: 'TagsInput' })
    const value = ctrl?.value ?? []
    const setTags = (next: string[]) => {
      const wasControlled = ctrl?.controlled
      ctrl?.setValue(next)
      if (!wasControlled) props.onChange?.(next)
    }

    const addTag = (raw: string) => {
      if (disabled) return
      const tag = raw.trim().replace(/,$/, '')
      if (!tag) return
      if (maxTags != null && value.length >= maxTags) return
      if (!allowDuplicates && value.includes(tag)) return
      setTags([...value, tag])
    }

    const removeTag = (tag: string) => {
      if (disabled) return
      setTags(value.filter((t) => t !== tag))
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLInputElement
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        if (composing) return // 输入法确认候选词：不提交
        addTag(el.value)
        el.value = ''
      } else if (e.key === 'Backspace' && !el.value && value.length > 0) {
        removeTag(value[value.length - 1])
      }
    }

    const labelEl = label
      ? h('label', { class: 'wf-input-label' }, label)
      : null

    const tags = value.map((t) =>
      h('span', { key: t, class: 'wf-tags-tag' }, [
        h('span', { class: 'wf-tags-text' }, t),
        h('button', {
          class: 'wf-tags-remove', type: 'button',
          'aria-label': `移除 ${t}`,
          onClick: () => removeTag(t),
        }, h(Icon, { name: 'close', size: 12 })),
      ]))

    const input = h('input', {
      class: 'wf-tags-input',
      type: 'text',
      placeholder: value.length === 0 ? placeholder : undefined,
      disabled,
      onKeyDown: handleKeyDown,
      onCompositionStart: () => { composing = true },
      onCompositionEnd: () => { composing = false },
    })

    const wrap = h('div', {
      class: `wf-tags${disabled ? ' wf-tags--disabled' : ''}${error ? ' wf-tags--err' : ''}${className ? ` ${className}` : ''}`,
    }, [...tags, input])

    const children: any[] = []
    if (labelEl) children.push(labelEl)
    children.push(wrap)
    if (error) children.push(h('div', { class: 'wf-input-err' }, error))
    if (hint && !error) children.push(h('div', { class: 'wf-input-hint' }, hint))

    return h('div', { class: 'wf-field' }, children)
  }
}
