/**
 * vdom hooks — env（hooks 环境——per 组件实例）
 *
 * 设计（2026-12）：hooks 经 **ctx.ui 面**调用（`ctx.ui.useXXX`）——
 * instCtx.ui = createUi(env)——env 闭包绑定**当前组件实例**（compId 渲染
 * 触发/卸载注册）——无全局状态（零全局依赖——测试隔离天然）。
 *
 * requestRender = 组件级重渲染触发（当前实现：页面级 render——组件复用
 * 保持状态——组件级精准渲染为后续优化）。
 */
import { useStableRef, useOpen, useGlobalKey } from './basic.ts';
import { usePopup, usePopupPosition } from './popup.ts';
import { useControlled } from './controlled.ts';
import { useScrollPosition, useInView } from './observe.ts';
import { useControlledInput } from './input.ts';
import { useDragDrop, useMedia, useBreakpoint } from './drag-media.ts';
import { useChat } from './chat.ts';
import { useTween, useDrag, useVisualViewport, useReducedMotion } from './stable.ts';
/** 创建 ctx.ui 面（env 绑定当前组件实例） */
export function createUi(env) {
    return {
        useExternal(store) {
            // 订阅——store 变化 → 组件重渲染——unmount 自动退订
            env.onUnmount(store.subscribe(() => env.requestRender()));
            return store.state;
        },
        useStableRef: (initial, cleanup) => useStableRef(env, initial, cleanup),
        useOpen: (init, controlled) => useOpen(env, init, controlled),
        onUnmount: (fn) => env.onUnmount(fn),
        useGlobalKey: (matchOrHandler, handler) => useGlobalKey(env, matchOrHandler, handler),
        usePopup: (opts) => usePopup(env, opts),
        usePopupPosition: (options) => usePopupPosition(env, options),
        useControlled: (controlled, defaultValue) => useControlled(env, controlled, defaultValue),
        useScrollPosition: (target) => useScrollPosition(env, target),
        useInView: (target) => useInView(env, target),
        useControlledInput: (controlled, opts) => useControlledInput(env, controlled, opts),
        useDragDrop: (opts) => useDragDrop(env, opts),
        useMedia: (query) => useMedia(env, query),
        useBreakpoint: (breakpoints) => useBreakpoint(env, breakpoints),
        useChat: (opts) => useChat(env, opts),
        useTween: (target, opts) => useTween(env, target, opts),
        useDrag: (options) => useDrag(env, options),
        useVisualViewport: () => useVisualViewport(env),
        useReducedMotion: () => useReducedMotion(env),
    };
}
