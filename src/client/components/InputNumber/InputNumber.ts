/**
 * weifuwu/components — InputNumber
 *
 * 数字输入：min/max/step + 增减按钮 + precision 格式化 + 长按连增。
 * 受控 value: number | null；空值 → null；输入 clamp 到 min/max。
 * 裁剪（CS-05，见 docs/client.md）：千分位货币格式（业务自拼）。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface InputNumberProps {
  value?: number | null
  onChange?: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  precision?: number
  label?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  error?: string
  hint?: string
  required?: boolean
  className?: string
}

export const InputNumber: Component<InputNumberProps> = (_init, ctx) => {
  // mount scope：长按连增定时器 + latestStepTo ref（防 render 闭包陈旧）
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let holdInterval: ReturnType<typeof setInterval> | undefined
  let holdFired = false // 长按触发过连增——抬起时的 click 不再重复步进
  let latestStepTo: (dir: 1 | -1) => void = () => {}
  // **hold 资源通道（2026-08）**：unmount 清理挂起定时器（旧无清理——
  // 组件卸载后 timer 仍 fire → latestStepTo → onChange（卸载后回调——
  // 静默））——hold 语义：声明的资源在卸载时自动释放
  ctx.ui.hold(() => { clearTimeout(holdTimer); clearInterval(holdInterval) })
  const startHold = (dir: 1 | -1) => {
    clearTimeout(holdTimer); clearInterval(holdInterval)
    holdFired = false
    holdTimer = setTimeout(() => {
      holdFired = true
      holdInterval = setInterval(() => latestStepTo(dir), 60)
    }, 500)
  }
  const stopHold = () => { clearTimeout(holdTimer); clearInterval(holdInterval) }
  return (props) => {
    const {
      value = null, onChange, min, max, step = 1, precision,
      label, name, placeholder, disabled, error, hint, required, className,
    } = props

    const clamp = (n: number): number => {
      let v = n
      if (min != null) v = Math.max(min, v)
      if (max != null) v = Math.min(max, v)
      if (precision != null) v = Number(v.toFixed(precision))
      return v
    }

    const stepTo = (dir: 1 | -1) => {
      if (disabled) return
      const base = value ?? 0
      onChange?.(clamp(Number((base + dir * step).toFixed(10))))
    }
    latestStepTo = stepTo

    const handleInput = (e: Event) => {
      if (disabled) return
      const raw = (e.target as HTMLInputElement).value.trim()
      if (raw === '' || raw === '-') { onChange?.(null); return }
      if (!/^-?\d*\.?\d+$/.test(raw)) return // 非法字符忽略
      const n = Number(raw)
      if (Number.isNaN(n)) return
      onChange?.(clamp(n))
    }

    const display = value == null ? '' : String(precision != null ? value.toFixed(precision) : value)

    const labelEl = label
      ? h('label', { class: 'wf-inputnumber-label' }, [label, required ? h('span', { class: 'wf-inputnumber-req' }, '*') : null].filter(Boolean))
      : null

    const input = h('input', {
      class: 'wf-inputnumber-input',
      type: 'text',
      inputMode: 'decimal',
      value: display,
      placeholder,
      name,
      disabled,
      onInput: handleInput,
      onBlur: () => { if (value != null) onChange?.(clamp(value)) },
    })

    const up = h('button', {
      class: 'wf-inputnumber-btn',
      type: 'button',
      'aria-label': '增加',
      disabled,
      onClick: () => {
        if (holdFired) { holdFired = false; return } // 长按抬起后的 click 不重复步进
        stepTo(1)
      },
      onPointerDown: () => startHold(1),
      onPointerUp: stopHold,
      onPointerLeave: stopHold,
    }, h(Icon, { name: 'chevron-up', size: 12 }))

    const down = h('button', {
      class: 'wf-inputnumber-btn',
      type: 'button',
      'aria-label': '减少',
      disabled,
      onClick: () => {
        if (holdFired) { holdFired = false; return } // 长按抬起后的 click 不重复步进
        stepTo(-1)
      },
      onPointerDown: () => startHold(-1),
      onPointerUp: stopHold,
      onPointerLeave: stopHold,
    }, h(Icon, { name: 'chevron-down', size: 12 }))

    const wrap = h('div', {
      class: `wf-inputnumber${disabled ? ' wf-inputnumber--disabled' : ''}${error ? ' wf-inputnumber--err' : ''}${className ? ` ${className}` : ''}`,
    }, [input, h('div', { class: 'wf-inputnumber-btns' }, [up, down])])

    const children: any[] = []
    if (labelEl) children.push(labelEl)
    children.push(wrap)
    if (error) children.push(h('div', { class: 'wf-inputnumber-err' }, error))
    if (hint && !error) children.push(h('div', { class: 'wf-inputnumber-hint' }, hint))

    return h('div', { class: 'wf-inputnumber-wrap' }, children)
  }
}
