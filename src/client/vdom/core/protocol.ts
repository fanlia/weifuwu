/**
 * vdom core — protocol（命令流协议层——v1/v2 引擎共享）
 *
 * **v1 退役拆分（2027-08）**：原 core/serve.ts 同时承载 uiServe（v1 引擎）
 * 与协议层（函数表编码/命令流解码/熔断 fallback/RenderCtx 类型）——v2 引擎
 * 依赖后者——删除 v1 引擎前把协议层抽为独立文件。
 * 原 uiSsr（core/ssr/index.ts）的 NDJSON 解码同样归并（v1 引擎特有——
 * v2/ssr.ts 有自己的解码——协议面仅保留编码/解码原语）。
 */
import { UIRouter } from './router.ts'
import { CommandApplier } from './patch/index.ts'
import { h } from './vnode.ts'
import type { VNode } from './vnode.ts'
import { createComponentRegistry } from './node/component.ts'
import type { UIContext } from '../context/UIContext.ts'
import type { Command } from './command/index.ts'
import type { Browser } from '../browser/Browser.ts'
import { createDevVerifier } from './patch/verify.ts'
import { installEffectGuard } from '../dev/effect-guard.ts'

/** 函数表还原（$fn 标记 → 函数——编码/解码同进程共享） */
export function reviveFn(fnTable: Map<number, unknown>) {
  return (k: string, v: unknown): unknown => {
    if (v && typeof v === 'object' && typeof (v as { $fn?: unknown }).$fn === 'number') {
      const fn = fnTable.get((v as { $fn: number }).$fn)
      if (!fn) console.error(`[vdom] 传输违例：$fn:${(v as { $fn: number }).$fn} 无对应函数（函数表已清/跨流引用）`)
      return fn
    }
    return v
  }
}

/** R1 熔断默认回退 UI（core 内建——inline style 零样式系统依赖——
 *  errorFallback 未配置时使用——错误文案 + 重试按钮（恢复路径）） */
export function defaultErrorFallback(err: Error, ctx: UIContext): VNode {
  return h('div', {
    class: 'wf-error-fallback',
    style: 'padding:40px 24px;text-align:center;font-family:var(--wf-font-sans,system-ui);',
  }, [
    h('div', { style: 'font-size:21px;font-weight:600;margin-bottom:8px;' }, '页面渲染失败'),
    h('div', { style: 'font-size:13px;color:var(--wf-color-text-secondary,#64748b);margin-bottom:16px;max-width:520px;margin-inline:auto;word-break:break-all;' }, String(err?.message ?? err)),
    h('button', {
      class: 'wf-btn wf-btn--primary',
      onClick: () => { void ctx.render?.() },
      style: 'padding:8px 20px;border-radius:6px;border:none;cursor:pointer;',
    }, '重试'),
  ])
}

/** NDJSON 命令流解析（行缓冲——命令可能跨 chunk——函数表还原——
 * 导出（测试——跨 chunk 边界/畸形行合规断言）） */
export function commandReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  fnTable: Map<number, unknown>,
): AsyncGenerator<Command> {
  const decoder = new TextDecoder()
  let buf = ''
  return (async function* () {
    const revive = reviveFn(fnTable)
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        yield JSON.parse(line, revive) as Command
      }
    }
    if (buf.trim()) yield JSON.parse(buf, revive) as Command
  })()
}

/** 命令流编码（函数面 → {$fn: n}——函数表——同进程共享）
 *  函数 → 序号（WeakMap——同函数流内复用同序号——减少重复条目） */
export function encodeCommands(
  stream: ReadableStream<Command>,
  fnTable: Map<number, unknown>,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const fnToId = new WeakMap<object, number>()
  const mark = (k: string, v: unknown): unknown => {
    if (typeof v === 'function') {
      const known = fnToId.get(v as object)
      if (known !== undefined) return { $fn: known }
      const n = fnTable.size + 1
      fnTable.set(n, v)
      fnToId.set(v as object, n)
      return { $fn: n }
    }
    return v
  }
  return stream.pipeThrough(new TransformStream<Command, Uint8Array>({
    transform(cmd, controller) {
      controller.enqueue(enc.encode(JSON.stringify(cmd, mark) + '\n'))
    },
  }))
}

/** 函数表（serve 级共享——编码/解码同进程） */
export function createFnTable(): Map<number, unknown> {
  return new Map()
}

/** uiServe 选项（v1/v2 共同——公共面契约） */
export interface UiServeOptions {
  /** 根容器（选择器或元素） */
  root: string | HTMLElement
  /** 错误熔断回退（R1——应用可配置） */
  errorFallback?: (err: Error, ctx: UIContext) => VNode
  api?: unknown
  auth?: unknown
  ws?: unknown
  i18n?: unknown
  toast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => void
  confirm?: unknown
  notification?: unknown
  [key: string]: unknown
}

/** uiServe 句柄（v1/v2 共同） */
export interface UiServeHandle {
  ready: Promise<void>
  render(): Promise<void>
  navigate(path: string): Promise<void>
  /** 卸载（清理事件代理/组件实例——DOM 清空） */
  unmount(): void
}

export type ServePhase = 'active' | 'unmounted'
export type RenderPhase = 'idle' | 'rendering'

/** 渲染上下文（stream = 页面作者渲染入口——vnode → command 流） */
export interface RenderCtx extends UIContext {
  stream(vnode: VNode, init?: ResponseInit): Response
}
