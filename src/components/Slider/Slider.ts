import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
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
  let latestValue: number | null = null
  let tipOpen = false
  let dragging = false
  let tipPos: { left: number; top: number } | null = null
  const inputRef = (el: HTMLInputElement | null) => { inputEl = el }
  // 浏览器表单状态恢复（刷新/后退导航）会覆盖受控 value——恢复发生在 load/pageshow
  // 之前且无视 value attribute（实测：attribute=800 仍被改回 100）——恢复完成后同步
  // 一次，把控件拉回组件状态（真实事故：components-demo 2000 slider 刷新后
  // input.value=100 而数值显示 800——marker 与数值位置不一致）
  const syncAfterRestore = () => {
    if (inputEl && latestValue !== null && Number(inputEl.value) !== latestValue) {
      inputEl.value = String(latestValue)
    }
  }
  // §5.5 浏览器纪律：经 ctx.browser（环境 API——SSR no-op；组件禁直接 addEventListener）
  const _browser = ctx.browser ?? createClientBrowser()
  _browser.onFormRestore?.(syncAfterRestore)
  const setTip = (v: boolean) => {
    if (tipOpen === v) return
    tipOpen = v
    ctx.ui.render()
  }
  // §5.4 弹窗纪律：浮层一律 usePopup（统一组合器——定位/视口夹紧/Escape/portal）
  const popup = ctx.ui.usePopup({
    trigger: 'manual', // hover/拖动由 input 事件手动管理
    placement: 'top',
    gap: 8,
    el: () => inputEl as HTMLElement | null,
    isOpen: () => tipOpen,
    setOpen: (v) => { if (!v) setTip(false) },
    position: () => tipPos ? { x: tipPos.left, y: tipPos.top } : { x: 0, y: 0 },
  })
  const browser = ctx.browser ?? createClientBrowser()

  return async (props: SliderProps) => {
    const { label, value = 0, min = 0, max = 100, step = 1, onChange, onChangeEnd, disabled, marks } = props

    const numVal = Number(value)
    const range = max - min
    // 内部归一化到 0-100 刻度：浏览器对 0-100 的 range 不参与会话恢复/重算——
    // max=2000 的 slider 刷新后 thumb 被恢复为旧默认值并跳动（真实事故：
    // components-demo 2000 slider 刷新后 marker 从 100 跳到 800）——归一化后与
    // 音量/亮度（原生 0-100）同构，刷新直接停在正确位置。实际值按比例换算，
    // step 语义经换算层取整保持（内部刻度 = 实际 step 的比例）。
    const pct = range > 0 ? Math.min(100, Math.max(0, ((numVal - min) / range) * 100)) : 0
    const internalStep = range > 0 && step > 0 ? step / range * 100 : 1
    const toActual = (v: number): number => {
      const raw = min + (Number(v) / 100) * range
      const stepped = step > 0 ? Math.round((raw - min) / step) * step + min : raw
      return Math.min(max, Math.max(min, stepped))
    }
    latestValue = pct // 内部刻度（syncAfterRestore 同步用）
    // thumb 中心活动范围 = [轨道左 + 半宽, 轨道右 - 半宽]（原生 range 行为）——
    // marks/tooltip/渐变边界必须用同一偏移补偿（否则两端错位 9px、中间对齐）。
    // 与 CSS .wf-slider 的 --wf-slider-thumb-size 默认 18px 对应（覆盖该变量时此处需同步）。
    const THUMB_R = 9
    const thumbOffset = (t: number) => `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${t})`
    const thumbX = (w: number, t: number) => THUMB_R + t * (w - THUMB_R * 2)
    // 轨道进度填充：渐变边界 = thumb 中心（同一偏移补偿公式）——
    // 否则渐变用全宽百分比与 thumb 半宽偏移错位（0% thumb 超填充 9px / 100% 反向）
    const fillStop = `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${pct / 100})`
    const trackBg = `linear-gradient(to right, var(--wf-color-primary) ${fillStop}, var(--wf-color-border) ${fillStop})`

    // ── tooltip 坐标：input rect + 进度百分比 → thumb 中心（usePopup 视口夹紧） ──
    tipPos = null
    if (tipOpen && inputEl && !disabled) {
      const r = inputEl.getBoundingClientRect()
      if (r.width > 0) {
        tipPos = { left: Math.round(r.left + thumbX(r.width, pct / 100)), top: Math.round(r.top - 36) }
        // 拖拽中跟随 thumb：usePopup 只在 open/锚点变化/scroll 时重算坐标——
        // 锚点（input）恒定 → 位置冻结在打开瞬间（真实事故：components-demo
        // 2000 slider 拖拽中气泡文字实时、位置停在拖拽起点——marker 与数值错位）
        popup.refresh()
      }
    }

    const input = h('input', {
      type: 'range',
      class: ['wf-slider-input', disabled ? 'wf-slider-input--dis' : ''].filter(Boolean).join(' '),
      ref: inputRef,
      'aria-expanded': String(tipOpen),
      // 内部 0-100 刻度（min/max/step 同比例映射——浏览器不介入会话恢复）
      value: pct,
      min: 0,
      max: 100,
      step: internalStep,
      disabled: disabled || undefined,
      // 禁用浏览器表单状态恢复（刷新/后退时恢复旧值——受控组件错位 + 刷新跳动）
      autocomplete: 'off',
      'aria-label': label,
      'aria-disabled': disabled ? 'true' : undefined,
      style: { background: trackBg },
      // 拖拽实时回调：原生 range 拖拽期间只发 input——change 松手才发——
      // 只绑 onChange 时拖拽中气泡/数值显示陈旧（marker 与数值不一致——真实事故：
      // components-demo 2000 slider 拖到 1500 气泡仍显示 1000）。
      // onChange 绑 input（实时）+ onChangeEnd 收尾（pointerup——commit 语义）
      onInput: disabled || !onChange ? undefined : (e: Event) => onChange(toActual(Number((e.target as HTMLInputElement).value))),
      onChange: disabled || !onChange ? undefined : (e: Event) => onChange(toActual(Number((e.target as HTMLInputElement).value))),
      // 专业交互：hover/focus/拖拽显示当前值气泡；拖拽结束回调
      onPointerDown: disabled ? undefined : () => { dragging = true; setTip(true) },
      onPointerUp: disabled ? undefined : (e: Event) => {
        // 独立于 onChangeEnd——未传回调时也必须复位拖拽态并关闭气泡（拖拽残留 bug）
        dragging = false
        onChangeEnd?.(toActual(Number((e.target as HTMLInputElement).value)))
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

    // disabled 无 tip（语义——气泡仅在可交互时显示）
    const tip = disabled ? null : h('div', { class: 'wf-slider-tip' }, String(numVal))

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
      tip ? popup.portal(tip, 'slider-tooltip') : null,
    ])
  }
}
