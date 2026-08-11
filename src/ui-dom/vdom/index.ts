/**
 * vdom — 全新虚拟 DOM 引擎（第 2 代）
 *
 * 设计初衷（修复第 1 代死循环/动态挂载问题）：
 * - 组件 vnode 进入 diff 前**必须已构建**（`_render` 已设）——diff 永不调用组件工厂
 * - 构建（buildVNode）是 async 的，统一在渲染入口完成（首帧 / renderByIds / 导航）
 * - 动态挂载组件在 buildVNode 阶段被 await（构建完成）→ diff 同步渲染——
 *   无占位、无注释、无「resolve 回调触发补全」（第 1 代死循环根因）
 * - 工厂只跑一次（vnode 级缓存 + 旧树同位置同类型复用）——无无限挂载
 *
 * 两阶段异步组件（唯一签名）：
 *   async (initProps, ctx) => Promise<(props) => VNode | null>
 */

export { buildVNode } from './build.ts'
export { renderValue } from './render.ts'
export { patchValue } from './diff.ts'
export { createScheduler, type Scheduler } from './scheduler.ts'
export { createRegistry, type Registry } from './registry.ts'
export { createReactiveState } from './state.ts'
export { mountRoot, createVdomContext } from './mount.ts'
export { hydrateVNode } from './hydration.ts'
export { renderSsr, ssrPage, ssrToString, serializeData, createSsrContext } from './ssr.ts'
export { toast, confirm, mountCommand, unmountCommand, createCommandContainer } from './middlewares/index.ts'
export type { ToastInjected, ToastOptions, ConfirmInjected, ConfirmOptions } from './middlewares/index.ts'
export { uiServe, type UIServeOptions, type UIServeHandle } from './serve.ts'
