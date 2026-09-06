/**
 * vdom hooks — useOverlay（弹层行为契约——开/关/焦点/滚动锁/Esc 单源）
 *
 * 设计（2027-09——分层抽象 W2）：弹层家族（Modal/Drawer/ActionSheet）的
 * 行为面（open 同步 openPopup 生命周期 · trapFocus · lockScroll ·
 * 遮罩点击 · Esc 关闭 · presence 退场）**契约化**——组件作者只写**皮**
 * （overlay/panel 的 class 与内容）——行为正确性由契约结构性保证。
 *
 * 分工（与 popup-manager 的关系）：useOverlay 是 popup-manager（openPopup）
 * 的**组件作者友好封装**（受控同步模式 Modal 先例的契约化）——float 定位
 * 族（Popover/Tooltip）不在此契约（正交组合 usePopupPosition——未来
 * usePopover 契约 = useOverlay + usePopupPosition）。
 *
 * 用法：
 *   const ov = ctx.ui.useOverlay({ open, onOpenChange, role: 'dialog', maskClosable })
 *   const root = h('div', { class: 'wf-modal' }, [
 *     h('div', { ...ov.maskProps, class: 'wf-modal-overlay' }),
 *     h('div', { ...ov.panelProps, class: 'wf-modal-content' }, content),
 *   ])
 *   ov.sync(root)   // 渲染期同步（openPopup 生命周期）
 *   return root
 */
import type { HookEnv } from './env.ts'
import { openPopup, type PopupHandle } from './popup-manager.ts'
import { useGlobalKey } from './basic.ts'
import type { VNode } from '../core/vnode.ts'

export interface OverlayOptions {
  /** 受控 open（父层） */
  open?: boolean
  /** 关闭上抛（遮罩/Esc/close()） */
  onOpenChange?: (v: boolean) => void
  /** 面板角色（默认 dialog——alertdialog 场景覆盖） */
  role?: string
  /** Tab 焦点困禁（默认 true——`{...panelProps}` 面板内循环） */
  trapFocus?: boolean
  /** 滚动锁（默认 true——body 锁定 + 焦点归还） */
  lockScroll?: boolean
  /** 遮罩点击关闭（默认 true——危险确认 false） */
  maskClosable?: boolean
  /** Esc 关闭（默认 true——危险确认可 false） */
  closeOnEscape?: boolean
  /** presence 退场动画（退场 class → animationend → 卸载） */
  presence?: boolean
}

export interface OverlayHandle {
  /** 遮罩面（onClick 行为——类名是皮——组件拼接） */
  maskProps: { onClick?: (e: Event) => void }
  /** 面板面（role/aria-modal——类名是皮） */
  panelProps: { role: string; 'aria-modal': true }
  /** 关闭（上抛 onOpenChange(false)） */
  close(): void
  /** 渲染期同步（openPopup 生命周期——open 变化/内容更新；latestOpts
   *  渲染期最新配置——缺省用 mount 初值） */
  sync(root: () => VNode, latestOpts?: OverlayOptions): void
}

/** 弹层行为契约（mount 期调用——状态闭包；sync 渲染期调用） */
export function useOverlay(env: HookEnv, opts: OverlayOptions): OverlayHandle {
  let handle: PopupHandle | null = null
  let latest = opts // 渲染期最新（close/mask 读最新配置）

  const maskProps = {
    onClick: (e: Event) => {
      if (latest.maskClosable !== false && e.target === e.currentTarget) close()
    },
  }
  const panelProps = { role: opts.role ?? 'dialog', 'aria-modal': true as const }
  const close = () => latest.onOpenChange?.(false)

  const sync = (getContent: () => VNode, latestOpts?: OverlayOptions) => {
    if (latestOpts) latest = latestOpts
    const open = !!latest.open
    if (open && !handle) {
      handle = openPopup(env, {
        key: 'overlay',
        presence: !!latest.presence,
        trapFocus: latest.trapFocus !== false,
        lockScroll: latest.lockScroll !== false,
        positioning: 'none',
        closeOnOutside: false, // 遮罩点击语义组件自控（maskProps）
        closeOnEscape: false,  // Esc 契约自控（mount 期 useGlobalKey——open 期间）
        content: getContent,
        onClose: () => { handle = null },
      })
    } else if (!open && handle) {
      handle.update(getContent())
      handle.close()
      handle = null
    } else if (handle) {
      handle.update(getContent())
    }
  }

  // Esc 关闭（mount 期注册——hook 顺序稳定；open 期间才触发——焦点在
  // trap 外也可关闭；closeOnEscape=false（危险确认）时短路）
  useGlobalKey(env, (e: KeyboardEvent) => {
    if (e.key === 'Escape' && handle?.open && latest.closeOnEscape !== false) close()
  })

  env.onUnmount?.(() => { if (handle) handle.close() })

  return { maskProps, panelProps, close, sync }
}
