import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { stream, ev } from '../../ui-dom/vdom3/events.ts'

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  /** 目标元素选择器（ctx.browser.query） */
  target: string
  title: string
  content: string
  /** 气泡相对目标的位置（默认 bottom） */
  placement?: TourPlacement
}

export interface TourProps {
  steps: TourStep[]
  /** 受控：是否打开 */
  open?: boolean
  /** 受控回调（关闭时 onChange(false)） */
  onChange?: (open: boolean) => void
  /** 受控：当前步骤索引 */
  current?: number
  /** 步骤变化回调 */
  onStepChange?: (step: number) => void
  /** 完成/跳过回调 */
  onFinish?: () => void
  /** 遮罩（默认 true） */
  mask?: boolean
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Tour — 新手引导（步骤式）。
 * 统一 usePopup：mask 遮罩 + portal 出口；position 回调更新目标 rect（scroll 跟随）。
 *
 * 状态纪律：
 * - 步骤索引闭包 let + render()（手动模式——避免 $ 内置类型问题）
 * - open 受控（props.open + onChange）
 */
export const Tour: Component<TourProps> = async (_init, ctx) => {
  let step = 0 // 非受控内部步骤（受控 current 时忽略）
  let targetEl: HTMLElement | null = null
  let rect: Rect = { top: 0, left: 0, width: 0, height: 0 }

  // 统一 usePopup：mask 遮罩 + portal 出口；position 回调更新目标 rect（scroll 跟随经
  // usePopup 内部 popup-tracker——refresh → position → rect 更新 → render 重算坐标）
  const popup = ctx.ui.usePopup({
    mask: true,
    maskClosable: false,       // 遮罩点击不关（步骤由按钮控制）
    positioning: 'none',       // panel（highlight+bubble）自定位（fixed 视口坐标）
    closeOnOutside: false, closeOnEscape: false,
    el: () => targetEl,
    isOpen: () => latestOpen,
    setOpen: (v) => { if (!v) close() },
    position: () => {
      const r = targetEl?.getBoundingClientRect()
      if (r) rect = { top: r.top, left: r.left, width: r.width, height: r.height }
      const p = bubblePos(rect, latestPlacement)
      return { x: p.left, y: p.top }
    },
  })

  let latestPlacement: TourPlacement = 'bottom'
  let latestOpen = false
  let latestProps: TourProps = { steps: [] }
  const open = () => latestOpen

  // 全局 Escape（不依赖焦点在 overlay 内——真实用户可能焦点在其他处）
  ctx.ui.useGlobalKey?.((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open()) close()
  })

  const goTo = (s: number) => {
    latestProps.onStepChange?.(s)
    // 非受控 current 时内部推进
    if (latestProps.current === undefined) {
      step = s
      refresh()
    }
  }

  const close = () => {
    latestProps.onChange?.(false)
    if (latestProps.open === undefined) {
      latestOpen = false
      ctx.ui.render()
    }
  }

  /** 完成/跳过：onFinish 回调 + 自行关闭兜底（真实 bug：受控模式缺 onFinish
   *  回调 → 点完成 no-op → 弹窗永不消失） */
  const finish = () => {
    const controlled = latestProps.open !== undefined
    latestProps.onFinish?.()
    if (!controlled || !latestProps.onFinish) {
      // 非受控 / 受控缺 onFinish：onChange 通知 + 自行关闭（否则弹窗永不消失）
      latestProps.onChange?.(false)
      latestOpen = false
      ctx.ui.render()
    }
  }

  const refresh = () => {
    targetEl = latestProps.steps[step]?.target
      ? (ctx.browser?.query(latestProps.steps[step].target) as HTMLElement | null)
      : null
    popup.refresh()
    ctx.ui.render()
  }

  return async (props) => {
    latestProps = props
    latestOpen = !!props.open
    const isControlledOpen = props.open !== undefined
    const current = props.current ?? step
    latestPlacement = props.steps[current]?.placement ?? 'bottom'

    // 目标变化（打开/步骤切换）→ 重新查询元素 + 重算坐标（仅 refresh，不触发渲染）
    if (latestOpen && props.steps[current]) {
      const t = ctx.browser?.query(props.steps[current].target) as HTMLElement | null
      if (t !== targetEl) {
        targetEl = t
        if (t) {
          // 打开/步骤切换：目标带进视口（引导标准行为——highlight/bubble 可见；
          // 仅目标变化时滚动——滚动跟随的 renderFn 重跑（t 不变）不触发——防死循环）
          // 组件副作用事件：滚动到目标（effect:scroll——可观测）
          stream.emit(ev('effect', 'scroll', undefined, { target: t.getAttribute?.('data-v3-id') ?? null }))
          try { t.scrollIntoView({ block: 'center' }) } catch { /* 无 scrollIntoView 环境（SSR） */ }
        }
        popup.refresh()
      }
    }

    if (!latestOpen && !isControlledOpen) {
      // 非受控打开需要外部调？——非受控不提供 open 入口（本组件 open 受控为主）
      // 但为了简单：非受控 + 未打开 = null（打开由受控 open 或 onMount 决定）
      return null
    }
    if (!latestOpen) return null

    const st = props.steps[current]
    if (!st) return null

    const isLast = current >= props.steps.length - 1
    const bp = bubblePos(rect, latestPlacement)
    const bubbleX = bp.left
    const bubbleY = bp.top

    const bubble = h('div', {
      class: `wf-tour-bubble wf-tour-bubble--${latestPlacement}`,
      style: { left: `${bubbleX}px`, top: `${bubbleY}px` },
    }, [
      h('div', { class: 'wf-tour-bubble-header' }, [
        h('span', { class: 'wf-tour-title' }, st.title),
        h('span', { class: 'wf-tour-step' }, `${current + 1} / ${props.steps.length}`),
      ]),
      h('div', { class: 'wf-tour-content' }, st.content),
      h('div', { class: 'wf-tour-actions' }, [
        h('button', {
          class: 'wf-tour-btn wf-tour-btn--ghost',
          onClick: () => finish(),
        }, '跳过'),
        current > 0 && h('button', {
          class: 'wf-tour-btn wf-tour-btn--ghost',
          onClick: () => goTo(current - 1),
        }, '上一步'),
        h('button', {
          class: 'wf-tour-btn wf-tour-btn--primary',
          onClick: () => isLast ? finish() : goTo(current + 1),
        }, isLast ? '完成' : '下一步'),
      ].filter(Boolean)),
    ])

    const highlight = h('div', {
      class: 'wf-tour-highlight',
      style: {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      },
    })

    // mask 由 usePopup 提供（mask: true）——panel 内容 = highlight + bubble（fixed 视口坐标）
    return popup.portal(h('div', { class: 'wf-tour-layer' }, [highlight, bubble]), 'tour')
  }
}

function bubblePos(rect: Rect, placement: TourPlacement): { top: number; left: number; width: number } {
  const GAP = 10
  switch (placement) {
    case 'top':
      return { top: rect.top - GAP, left: rect.left, width: rect.width }
    case 'left':
      return { top: rect.top, left: rect.left - GAP, width: rect.width }
    case 'right':
      return { top: rect.top, left: rect.left + rect.width + GAP, width: rect.width }
    case 'bottom':
    default:
      return { top: rect.top + rect.height + GAP, left: rect.left, width: rect.width }
  }
}
