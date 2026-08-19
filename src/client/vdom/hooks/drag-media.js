/**
 * vdom hooks — drag/breakpoint（useDragDrop + useMedia/useBreakpoint）
 *
 * - useDragDrop：拖拽（draggable enumerated 属性显式 'true'——field/
 *   attributes 已处理；drag 事件回调——unmount 清理）
 * - useMedia：媒体查询匹配（matchMedia——change 监听 → 重渲染——
 *   经 ctx.browser.window——零全局直接访问；环境无 matchMedia → 恒 false）
 * - useBreakpoint：命名断点（min-width 语义——当前匹配的最大宽度断点）
 */
/** 拖拽（draggable enumerated 显式 'true'——事件回调——组件层传 data） */
export function useDragDrop(env, opts) {
    const source = {
        draggable: true, // enumerated——field/attributes 显式 'true'
        onDragStart: (e) => {
            if (opts.data !== undefined)
                e.dataTransfer?.setData('text/plain', JSON.stringify(opts.data));
            opts.onDragStart?.(e, opts.data);
        },
        onDragEnd: (e) => opts.onDragEnd?.(e),
    };
    return {
        draggableProps: source,
        dragProps: source,
        dropProps: {
            onDragOver: (e) => {
                e.preventDefault(); // 允许放置
                opts.onDragOver?.(e);
            },
            onDragLeave: (e) => opts.onDragLeave?.(e),
            onDrop: (e) => {
                e.preventDefault();
                let data;
                try {
                    data = e.dataTransfer?.getData('text/plain') ? JSON.parse(e.dataTransfer.getData('text/plain')) : undefined;
                }
                catch {
                    data = undefined;
                }
                opts.onDrop?.(e, data);
            },
        },
    };
}
/** 媒体查询匹配（change 监听 → 重渲染——环境无 matchMedia → 恒 false） */
export function useMedia(env, query) {
    const idx = env.nextHookIndex();
    const state = env.getHookState(idx) ?? { matches: false, mql: null };
    env.setHookState(idx, state);
    const win = env.getBrowser()?.window;
    // 全局 matchMedia 兜底（jsdom 测试 mock 通道——生产走注入）
    const mm = win?.matchMedia ?? (typeof matchMedia === 'function' ? matchMedia.bind(undefined) : undefined);
    const mql = mm?.(query);
    if (mql) {
        state.matches = mql.matches;
        if (!state.mql) {
            const onChange = () => {
                state.matches = mql.matches;
                env.requestRender();
            };
            mql.addEventListener('change', onChange);
            state.mql = mql;
            env.onUnmount(() => mql.removeEventListener('change', onChange));
        }
    }
    return state.matches;
}
/** 命名断点（min-width 语义——当前匹配的最大宽度断点——事件驱动重渲染） */
export function useBreakpoint(env, breakpoints) {
    const entries = Object.entries(breakpoints).sort((a, b) => a[1] - b[1]);
    let current = entries[0]?.[0] ?? 'default';
    for (const [name, width] of entries) {
        if (useMedia(env, `(min-width: ${width}px)`))
            current = name;
    }
    return current;
}
