import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'

export interface SliderMark {
  value: number
  label?: string
}

export interface SliderProps {
  label?: string
  /** 单值模式 value；range 模式 [lo, hi]（传反自动纠正） */
  value?: number | string | [number, number]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  /** range 模式：双滑块区间（价格/日期/年龄筛选——三库标配） */
  range?: boolean
  /** 刻度标记（轨道下方刻度线 + 可选文字标签） */
  marks?: SliderMark[]
  /** 单值拖拽结束回调（pointerup） */
  onChangeEnd?: (value: number) => void
  /** 单值实时回调 */
  onChange?: (value: number) => void
  /** range 实时回调（range 模式专用——类型独立防单值误用） */
  onRangeChange?: (value: [number, number]) => void
  /** range 拖拽结束回调 */
  onRangeChangeEnd?: (value: [number, number]) => void
}

export const Slider: Component<SliderProps> = (_init, ctx) => {
  // ── mount（只一次）：DOM 引用 + 显示状态（§5.1 ref 纪律：稳定引用定义在此）──
  let inputEl: HTMLInputElement | null = null
  let loInputEl: HTMLInputElement | null = null
  let hiInputEl: HTMLInputElement | null = null
  let latestValue: number | null = null
  let tipOpen = false
  let dragging = false
  let tipPos: { left: number; top: number } | null = null
  /** range 模式活动 thumb（hover/focus/拖拽中的那个——tooltip 跟随） */
  let activeThumb: 'lo' | 'hi' | null = null
  const inputRef = (el: HTMLInputElement | null) => { inputEl = el }
  const loInputRef = (el: HTMLInputElement | null) => { loInputEl = el }
  const hiInputRef = (el: HTMLInputElement | null) => { hiInputEl = el }
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
    ctx.render()
  }
  // §5.4 弹窗纪律：浮层一律命令式弹窗（唯一形态——openPopup——定位/视口夹紧/
  // Escape/外部点击——range 模式：anchor = 活动 thumb 的 input）
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncTip = (tip: import('../../vdom/index.ts').VNode | null): void => {
    if (tipOpen && !handle)
      handle = ctx.ui.openPopup({
        key: 'slider-tooltip',
        anchor: () => (activeThumb === 'lo' ? loInputEl : activeThumb === 'hi' ? hiInputEl : inputEl) as HTMLElement | null,
        position: () => tipPos ? { x: tipPos.left, y: tipPos.top } : { x: 0, y: 0 },
        content: () => tip,
        onClose: () => { handle = null; if (tipOpen) setTip(false) },
      })
    else if (!tipOpen && handle) { handle.close(); handle = null }
    else if (handle) handle.update(tip)
  }
  const browser = ctx.browser ?? createClientBrowser()

  return (props: SliderProps) => {
    const { label, value = 0, min = 0, max = 100, step = 1, onChange, onChangeEnd, disabled, marks, range, onRangeChange, onRangeChangeEnd } = props

    const numVal = Number(Array.isArray(value) ? value[0] : value)
    const rangeVal: [number, number] = Array.isArray(value)
      ? [Math.min(Number(value[0]), Number(value[1])), Math.max(Number(value[0]), Number(value[1]))]
      : [numVal, numVal]
    const span = max - min
    // 内部归一化到 0-100 刻度：浏览器对 0-100 的 range 不参与会话恢复/重算——
    // max=2000 的 slider 刷新后 thumb 被恢复为旧默认值并跳动（真实事故：
    // components-demo 2000 slider 刷新后 marker 从 100 跳到 800）——归一化后与
    // 音量/亮度（原生 0-100）同构，刷新直接停在正确位置。实际值按比例换算，
    // step 语义经换算层取整保持（内部刻度 = 实际 step 的比例）。
    const norm = (v: number) => span > 0 ? Math.min(100, Math.max(0, ((v - min) / span) * 100)) : 0
    const pct = norm(numVal)
    const loPct = norm(rangeVal[0])
    const hiPct = norm(rangeVal[1])
    const internalStep = span > 0 && step > 0 ? step / span * 100 : 1
    const toActual = (v: number): number => {
      const raw = min + (Number(v) / 100) * span
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

    // ── tooltip 坐标：活动 input rect + 进度百分比 → thumb 中心（openPopup 内核 视口夹紧） ──
    tipPos = null
    if (tipOpen && !disabled) {
      const activeEl = range ? (activeThumb === 'lo' ? loInputEl : activeThumb === 'hi' ? hiInputEl : hiInputEl) : inputEl
      const activePct = range ? (activeThumb === 'lo' ? loPct : hiPct) : pct
      if (activeEl) {
        const r = activeEl.getBoundingClientRect()
        if (r.width > 0) {
          tipPos = { left: Math.round(r.left + thumbX(r.width, activePct / 100)), top: Math.round(r.top - 36) }
          // **禁止 renderFn 里 handle?.refresh()（真实 bug——hover 卡死）**：
          // refresh 的 position 分支末尾 env.requestRender() → 重渲染 →
          // renderFn → refresh → **无限循环**（页面主线程忙死——hover slider
          // 立即卡死——playwright 复现）——拖拽跟随改由值变化事件（onInput/
          // onChange 回调——非渲染期——一次 refresh 后稳定）
        }
      }
    }

    // ── range 模式：双滑块（lo/hi 叠加——轨道透明，填充分离绘制） ──
    if (range) {
      const clampLo = (v: number) => Math.min(v, rangeVal[1] - step)
      const clampHi = (v: number) => Math.max(v, rangeVal[0] + step)
      const tipValue = activeThumb === 'lo' ? rangeVal[0] : rangeVal[1]
      const mkInput = (which: 'lo' | 'hi', ival: number, p: number, clamp: (v: number) => number) => h('input', {
        type: 'range',
        class: `wf-slider-input ${which === 'hi' ? 'wf-slider-input--hi' : 'wf-slider-input--lo'}`,
        ref: which === 'lo' ? loInputRef : hiInputRef,
        // 内部 0-100 刻度（min/max/step 同比例映射——浏览器不介入会话恢复）
        value: p,
        min: 0,
        max: 100,
        step: internalStep,
        disabled: disabled || undefined,
        autocomplete: 'off',
        'aria-label': which === 'lo' ? `${label ?? '范围'}下限` : `${label ?? '范围'}上限`,
        'aria-disabled': disabled ? 'true' : undefined,
        onInput: disabled ? undefined : (e: Event) => {
          const v = clamp(toActual(Number((e.target as HTMLInputElement).value)))
          onRangeChange?.([which === 'lo' ? v : rangeVal[0], which === 'hi' ? v : rangeVal[1]])
          handle?.refresh()
        },
        onChange: disabled ? undefined : (e: Event) => {
          const v = clamp(toActual(Number((e.target as HTMLInputElement).value)))
          onRangeChange?.([which === 'lo' ? v : rangeVal[0], which === 'hi' ? v : rangeVal[1]])
          handle?.refresh()
        },
        onPointerDown: disabled ? undefined : () => { dragging = true; activeThumb = which; setTip(true) },
        onPointerUp: disabled ? undefined : (e: Event) => {
          dragging = false
          const v = clamp(toActual(Number((e.target as HTMLInputElement).value)))
          onRangeChangeEnd?.([which === 'lo' ? v : rangeVal[0], which === 'hi' ? v : rangeVal[1]])
          setTip(false)
        },
        onPointerCancel: disabled ? undefined : () => { dragging = false; setTip(false) },
        onMouseEnter: disabled ? undefined : () => { activeThumb = which; setTip(true) },
        onMouseLeave: disabled ? undefined : () => { if (!dragging) setTip(false) },
        onFocus: disabled ? undefined : () => { activeThumb = which; setTip(true) },
        onBlur: disabled ? undefined : () => { if (!dragging) setTip(false) },
      })
      const fillWidth = `calc((100% - ${THUMB_R * 2}px) * ${(hiPct - loPct) / 100})`
      const display = h('span', { class: 'wf-slider-value' }, `${rangeVal[0]} - ${rangeVal[1]}`)
      const tip = disabled ? null : h('div', { class: 'wf-slider-tip' }, String(tipValue))
      const marksRow = marks?.length
        ? h('div', { class: 'wf-slider-marks' },
            marks.map((m) => {
              const mp = norm(m.value)
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
      const trackWrap = h('div', { class: 'wf-slider-track wf-slider-range' }, [
        h('div', { class: 'wf-slider-range-fill', style: { left: thumbOffset(loPct / 100), width: fillWidth } }),
        mkInput('lo', rangeVal[0], loPct, clampLo),
        mkInput('hi', rangeVal[1], hiPct, clampHi),
        marksRow,
      ])
      const row = h('div', { class: 'wf-slider' }, [trackWrap, display])
      syncTip(tip)
      if (!label) return h('div', { class: 'wf-slider-wrap' }, [row])
      return h('div', { class: 'wf-slider-wrap' }, [
        h('label', { class: 'wf-slider-label' }, label),
        row,
      ])
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
      onInput: disabled || !onChange ? undefined : (e: Event) => { onChange(toActual(Number((e.target as HTMLInputElement).value))); handle?.refresh() },
      onChange: disabled || !onChange ? undefined : (e: Event) => { onChange(toActual(Number((e.target as HTMLInputElement).value))); handle?.refresh() },
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
            const mp = span > 0 ? Math.min(100, Math.max(0, ((m.value - min) / span) * 100)) : 0
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

    syncTip(tip)
    if (!label) return h('div', { class: 'wf-slider-wrap' }, [row])

    return h('div', { class: 'wf-slider-wrap' }, [
      h('label', { class: 'wf-slider-label' }, label),
      row,
    ])
  }
}
