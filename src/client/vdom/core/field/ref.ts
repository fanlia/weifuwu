/**
 * vdom core — ref 通道（DOM 引用——挂载/卸载回调——独立文件）
 *
 * 纪律（AGENTS §5.1）：带清理逻辑的 ref 必须定义在 mount 作用域——
 * ref 函数引用变化时旧 ref(null) 被调用（diff 重绑定——若内联写 render
 * 每次渲染新函数 → 清理逻辑反复触发——正确性要求）：
 * - 挂载：ref(el)
 * - 卸载：ref(null)
 * - 引用变化（prev）：旧 ref(null) → 新 ref(el)
 */

export const REF_KEY = 'ref'

/** ref 应用（el 挂载 / null 卸载——prev 引用变化先退旧） */
export function applyRef(el: HTMLElement | null, value: unknown, prev?: unknown): void {
  const prevFn = typeof prev === 'function' ? prev : null
  const nextFn = typeof value === 'function' ? value : null
  if (prevFn && prevFn !== nextFn) prevFn(null)
  if (nextFn && nextFn !== prevFn) nextFn(el)
}
