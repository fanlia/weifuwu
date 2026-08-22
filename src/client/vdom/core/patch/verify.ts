/**
 * vdom core/patch — dev 验证器（状态机 Post 断言——dev only）
 *
 * 机制（P3b）：CommandApplier 可选注入 devVerify——每个命令消费后断言
 * Post（状态机规格——design/vdom-state-machine-plan.md §3）——console.error
 * 报告（不中断渲染管线——dev 可见性）。
 *
 * 与验证体系的关系（双层）：
 * - Sim（契约层 reconcile.test.ts）——生成层语义验证（throw——测试红）
 * - devVerify（本文件——真实浏览器环境）——消费端 Post 断言（report——
 *   Sim 与浏览器语义差异的兜底——isConnected 类问题的真实 DOM 落验）
 * - auditDom（场景层 e2e-reconcile）——终态结构不变量
 *
 * 生产零开销：仅 window.__WF_DEV__ 开启时注入。
 */
import type { Command } from '../command/index.ts'
import type { CommandApplier } from './index.ts'

/** dev 验证器（命令消费后 Post 断言——违例 console.error 报告） */
export function createDevVerifier(): (cmd: Command, applier: CommandApplier) => void {
  return (cmd, applier) => {
    switch (cmd.op) {
      case 'insert': {
        // Post：id 必须已 create（命令流生成 bug）且已挂载
        const n = applier.nodes.get(cmd.id)
        if (!n) console.error(`[vdom-dev] insert Post 违例：id ${cmd.id} 未 create（生成层 bug）`)
        else if (!n.isConnected) console.error(`[vdom-dev] insert Post 违例：${cmd.id} 未挂载（isConnected=false）`)
        break
      }
      case 'remove': {
        // Post：前缀记录必须清除（区间残留——removeVNodeTree 完整性）
        for (const id of applier.nodes.keys()) {
          if (id.startsWith(cmd.id + '.')) console.error(`[vdom-dev] remove Post 违例：前缀记录残留 ${id}`)
        }
        break
      }
      case 'setText': {
        // Pre：id 必须存在且为文本节点
        const n = applier.nodes.get(cmd.id)
        if (!n || n.nodeType !== 3) console.error(`[vdom-dev] setText Pre 违例：${cmd.id} 非文本/不存在（${n?.nodeType ?? 'none'}）`)
        break
      }
      case 'setProp': {
        // Pre：id 必须存在且为元素
        const n = applier.nodes.get(cmd.id)
        if (!n || n.nodeType !== 1) console.error(`[vdom-dev] setProp Pre 违例：${cmd.id} 非元素/不存在`)
        break
      }
      case 'move': {
        // Post：remap 后新 id 必须存在（子树重映射完整性）
        if (!applier.nodes.has(cmd.newId)) console.error(`[vdom-dev] move Post 违例：remap 后新 id ${cmd.newId} 不存在`)
        break
      }
      default: break
    }
  }
}
