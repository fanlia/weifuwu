import type { Component } from '../../ui-dom/vnode.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface ToggleProps {
  /** 按下状态（受控） */
  pressed?: boolean
  onPressedChange?: (pressed: boolean) => void
  variant?: 'default' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  'aria-label'?: string
  children?: any
  className?: string
  [key: string]: any
}

export interface ToggleGroupOption {
  value: string
  label?: any
  disabled?: boolean
}

export interface ToggleGroupProps {
  /** single 单选 / multiple 多选（shadcn 对齐） */
  type?: 'single' | 'multiple'
  value?: string | string[]
  onChange?: (value: string | string[]) => void
  options?: ToggleGroupOption[]
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

/** 单个切换按钮（对应 shadcn Toggle）：加粗/斜体/视图切换等 */
export const Toggle: Component<ToggleProps> = async (_init) =>
  (props) => {
    const {
      pressed, onPressedChange, variant = 'default', size = 'md',
      disabled, 'aria-label': ariaLabel, children, className, ...rest
    } = props
    return h('button', {
      type: 'button',
      class: [
        'wf-toggle',
        `wf-toggle--${variant}`,
        `wf-toggle--${size}`,
        pressed ? 'wf-toggle--pressed' : '',
        className,
      ].filter(Boolean).join(' '),
      'aria-pressed': pressed ? 'true' : 'false',
      'aria-label': ariaLabel || undefined,
      disabled: disabled || undefined,
      onClick: disabled ? undefined : () => onPressedChange?.(!pressed),
      ...rest,
    }, children)
  }

/** 切换按钮组（对应 shadcn ToggleGroup）：type=single 单选 / multiple 多选 */
export const ToggleGroup: Component<ToggleGroupProps> = async (_init, ctx) =>
  (props) => {
    const {
      type = 'single', options = [],
      size = 'md', disabled, 'aria-label': ariaLabel, className,
    } = props

    // useControlled：受控/非受控统一（原实现非受控静默不可点——受控纪律违规）
    const ctrl = ctx?.ui?.useControlled<string | string[]>({ value: props.value, onChange: props.onChange, name: 'ToggleGroup' })
    const value = ctrl?.value

    const isSelected = (v: string) =>
      type === 'multiple'
        ? Array.isArray(value) && value.includes(v)
        : value === v

    const handleToggle = (v: string) => {
      let next: string | string[]
      if (type === 'multiple') {
        const arr = Array.isArray(value) ? [...value] : []
        const i = arr.indexOf(v)
        if (i >= 0) arr.splice(i, 1)
        else arr.push(v)
        next = arr
      } else {
        next = v
      }
      const wasControlled = ctrl?.controlled
      ctrl?.setValue(next)
      // onChange 通知语义（非受控也调）；受控时 setValue 已调
      if (!wasControlled) props.onChange?.(next)
    }

    const handleKeyDown = (e: any) => {
      if (disabled || type !== 'single') return
      const idx = options.findIndex(o => o.value === value)
      if (idx < 0) return
      let next = idx
      if (e.key === 'ArrowRight') { e.preventDefault(); next = Math.min(idx + 1, options.length - 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); next = Math.max(idx - 1, 0) }
      else return
      const target = options[next]
      if (target && !target.disabled) handleToggle(target.value)
    }

    const buttons = options.map(o => h(Toggle, {
      key: o.value,
      pressed: isSelected(o.value),
      size,
      disabled: disabled || o.disabled,
      'aria-label': o.value,
      onClick: disabled || o.disabled ? undefined : () => handleToggle(o.value),
    }, o.label ?? o.value))

    return h('div', {
      class: ['wf-toggle-group', `wf-toggle-group--${size}`, className].filter(Boolean).join(' '),
      role: type === 'single' ? 'radiogroup' : 'group',
      'aria-label': ariaLabel || undefined,
      onKeyDown: handleKeyDown,
    }, buttons)
  }
