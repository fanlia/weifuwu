/**
 * weifuwu/client — Confirm 对话框
 *
 * 使用：
 *   import { createApp, confirm } from 'weifuwu/client'
 *
 *   createApp()
 *     .use(confirm())
 *     .mount('#root', () => <App />)
 *
 *   // 页面中使用
 *   if (await ctx.confirm?.('确定删除？')) {
 *     // 执行删除
 *   }
 */

import type { WfuiContext, AppMiddleware } from './types.ts'
import { lockScroll, unlockScroll } from './scroll-lock.ts'

export interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  variant?: 'primary' | 'danger'
}

export interface ConfirmState {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
}

/**
 * 创建一个 Promise 化的确认对话框。
 * 直接操作 DOM，不经过 VDOM。
 */
function createConfirmModal(message: string, options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    const {
      title = '确认操作',
      confirmText = '确定',
      cancelText = '取消',
      variant = 'primary',
    } = options

    // 创建 DOM
    const overlay = document.createElement('div')
    overlay.className = 'wf-modal'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center'

    const bg = document.createElement('div')
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:-1'

    const box = document.createElement('div')
    box.style.cssText = `background:var(--wf-color-bg,#fff);border-radius:var(--wf-radius-md,8px);box-shadow:var(--wf-shadow-lg,0 4px 24px rgba(0,0,0,0.12));min-width:360px;max-width:90vw;z-index:1`

    // Header
    if (title) {
      const header = document.createElement('div')
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--wf-color-border,#e5e7eb);font-family:var(--wf-font-sans);font-size:var(--wf-font-size-lg);font-weight:var(--wf-font-weight-semibold);color:var(--wf-color-text);line-height:1.4'
      header.textContent = title
      box.appendChild(header)
    }

    // Body
    const body = document.createElement('div')
    body.style.cssText = 'padding:20px;font-family:var(--wf-font-sans);font-size:var(--wf-font-size-sm);color:var(--wf-color-text);line-height:var(--wf-line-height-normal)'
    body.textContent = message
    box.appendChild(body)

    // Footer
    const footer = document.createElement('div')
    footer.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--wf-color-border,#e5e7eb)'

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'wf-btn wf-btn--secondary wf-btn--md'
    cancelBtn.textContent = cancelText

    const confirmBtn = document.createElement('button')
    confirmBtn.className = `wf-btn wf-btn--${variant} wf-btn--md`
    confirmBtn.textContent = confirmText

    footer.appendChild(cancelBtn)
    footer.appendChild(confirmBtn)
    box.appendChild(footer)
    overlay.appendChild(bg)
    overlay.appendChild(box)
    document.body.appendChild(overlay)

    lockScroll()

    const close = (result: boolean) => {
      unlockScroll()
      overlay.remove()
      resolve(result)
    }

    // ESC 关闭
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    document.addEventListener('keydown', onKeyDown)

    cancelBtn.onclick = () => { document.removeEventListener('keydown', onKeyDown); close(false) }
    confirmBtn.onclick = () => { document.removeEventListener('keydown', onKeyDown); close(true) }
    bg.onclick = () => { document.removeEventListener('keydown', onKeyDown); close(false) }
  })
}

export function confirm(): AppMiddleware {
  return (ctx: WfuiContext) => {
    ;(ctx as any).confirm = (message: string, options?: ConfirmOptions) =>
      createConfirmModal(message, options ?? {})
    return ctx
  }
}
