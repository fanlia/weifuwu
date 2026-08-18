/**
 * vdom core — key 字段（业务身份声明协议——独立文件）
 *
 * 规则（AGENTS §4.0/§5.7——key 业务身份声明）：
 * - 框架**不生成身份 key**——数组项 key 只由业务声明（数据 id → keyBy /
 *   组件内部生成 / 用户显式 key）；无 key = 位置身份（unkeyed 按位置 patch）
 * - h()/jsx 剥离 key 进 vnode.key（**props 不泄漏 key**——组件不见 key）
 * - key 必须是 string|number（其余类型 warn + 忽略——不静默）
 * - keyed 列表 diff（身份跟随内容——增删/重排复用正确）与 A 级检测
 *   （数组长度变化 + 无 key 组件项 → dev error）在 diff 层消费
 */

export const KEY = 'key'

/** key 提取（props → vnode.key——string|number 有效——其余 warn + null） */
export function extractKey(props: Record<string, unknown> | null | undefined): string | null {
  const k = props?.key
  if (k === null || k === undefined) return null
  if (typeof k === 'string') return k
  if (typeof k === 'number') return String(k)
  console.warn(`[vdom] key 必须是 string|number——当前 ${typeof k}（忽略——位置身份）`)
  return null
}

/** 从 props 拷贝中剥离 key（h/jsx 用——props 不泄漏 key） */
export function stripKey(props: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const p = { ...(props ?? {}) }
  delete p.key
  return p
}
