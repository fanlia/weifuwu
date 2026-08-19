/**
 * vdom hooks — 基础 hooks（useStableRef/useOpen/useGlobalKey）
 *
 * 设计（render-only 模型——AGENTS §4.2）：
 * - useStableRef：稳定引用容器（跨渲染保持——hooks 内部传递——引擎责任）
 * - useOpen：受控/非受控开关（**受控缺回调 warn**——AGENTS §5.2——
 *   静默不可用防护）；非受控内部状态 + 显式渲染
 * - useGlobalKey：全局键盘监听（Escape 关闭等——unmount 自动清理——
 *   经 ctx.browser.window——零全局直接访问）
 */
/** 稳定引用（**双形状**：容器 { current }——vdom 内部；ref 回调
 *  (el) => void——ui-dom 兼容——Select 用 `useStableRef(init, cleanup)`） */
export function useStableRef(env, initial, cleanup) {
    if (typeof initial === 'function') {
        // ui-dom 形状：ref 回调（el 挂载 → init；null → cleanup）
        const init = initial;
        const ref = (el) => { if (el)
            init(el);
        else
            cleanup?.(); };
        return ref;
    }
    const ref = { current: initial };
    return ref;
}
/** 受控/非受控开关（受控：open 由父独占——onOpenChange 唯一出口）
 *  **渲染期调用**（renderFn 内 ctx.ui.useOpen）——hook 状态缓存（per-instance
 *  index）——受控值读最新 props（AGENTS §3.1——renderFn 读最新 props）
 *  **双形状**：`useOpen(init, controlled?)`（vdom 既有）/
 *  `useOpen({ open, onOpenChange, name })`（ui-dom 兼容——组件消费） */
export function useOpen(env, initOrOpts, controlled) {
    const opts = typeof initOrOpts === 'object' ? initOrOpts : undefined;
    const init = typeof initOrOpts === 'boolean' ? initOrOpts : false;
    const ctrl = opts ?? controlled;
    const idx = env.nextHookIndex();
    const state = env.getHookState(idx) ?? { open: init };
    env.setHookState(idx, state);
    const isControlled = ctrl?.open !== undefined;
    return {
        get open() {
            return ctrl?.open ?? state.open; // 受控读最新 props——非受控读缓存状态
        },
        setOpen(v) {
            if (isControlled) {
                // 受控：唯一出口是回调（缺回调 = 静默不可用——AGENTS §5.2 warn）
                if (!ctrl?.onOpenChange) {
                    console.warn(`[vdom] useOpen${opts?.name ? `(${opts.name})` : ''} 受控缺 onOpenChange 回调——交互静默失效`);
                }
                ctrl?.onOpenChange?.(v);
            }
            else {
                state.open = v;
                env.requestRender();
            }
        },
        toggle() {
            this.setOpen(!this.open);
        },
    };
}
/** 全局键盘监听（Escape 关闭等——unmount 自动清理） */
export function useGlobalKey(env, matchOrHandler, handler) {
    // ui-dom 兼容单参：useGlobalKey((e) => ...)——无条件监听
    const match = handler ? matchOrHandler : (() => true);
    const fn = handler ?? matchOrHandler;
    const win = env.getBrowser()?.window;
    if (!win)
        return () => { };
    const onKey = (e) => {
        if (typeof match === 'string') {
            if (e.key !== match)
                return;
        }
        else if (!match(e))
            return;
        fn(e);
    };
    win.addEventListener('keydown', onKey);
    const off = () => win.removeEventListener('keydown', onKey);
    env.onUnmount(off);
    return off;
}
