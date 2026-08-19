/**
 * vdom core — build 阶段（vnode → 全量命令事件流）
 *
 * 四阶段管线（route → build → diff → patch）：build 是「新树渲染」——
 * vnode → 命令事件流（create/insert/close...——done.full 全量标记——
 * patch 据此清理旧树多余节点）。
 *
 * **共享渲染分发器**（createRenderDispatcher——build/diff 共用——单一
 * 规则源）：kindOf 分类 → 各 node/ 文件渲染（text/hole/array/fragment/
 * portal/element/component/invalid）——diff 的新侧渲染复用本分发器——
 * **消除重复**（diff 只做对照决策——新侧渲染走这里）。
 */

import type { VNode, VNodeChild } from './vnode.ts'
import { childrenOf } from './node/children.ts'
import { kindOf, textOf } from './node/index.ts'
import { emitHole, invalidDiagnostic } from './node/hole.ts'
import { isPortal, PORTAL_ID_PREFIX } from './node/portal.ts'
import { pathId, renderNative } from './node/native.ts'
import { renderComponent, createComponentRegistry, type ComponentRegistry } from './node/component.ts'
import type { UIContext } from '../context/UIContext.ts'
import type { Command } from './command/index.ts'

/** 渲染 sink（子节点递归出口——build/diff 共用） */
export type RenderSink = (
  v: VNodeChild, parent: string, index: number, ref: string | null,
) => Promise<void>

/**
 * 创建渲染分发器（**共享——build 首帧/diff 新侧渲染同一实现**）：
 * emit(v, parent, index, ref)——kindOf 分类 → 各 node/ 文件渲染
 */
export function createRenderDispatcher(
  emitCommand: (cmd: Command) => void,
  ctx: UIContext,
  registry: ComponentRegistry,
): RenderSink {
  const emit = async (v: VNodeChild, parent: string, index: number, ref: string | null): Promise<void> => {
    const id = pathId(parent, index)
    switch (kindOf(v)) {
      // 文本 → createText + insert
      case 'text': {
        const text = textOf(v)!
        emitCommand({ op: 'createText', id, value: text })
        emitCommand({ op: 'insert', id, parent, ref })
        return
      }
      // 空洞 → 占位锚（hole.ts——同构——长度恒定）
      case 'hole': {
        emitHole(emitCommand, id, parent, ref)
        return
      }
      // 数组（防御——childrenOf 已展开——任意嵌套=隐式 Fragment）
      case 'array': {
        for (const [i, c] of (v as VNodeChild[]).entries()) await emit(c, parent, index + i, ref)
        return
      }
      // Fragment 符号 vnode（`<></>`——与数组同义——展开）
      case 'fragment': {
        const cs = childrenOf(v as VNode)
        let lastRef: string | null = ref
        for (const [i, c] of cs.entries()) {
          await emit(c, parent, index + i, lastRef)
          lastRef = pathId(parent, index + i)
        }
        return
      }
      // Portal（浮层——usePopup 内部机制）：主树插槽占位锚 + 内容
      // create/insert 到 portal 容器（parent = 'portal:<key>'——apply 侧
      // 解析容器 id——命名空间隔离——与主树 id 永不冲突）
      case 'portal': {
        const key = (v as VNode).key ?? 'default'
        const base = `${PORTAL_ID_PREFIX}${key}`
        emitCommand({ op: 'createAnchor', id })
        emitCommand({ op: 'insert', id, parent, ref })
        const cs = childrenOf(v as VNode)
        let lastRef: string | null = null
        for (const [i, c] of cs.entries()) {
          await emit(c, base, i, lastRef)
          lastRef = pathId(base, i)
        }
        return
      }
      // 元素 → native.ts（create + children 递归 + close）
      case 'element': {
        await renderNative(v as VNode, id, parent, ref, emitCommand, emit)
        return
      }
      // 组件 → component.ts（两阶段工厂 + renderFn——可 await——
      // compId = 锚点 id（组件 vnode 有 key → `{parent}.k{key}`——**位置无关**
      // ——keyed 增删/重排状态跟随 key——build/diff 同格式）
      case 'component': {
        const vn = v as VNode
        const compId = vn.key !== null ? `${parent}.k${vn.key}` : id
        // **mount 指令（组件生命周期——初始化完成——返回值判定——
        //  类型切换重 mount 后正确标记）**
        const isNew = await renderComponent(vn, parent, index, ref, compId, ctx, registry, emit)
        if (isNew) emitCommand({ op: 'mount', compId })
        return
      }
      // 非法输入——诊断占位 + warn（hole.ts——不崩溃不静默）
      case 'invalid': {
        console.warn(`[vdom] 非法子节点——${invalidDiagnostic(v)}`)
        emitHole(emitCommand, id, parent, ref, invalidDiagnostic(v))
        return
      }
    }
  }
  return emit
}

/**
 * vnode → 全量命令事件流（首帧/导航——done.full——patch 清理旧树多余）
 * ctx：组件共享上下文（serve 创建）；registry：组件实例注册表
 */
export function renderToStream(
  root: VNode,
  ctx?: UIContext,
  registry?: ComponentRegistry,
): ReadableStream<Command> {
  const sharedCtx = (ctx ?? {}) as UIContext
  const reg = registry ?? createComponentRegistry()
  return new ReadableStream<Command>({
    async start(controller) {
      const emit = createRenderDispatcher((cmd) => controller.enqueue(cmd), sharedCtx, reg)
      await emit(root, 'root', 0, null)
      controller.enqueue({ op: 'done', full: true })
      controller.close()
    },
  })
}
