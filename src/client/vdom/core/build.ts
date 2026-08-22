/**
 * vdom core — build 阶段（vnode → 全量命令事件流）
 *
 * 四阶段管线（route → build → diff → patch）：build 是「新树渲染」——
 * vnode → 命令事件流（create/insert/close...——done.full 全量标记——
 * patch 据此清理旧树多余节点）。
 *
 * **共享渲染分发器**（createRenderDispatcher——build/diff 共用——单一
 * 规则源）：kindOf 分类 → 各 node/ 文件渲染（text/hole/array/fragment/
 * element/component/invalid）——diff 的新侧渲染复用本分发器——
 * **消除重复**（diff 只做对照决策——新侧渲染走这里）。
 */

import type { VNode, VNodeChild } from './vnode.ts'
import { childrenOf, slotCount } from './node/children.ts'
import { kindOf, textOf } from './node/index.ts'
import { emitHole, invalidDiagnostic } from './node/hole.ts'
import { pathId, renderNative } from './node/native.ts'
import { renderComponent, createComponentRegistry, type ComponentRegistry } from './node/component.ts'
import { detectDuplicateKey, keyedId } from './node/keyed.ts'
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
/** 生成端 emit 状态机（**维度 6——2026-XX**）：
 *  本流内 id 类型表（id → 节点形态）——验证：
 *  ① create 类型冲突：同 id 先 el 后 text（或反）→ 违例（投影错位）
 *  ② insert parent 容器性：parent 是已生成的锚/文本 → 违例（id 空间
 *     错位——组件 fuzz an:root.0(div) 类在生成时暴露——而非消费/终态）
 *  宽容项：parent 不在类型表（组件 compId——sink 特判子空间）→ 合法
 *    （段回退由消费端处理）；create 同 id 同类型重复（幂等复用）→ 合法
 *  报告：console.error（不中断生成——生成端产物仍由对账器裁决） */
export function createRenderDispatcher(
  emitCommand: (cmd: Command) => void,
  ctx: UIContext,
  registry: ComponentRegistry,
): RenderSink {
  /** 本流 id 类型表（生成端状态机——维度 6） */
  const idTypes = new Map<string, 'el' | 'text' | 'anchor'>()
  const genEmit = (cmd: Command): void => {
    switch (cmd.op) {
      case 'create': {
        const prev = idTypes.get(cmd.id)
        if (prev && prev !== 'el') console.error(`[vdom] 生成端违例：create ${cmd.id} 类型冲突（${prev} → el）`)
        idTypes.set(cmd.id, 'el')
        break
      }
      case 'createText': {
        const prev = idTypes.get(cmd.id)
        if (prev && prev !== 'text') console.error(`[vdom] 生成端违例：createText ${cmd.id} 类型冲突（${prev} → text）`)
        idTypes.set(cmd.id, 'text')
        break
      }
      case 'createAnchor': {
        const prev = idTypes.get(cmd.id)
        if (prev && prev !== 'anchor') console.error(`[vdom] 生成端违例：createAnchor ${cmd.id} 类型冲突（${prev} → anchor）`)
        idTypes.set(cmd.id, 'anchor')
        break
      }
      case 'insert': {
        // parent 容器性：类型表内的锚/文本 → 违例（id 空间错位——
        // 真实 DOM insertBefore 到注释/文本抛 DOMException）
        const pt = idTypes.get(cmd.parent)
        if (pt && pt !== 'el') {
          console.error(`[vdom] 生成端违例：insert ${cmd.id} 的 parent ${cmd.parent} 是${pt}（非容器——id 空间错位）`)
        }
        break
      }
      default: break
    }
    emitCommand(cmd)
  }
  const emit = async (v: VNodeChild, parent: string, index: number, ref: string | null): Promise<void> => {
    const id = pathId(parent, index)
    switch (kindOf(v)) {
      // 文本 → createText + insert
      case 'text': {
        const text = textOf(v)!
        genEmit({ op: 'createText', id, value: text })
        genEmit({ op: 'insert', id, parent, ref })
        return
      }
      // 空洞 → 占位锚（hole.ts——同构——长度恒定）
      case 'hole': {
        emitHole(genEmit, id, parent, ref)
        return
      }
      // 数组（防御——childrenOf 已展开——任意嵌套=隐式 Fragment）——
      // **槽位推进 + 最后槽位 ref（投影维度——嵌套 FRAG 展开占多槽——
      //  按项数 +1 覆盖后续项（fuzz seed=42 实证）；ref 用展开首槽位会让
      //  后续项插入到已存在节点前（顺序错乱——参考树 0,2,3,1））**
      case 'array': {
        const items = v as VNodeChild[]
        // **A 级检测（重复 key——build 路径——G9 补全）**：同 key 组件
        //  → compId 相同 → 后者静默复用前者实例（工厂不执行/不 mount——
        //  初始化丢失）——非法输入显式化（不静默）
        detectDuplicateKey(items, `数组展开（${parent}）`)
        let slot = index
        let lastRef2: string | null = ref
        for (const c of items) {
          await emit(c, parent, slot, lastRef2)
          const sc = slotCount(c)
          lastRef2 = pathId(parent, slot + sc - 1) // 展开最后槽位
          slot += sc
        }
        return
      }
      // Fragment 符号 vnode（`<></>`——与数组同义——展开）——槽位推进
      case 'fragment': {
        const cs = childrenOf(v as VNode)
        // **A 级检测（重复 key——build 路径——G9 补全）**：同源数组 case
        detectDuplicateKey(cs, `Fragment 展开（${parent}）`)
        let slot = index
        let lastRef2: string | null = ref
        for (const c of cs) {
          await emit(c, parent, slot, lastRef2)
          const sc = slotCount(c)
          lastRef2 = pathId(parent, slot + sc - 1) // 展开最后槽位
          slot += sc
        }
        return
      }
      // 元素 → native.ts（create + children 递归 + close）——**emitCommand
      //  换 genEmit（生成端状态机拦截 create/insert）**
      case 'element': {
        await renderNative(v as VNode, id, parent, ref, genEmit, emit)
        return
      }
      // 组件 → component.ts（两阶段工厂 + renderFn——可 await——
      // compId = 锚点 id（组件 vnode 有 key → keyedId（**key 转义**——
      // **位置无关**——keyed 增删/重排状态跟随 key——build/diff 同格式）
      case 'component': {
        const vn = v as VNode
        const compId = vn.key !== null ? keyedId(parent, vn.key) : id
        // **mount 指令（组件生命周期——初始化完成——返回值判定——
        //  类型切换重 mount 后正确标记）**
        const isNew = await renderComponent(vn, parent, index, ref, compId, ctx, registry, emit, emitCommand)
        if (isNew) emitCommand({ op: 'mount', compId })
        return
      }
      // 非法输入——诊断占位 + warn（hole.ts——不崩溃不静默）
      case 'invalid': {
        console.warn(`[vdom] 非法子节点——${invalidDiagnostic(v)}`)
        emitHole(genEmit, id, parent, ref, invalidDiagnostic(v))
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
