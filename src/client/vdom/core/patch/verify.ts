/**
 * vdom core/patch — dev 验证器（状态机 Post 断言——dev only）
 *
 * 机制（P3b/P3c）：CommandApplier 可选注入 devVerify——每个命令消费后
 * 断言 Post——**状态机规格单一实现源**：patch/state-machine.ts（transition
 * ——与 Sim（契约层对账器）共用——消灭双实现漂移）——数据面类型检查
 * （nodeType）与挂载性（isConnected）在此补充（规格的类型维度由各数据面
 * 承担——Sim 查 SimNode.kind / devVerify 查 nodeType）。
 *
 * 报告方式：console.error（不中断渲染管线——dev 可见性）——
 * 违例 = 生成层 bug 或 Sim 与浏览器语义差异（isConnected 类问题落验）。
 *
 * 生产零开销：仅 window.__WF_DEV__ 开启时注入（serve.ts）。
 */
import type { Command } from '../command/index.ts'
import type { CommandApplier } from './index.ts'
import { createStateTracker, transition } from './state-machine.ts'

/** dev 验证器（共享规格——每命令消费后状态迁移 + Post 断言） */
function trackerIds(): string[] { return [] }
export function createDevVerifier(): (cmd: Command, applier: CommandApplier) => void {
  const tracker = createStateTracker()
  return (cmd, applier) => {
    // 共享规格（P3c——与 Sim 同一份 transition）
    const violations = transition(tracker, cmd)
    for (const v of violations) console.error(`[vdom-dev] ${v}`)
    // 数据面补充检查（类型/挂载性）
    switch (cmd.op) {
      case 'insert': {
        const n = applier.nodes.get(cmd.id)
        if (n && !n.isConnected) console.error(`[vdom-dev] insert Post 违例：${cmd.id} 未挂载（isConnected=false）`)
        break
      }
      case 'setText': {
        const n = applier.nodes.get(cmd.id)
        if (n && n.nodeType !== 3) console.error(`[vdom-dev] setText Pre 违例：${cmd.id} 非文本节点（${n.nodeType}）`)
        break
      }
      case 'setProp': {
        const n = applier.nodes.get(cmd.id)
        if (n && n.nodeType !== 1) console.error(`[vdom-dev] setProp Pre 违例：${cmd.id} 非元素节点（${n.nodeType}）`)
        break
      }
      default: break
    }
  }
}
