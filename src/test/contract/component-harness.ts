/**
 * vdom 契约测试脚手架——组件命令流级断言（零浏览器——node 直跑）
 *
 * 设计（2026-08——验证哲学下沉组件层）：
 * - 引擎层验证 = 命令流完整自足（生成端唯一产物）——组件契约同源：
 *   组件输出 → 命令流（纯数据）——node 断言（id/顺序/语义）——~ms 级
 * - 与 showcase 测试互补：契约测「产生什么命令」（快、深——行为契约）、
 *   场景测「DOM 行为」（真浏览器）、showcase 测「demo 交互」
 * - mock ctx：render 捕获、browser 惰性（node 下 null-safe）、afterRender
 *   收集、ui 面经 renderComponent 自动注入（createUi——hold/useExternal
 *   等真实实现——组件契约真实验证 hooks 面）
 *
 * 用法：
 *   const h = await mount(Comp, props)
 *   h.cmds                      // 首帧命令流（create/insert/close/done）
 *   await h.render({ ...next }) // 重渲染 diff 命令流（组件复用路径）
 *   h.mounts()                  // 组件工厂执行次数（复用 = 不重跑）
 *   assertCmds/assertOp 断言 helper
 */
import { h } from '../../client/vdom/core/vnode.ts'
import type { VNode } from '../../client/vdom/core/vnode.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
// **v1 退役（2027-08）**：harness 迁移 v2 引擎（renderV2/diffV2 + 段表——
// 命令流同构（v2 等价已验证）——断言面零改动）
import { renderV2 } from '../../client/vdom/core/v2/render.ts'
import { diffV2, disposeSegment } from '../../client/vdom/core/v2/diff.ts'
import { collectCommands } from '../../client/vdom/core/v2/integrate.ts'
import { createComponentRegistry, disposeComponent, type ComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Component, RenderFn } from '../../client/vdom/core/vnode.ts'
import type { UIContext } from '../../client/vdom/context/UIContext.ts'
import assert from 'node:assert/strict'

/** mock 组件 ctx（浏览器惰性——node 零全局——afterRender 收集） */
export function createMockCtx(registry: ComponentRegistry): {
  ctx: UIContext
  afterRenders: Array<() => void>
  renders: Array<() => void>
} {
  const afterRenders: Array<() => void> = []
  const renders: Array<() => void> = []
  const ctx = {
    render: async () => { renders.push(() => {}) },
    browser: null,
    afterRender: (fn: () => void) => { afterRenders.push(fn) },
  } as unknown as UIContext
  return { ctx, afterRenders, renders }
}

/** 命令流操作序列（op 列表——形状匹配） */
export function ops(cmds: Command[]): string[] {
  return cmds.map((c) => c.op)
}

/** create 命令表（id → { tag, attrs }——create 类断言） */
export function createTable(cmds: Command[]): Map<string, { tag: string; attrs: Record<string, unknown> }> {
  const m = new Map<string, { tag: string; attrs: Record<string, unknown> }>()
  for (const c of cmds) {
    if (c.op === 'create') m.set(c.id, { tag: c.tag, attrs: c.attrs })
  }
  return m
}

/** 断言：首帧（renderToStream）命令流 + 重渲染（diffStream）命令流 */
export interface ComponentHarness {
  /** 首帧命令流（done 前全部——含 create/insert/close/mount） */
  cmds: Command[]
  /** 组件工厂执行次数（复用 = 挂载一次） */
  mounts(): number
  /** 重渲染（组件复用——renderFn 重跑——diff 增量命令） */
  render(nextProps: Record<string, unknown>): Promise<Command[]>
  /** 重新挂载（工厂重跑——新实例——测试隔离） */
  remount(props: Record<string, unknown>): Promise<ComponentHarness>
  /** mock ctx 容器（afterRenders 收集等） */
  mock: ReturnType<typeof createMockCtx>
  /** 组件记录（compId 查询——onUnmounts 收集） */
  registry: ComponentRegistry
  /** 卸载组件（onUnmounts 执行——资源清理断言） */
  unmount(): void
}

/** 挂载组件（零浏览器——命令流收集——v2 引擎 + 段表） */
export async function mount(Comp: Component, props: Record<string, unknown> = {}): Promise<ComponentHarness> {
  const registry = createComponentRegistry()
  const mock = createMockCtx(registry)
  const segments = new Map<string, import('../../client/vdom/core/v2/diff.ts').Segment>()
  let vnode = h(Comp as never, props as never)
  const cmds = await collectCommands(renderV2(vnode, mock.ctx, registry, segments, () => {}))
  return {
    cmds,
    mock,
    registry,
    // 工厂执行次数 = 段表大小（同位置同类型复用不重跑）
    mounts: () => segments.size,
    render: async (nextProps: Record<string, unknown>) => {
      const next = h(Comp as never, nextProps as never)
      const d = await collectCommands(diffV2(vnode as never, next as never, mock.ctx, segments, registry, () => {}))
      vnode = next
      return d
    },
    remount: async (p: Record<string, unknown>) => mount(Comp, p),
    unmount: () => {
      for (const id of registry.keys().reverse()) disposeComponent(id, registry)
      for (const [sid] of [...segments]) disposeSegment(sid, segments) // v2 段表（实例权威）
    },
  }
}

/** 断言：命令流包含指定 op 序列（按序出现——允许插入非 create 族命令） */
export function assertCmdsContains(cmds: Command[], pattern: Array<string | { op: string; id?: string }>): void {
  let cursor = 0
  for (const p of pattern) {
    const found = cmds.findIndex((c, i) => {
      if (i < cursor) return false
      return typeof p === 'string' ? c.op === p : c.op === p.op && (p.id === undefined || c.id === p.id)
    })
    assert.ok(found >= cursor, `命令流缺少 ${JSON.stringify(p)}（实际: ${ops(cmds).join(',')}）`)
    cursor = found + 1
  }
}

/** 断言：create 表包含 id → tag（含 attrs 子断言） */
export function assertCreate(ct: ReturnType<typeof createTable>, id: string, tag: string, attrs?: Record<string, unknown>): void {
  const c = ct.get(id)
  assert.ok(c, `create ${id} 存在（实际: ${[...ct.keys()].join(',')}）`)
  assert.equal(c.tag, tag, `create ${id} tag`)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      assert.equal(c.attrs[k], v, `create ${id} attr ${k}`)
    }
  }
}
