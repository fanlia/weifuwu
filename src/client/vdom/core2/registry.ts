/**
 * vdom core2 — 全局函数注册表（函数面歧义歼灭的核心）
 *
 * 问题：props 的函数值（onClick 等）不可序列化——剔除即信息丢失——
 * 逆向无法恢复引用（歧义）。
 *
 * 方案：**全局注册表——函数 → id（双向映射）**——序列化面只写引用 id
 * （data-wf-events='{"onClick":"e1"}'——可序列化——NDJSON 纪律）——
 * 逆向 lookup(id) → 恢复**同一引用**（=== 恒等——会话内 A3 单射）。
 *
 * 语义：
 * - register(fn)：**引用比较**（===）——同一函数同 id（幂等——多次渲染
 *   不重复分配）——未注册 → 分配 e{n}
 * - lookup(id)：查引用——查不到 = 跨会话（序列化面函数不可逆——内在
 *   边界——消费点显式降级）
 * - reset()：会话级清理（serve mount/unmount——测试隔离）——防泄漏
 *   由会话生命周期负责（本步简化：全局单例 + reset）
 *
 * 与核心公理：
 * - A1 编码唯一：同引用同 id（Map 记忆）——异引用异 id（=== 判定）
 * - A3 单射（会话内）：异函数 → 可区分（不同 id）——同函数 → 同 id
 * - 命令流保持 NDJSON 可序列化（id 是字符串——函数体不进流）
 */
const fnToId = new Map<Function, string>()
const idToFn = new Map<string, Function>()
let counter = 0

/** 函数 → id（引用比较——幂等——已注册返回原 id） */
export function registerFn(fn: Function): string {
  const existing = fnToId.get(fn)
  if (existing) return existing
  counter += 1
  const id = `e${counter}`
  fnToId.set(fn, id)
  idToFn.set(id, fn)
  return id
}

/** id → 函数引用（查不到 = 跨会话——返回 undefined——消费点显式降级） */
export function lookupFn(id: string): Function | undefined {
  return idToFn.get(id)
}

/** 会话级清理（测试隔离/卸载） */
export function resetRegistry(): void {
  fnToId.clear()
  idToFn.clear()
  counter = 0
}
