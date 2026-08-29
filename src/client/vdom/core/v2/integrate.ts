/**
 * vdom v2 — 集成（v2 引擎 → 消费端链路）
 *
 * VDOM-V2-BLUEPRINT 阶段 2A：
 * - **命令流同构 → 消费端复用**：renderV2/diffV2 产出 Observable<Command>
 *   ——commandToHtml / CommandApplier 直接消费（命令语义 v1 相同——零改动）
 * - v2ToHtml：v2 渲染 → HTML（SSR 路径——契约层无 DOM 验证）
 * - 阶段 2A 验证点：v2 HTML ≡ v1 HTML（多种子——SSR 等价）
 */
import type { VNode } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { renderV2 } from './render.ts'
import { createComponentRegistry, type ComponentRegistry } from '../node/component.ts'
import { Observable } from '../../observable/index.ts'

/** Observable<Command> → 命令数组（同步流收集——订阅到 complete） */
export function collectCommands(obs: Observable<Command>): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    obs.subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
  })
}

/** **v2 渲染 → ReadableStream<Command>（v1 renderToStream 兼容桥——v1 退役迁移）**
 *  命令式组件（toast/Confirm/Notification——独立 applier 消费——pipeTo/
 *  读取流形态不变）——v2 引擎 + 段表（跨渲染复用） */
export function renderToStreamV2(
  vnode: VNode,
  ctx?: UIContext,
  registry?: ComponentRegistry,
  segments?: Map<string, import('./diff.ts').Segment>,
  requestRender?: () => void,
): ReadableStream<Command> {
  const segs = segments ?? new Map<string, import('./diff.ts').Segment>()
  const obs = renderV2(vnode, ctx, registry, segs, requestRender)
  return new ReadableStream<Command>({
    start(c) {
      obs.subscribe({ next: (x) => c.enqueue(x), error: (e) => c.error(e), complete: () => c.close() })
    },
  })
}

/** v2 渲染 → HTML（SSR 路径——commandToHtml 复用——命令流同构） */
export async function v2ToHtml(
  root: VNode,
  ctx?: UIContext,
  registry?: ComponentRegistry,
): Promise<string> {
  const reg = registry ?? createComponentRegistry()
  const cmds = await collectCommands(renderV2(root, ctx, reg))
  const { commandToHtml } = await import('../ssr/html.ts')
  // TransformStream 消费（命令数组 → 流 → HTML）
  const stream = new ReadableStream<Command>({
    start(c) { for (const cmd of cmds) c.enqueue(cmd); c.close() },
  })
  const reader = stream.pipeThrough(commandToHtml()).getReader()
  let out = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    out += value
  }
  return out
}
