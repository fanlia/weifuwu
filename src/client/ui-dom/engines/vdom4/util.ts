/**
 * vdom4 util — 工具（deepFreeze——props 不可变契约机制化）
 */

/** props 深度冻结（dev——原地改 → strict mode TypeError——剪枝引用比较获得内容不变性）
 *  豁免：含函数属性的对象（能力/混合——handle/state 等共享可变状态）与类实例 */
export function deepFreeze<T>(obj: T): T {
  if (obj == null || typeof obj !== 'object') return obj
  if (!Array.isArray(obj) && Object.getPrototypeOf(obj) !== Object.prototype && Object.getPrototypeOf(obj) !== null) return obj
  if (Object.values(obj as Record<string, unknown>).some((v) => typeof v === 'function')) return obj
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    deepFreeze((obj as Record<string, unknown>)[k])
  }
  return Object.freeze(obj)
}
