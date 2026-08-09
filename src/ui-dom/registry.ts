/**
 * weifuwu/ui-dom 组件注册表 — 完全独立（不依赖 src/client）
 *
 * 组件实例管理：id 分配 + vnode 注册 + dirty 集合。
 * D1（组件级重渲染）：组件 $ 赋值 → dirty(id) → 重调组件 render → 局部 patch。
 */

import type { VNode } from './types.ts'

/** 组件注册表（独立实例——每个 UIRouter 一个） */
export class Registry {
  private _idCounter = 0
  private _map = new Map<string, VNode>()
  /** dirty 集合：组件 $ 赋值 → 加入 → 批量重渲染 */
  private _dirty = new Set<string>()
  /** 渲染保护期（重渲染循环中忽略新 dirty，循环结束统一处理） */
  private _rendering = false
  /** mount 保护期（组件工厂执行——$ 初始化赋值丢弃，对齐 client setMounting） */
  private _mounting = false
  /** dirty 触发回调（router 注入——组件 $ 赋值时调度重渲染循环） */
  private _onDirty: (() => void) | null = null

  /** 设置 dirty 回调（router 调度重渲染） */
  onDirty(fn: () => void): void {
    this._onDirty = fn
  }

  /** mount 期标志（renderComponent mount 包裹） */
  setMounting(v: boolean): void {
    this._mounting = v
  }

  get isMounting(): boolean {
    return this._mounting
  }

  get isRendering(): boolean {
    return this._rendering
  }

  setRendering(v: boolean): void {
    this._rendering = v
  }

  /** 分配组件 id */
  nextId(): string {
    return `_wf_${this._idCounter++}`
  }

  /** 注册组件 vnode */
  set(id: string, vnode: VNode): void {
    this._map.set(id, vnode)
  }

  /** 按 id 查组件 vnode */
  get(id: string): VNode | undefined {
    return this._map.get(id)
  }

  /** 注销组件（卸载时） */
  delete(id: string): void {
    this._map.delete(id)
    this._dirty.delete(id)
  }

  /** 标记组件 dirty（$ 赋值触发）——mount/渲染保护期丢弃（对齐 client），事件期排队 */
  markDirty(id: string): void {
    if (this._mounting || this._rendering) return // mount 初始化/渲染循环中赋值丢弃
    if (this._dirty.has(id)) return
    this._dirty.add(id)
    this._onDirty?.() // 调度重渲染循环
  }

  /** 消费 dirty 集合（返回待重渲染的 id 列表并清空） */
  drainDirty(): string[] {
    const ids = [...this._dirty]
    this._dirty.clear()
    return ids
  }
}
