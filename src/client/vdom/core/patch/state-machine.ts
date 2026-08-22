/**
 * vdom core/patch — 状态机规格（单一实现源——P3c）
 *
 * 目标：NodeState 迁移 + Post 验证的**唯一规格源**——Sim（契约层对账器）
 * 与 createDevVerifier（生产 dev 检查）共用——消灭双实现漂移（isConnected
 * 类误报的根治——规格只有一份——两边行为恒等）。
 *
 * 规格（design/vdom-state-machine-plan.md §2.1/§3）：
 *   ABSENT → CREATED → INSERTED → ACTIVE（close）→ REMOVED
 *   - create 族：ABSENT → CREATED（同形复用不变）
 *   - insert：CREATED → INSERTED（INSERTED/ACTIVE = 幂等 skip）
 *   - close：INSERTED → ACTIVE（ACTIVE = 幂等 skip——重建路径）
 *   - remove：任意 → REMOVED（记录前缀清除——Post：无残留）
 *   - setText/setProp/move：节点存在性 Post（类型检查由调用方——
 *     Sim 查 SimNode.kind / devVerify 查 nodeType——各层有各自数据面）
 *
 * 迁移返回违例数组（不 throw）——调用方决定：Sim throw（测试红）/
 * devVerify console.error（dev 报告）。
 */
import type { Command } from '../command/index.ts'

export type NodeState = 'created' | 'inserted' | 'active'

/** 状态跟踪器（id → NodeState——调用方数据面无关） */
export interface StateTracker {
  get(id: string): NodeState | undefined
  set(id: string, s: NodeState): void
  /** 前缀清除（remove/done 的子树记录） */
  removePrefix(id: string): void
  /** 前缀残留检查（remove Post） */
  hasPrefix(id: string): boolean
  /** 前缀重映射（move——id 空间跟随——nodes/事件/ref 同规则） */
  remapPrefix(oldPrefix: string, newPrefix: string): void
  /** 全量重置（done——渲染流结束——与 touched.clear() 对齐） */
  clear(): void
}

/** Map 实现（Sim/devVerify 共用） */
export function createStateTracker(): StateTracker {
  const map = new Map<string, NodeState>()
  return {
    get: (id) => map.get(id),
    set: (id, s) => { map.set(id, s) },
    removePrefix: (id) => {
      for (const k of [...map.keys()]) {
        if (k === id || k.startsWith(id + '.')) map.delete(k)
      }
    },
    hasPrefix: (id) => {
      for (const k of map.keys()) {
        if (k === id || k.startsWith(id + '.')) return true
      }
      return false
    },
    remapPrefix: (oldPrefix, newPrefix) => {
      for (const [k, v] of [...map]) {
        if (k === oldPrefix || k.startsWith(oldPrefix + '.')) {
          map.delete(k)
          map.set(newPrefix + k.slice(oldPrefix.length), v)
        }
      }
    },
    clear: () => { map.clear() },
  }
}

/** 状态迁移 + Post 验证（纯逻辑——单一规格源——违例返回数组） */
export function transition(tracker: StateTracker, cmd: Command): string[] {
  const violations: string[] = []
  switch (cmd.op) {
    case 'create':
    case 'createText':
    case 'createAnchor': {
      // 迁移：ABSENT → CREATED（同形复用/替换——状态不变或重建——
      //  记录存在即合法——状态不覆盖（inserted/active 保持——幂等））
      if (tracker.get(cmd.id) === undefined) tracker.set(cmd.id, 'created')
      break
    }
    case 'insert': {
      const s = tracker.get(cmd.id)
      if (s === undefined) violations.push(`insert Pre 违例：id ${cmd.id} 未 create`)
      else if (s === 'created') tracker.set(cmd.id, 'inserted')
      // inserted/active：幂等 skip（重建/move 路径——isConnected 语义）
      break
    }
    case 'close': {
      const s = tracker.get(cmd.id)
      if (s === undefined) violations.push(`close Pre 违例：id ${cmd.id} 不存在`)
      else if (s === 'inserted') tracker.set(cmd.id, 'active')
      // active：幂等 skip（重建路径——create 复用 active 节点后 close 重复）
      else if (s !== 'active') violations.push(`close Pre 违例：${cmd.id} 状态应为 inserted/active（实际 ${s}）`)
      break
    }
    case 'remove': {
      // 迁移：任意 → REMOVED（记录前缀清除）
      tracker.removePrefix(cmd.id)
      // Post：前缀记录无残留
      if (tracker.hasPrefix(cmd.id)) violations.push(`remove Post 违例：${cmd.id} 前缀记录残留`)
      break
    }
    case 'setText': {
      if (tracker.get(cmd.id) === undefined) violations.push(`setText Pre 违例：id ${cmd.id} 不存在`)
      break
    }
    case 'setProp': {
      if (tracker.get(cmd.id) === undefined) violations.push(`setProp Pre 违例：id ${cmd.id} 不存在`)
      break
    }
    case 'move': {
      // 前缀迁移（id 空间跟随——nodes/事件/ref 同规则）
      tracker.remapPrefix(cmd.id, cmd.newId)
      // Post：remap 后新 id 必须存在（子树重映射完整性）
      if (tracker.get(cmd.newId) === undefined) violations.push(`move Post 违例：remap 后新 id ${cmd.newId} 不存在`)
      break
    }
    case 'mount':
    case 'unmount':
    case 'ref':
    case 'unref': break
    case 'done': {
      // **跨流持续（serve 级生命周期）**：tracker 模拟 nodes 表——跨渲染
      // 保持（diff 连续消费 build+diff 流——清空会误报 setProp Pre）——
      // 记录清理由 remove 命令（removePrefix）与 done.full（nodes 层）负责
      break
    }
    case 'close': break
  }
  return violations
}
