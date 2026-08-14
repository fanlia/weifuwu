import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createPortal, h } from '../../ui-dom/vnode.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'

export interface SliderMark {
  value: number
  label?: string
}

export interface SliderProps {
  label?: string
  value?: number | string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  /** 刻度标记（轨道下方刻度线 + 可选文字标签） */
  marks?: SliderMark[]
  /** 拖拽结束回调（pointerup） */
  onChangeEnd?: (value: number) => void
  onChange?: (value: number) => void
}

export const Slider: Component<SliderProps> = async (_init, ctx) => {
  // ── mount（只一次）：DOM 引用 + 显示状态（§5.1 ref 纪律：稳定引用定义在此）──
  let inputEl: HTMLInputElement | null = null
  let tipOpen = false
  let dragging = false
  const inputRef = (el: HTMLInputElement | null) => { inputEl = el }
  const setTip = (v: boolean) => {
    if (tipOpen === v) return
    tipOpen = v
    ctx.ui.render()
  }
  const browser = ctx.browser ?? createClientBrowser()

  return async (props: SliderProps) => {
    const { label, value = 0, min = 0, max = 100, step = 1, onChange, onChangeEnd, disabled, marks } = props

    const numVal = Number(value)
    const range = max - min
    // thumb 中心活动范围 = [轨道左 + 半宽, 轨道右 - 半宽]（原生 range 行为）——
    // marks/tooltip/渐变边界必须用同一偏移补偿（否则两端错位 9px、中间对齐）。
    // 与 CSS .wf-slider 的 --wf-slider-thumb-size 默认 18px 对应（覆盖该变量时此处需同步）。
    const THUMB_R = 9
    const thumbOffset = (t: number) => `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${t})`
    const thumbX = (w: number, t: number) => THUMB_R + t * (w - THUMB_R * 2)
    // 轨道进度填充：渐变边界 = thumb 中心（同一偏移补偿公式）——
    // 否则渐变用全宽百分比与 thumb 半宽偏移错位（0% thumb 超填充 9px / 100% 反向）
    const pct = range > 0 ? Math.min(100, Math.max(0, ((numVal - min) / range) * 100)) : 0
    const fillStop = `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${pct / 100})`
    const trackBg = `linear-gradient(to right, var(--wf-color-primary) ${fillStop}, var(--wf-color-border) ${fillStop})`

    // ── tooltip 坐标：input rect + 进度百分比 → thumb 中心；视口边缘手动 clamp ──
    let tipStyle: Record<string, string> | null = null
    if (tipOpen && inputEl && !disabled) {
      const r = inputEl.getBoundingClientRect()
      if (r.width > 0) {
        const vw = browser.viewportWidth?.() ?? 0
        const left = Math.max(24, Math.min(vw - 24, r.left + thumbX(r.width, pct / 100)))
        const top = Math.max(8, r.top - 36)
        tipStyle = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
      }
    }

    const input = h('input', {
      type: 'range',
      class: ['wf-slider-input', disabled ? 'wf-slider-input--dis' : ''].filter(Boolean).join(' '),
      ref: inputRef,
      value: numVal,
      min,
      max,
      step,
      disabled: disabled || undefined,
      'aria-label': label,
      'aria-disabled': disabled ? 'true' : undefined,
      style: { background: trackBg },
      onChange: disabled || !onChange ? undefined : (e: Event) => onChange(Number((e.target as HTMLInputElement).value)),
      // 专业交互：hover/focus/拖拽显示当前值气泡；拖拽结束回调
      onPointerDown: disabled ? undefined : () => { dragging = true; setTip(true) },
      onPointerUp: disabled ? undefined : (e: Event) => {
        // 独立于 onChangeEnd——未传回调时也必须复位拖拽态并关闭气泡（拖拽残留 bug）
        dragging = false
        onChangeEnd?.(Number((e.target as HTMLInputElement).value))
        setTip(false)
      },
      onPointerCancel: disabled ? undefined : () => {
        // 拖拽被打断（触摸滚动/系统手势）——同样复位，防 dragging 残留锁死气泡
        dragging = false
        setTip(false)
      },
      onMouseEnter: disabled ? undefined : () => setTip(true),
      onMouseLeave: disabled ? undefined : () => { if (!dragging) setTip(false) },
      onFocus: disabled ? undefined : () => setTip(true),
      onBlur: disabled ? undefined : () => { if (!dragging) setTip(false) },
    })

    const display = h('span', { class: 'wf-slider-value' }, String(numVal))

    const tip = tipStyle
      ? createPortal(h('div', { class: 'wf-slider-tip', style: { position: 'fixed', ...tipStyle } }, String(numVal)), 'slider-tooltip')
      : null

    // ── marks 刻度：与 input 同宽容器（flex:1）内绝对定位 ──
    const marksRow = marks?.length
      ? h('div', { class: 'wf-slider-marks' },
          marks.map((m) => {
            const mp = range > 0 ? Math.min(100, Math.max(0, ((m.value - min) / range) * 100)) : 0
            return h('div', {
              key: `mark-${m.value}`,
              class: 'wf-slider-mark',
              style: { left: thumbOffset(mp / 100) },
            }, [
              h('span', { class: 'wf-slider-mark-dot' }),
              m.label ? h('span', { class: 'wf-slider-mark-label' }, m.label) : null,
            ])
          }),
        )
      : null

    const trackWrap = h('div', { class: 'wf-slider-track' }, [
      input,
      marksRow,
    ])

    const row = h('div', { class: 'wf-slider' }, [
      trackWrap,
      display,
    ])

    if (!label) return h('div', { class: 'wf-slider-wrap' }, [row, tip])

    return h('div', { class: 'wf-slider-wrap' }, [
      h('label', { class: 'wf-slider-label' }, label),
      row,
      tip,
    ])
  }
}
