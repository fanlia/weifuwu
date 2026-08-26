/**
 * vdom core — 异步时序健壮性契约（R1/R2——design/vdom-core-robustness-round4.md P1）
 *
 * 覆盖：
 * - R2a：DataPipe fetcher 挂起 → 超时 reject（管道级放弃——不饿死渲染队列）
 *   + 缓存语义（失败缓存 → invalidate 重试）
 * - R2b：async renderFn 挂起 → 组件级 hole 降级（单组件失败不炸整树——
 *   渲染流完整 done——下一拍重试自愈）+ mount 工厂挂起 → 显式 reject
 * - R1a：withTimeout 语义（0 = 不超时——测试/本地禁用路径）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDataPipe } from '../../client/vdom/context/data.ts'
import { withTimeout, DEFAULT_ASYNC_TIMEOUT_MS } from '../../client/vdom/core/async-guard.ts'
import { createComponentRegistry, renderComponent } from '../../client/vdom/core/node/component.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { h } from '../../client/vdom/core/vnode.ts'
import type { UIContext } from '../../client/vdom/context/UIContext.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

const emptyCtx = { render: async () => {}, data: undefined } as unknown as UIContext

async function drain(stream: ReadableStream<Command>): Promise<{ ops: string[]; ids: string[] }> {
  const r = stream.getReader()
  const ops: string[] = []
  const ids: string[] = []
  for (;;) {
    const { value, done } = await r.read()
    if (done) break
    ops.push(value.op)
    ids.push((value as { id?: string }).id ?? '')
  }
  return { ops, ids }
}

// ── R2a：DataPipe 挂起超时 ──

test('R2a：fetcher 挂起 → 超时 reject（管道级放弃——不永久 pending）', async () => {
  const pipe = createDataPipe(30)
  const never = new Promise<never>(() => { /* 永不 resolve */ })
  await assert.rejects(pipe.get('/never', () => never), /超时/, '挂起 fetcher 必须超时 reject')
})

test('R2a：超时失败缓存——同 key 共享 + invalidate 重试成功', async () => {
  const pipe = createDataPipe(30)
  let calls = 0
  const never = new Promise<never>(() => {})
  await assert.rejects(pipe.get('/k', () => { calls++; return never }), /超时/)
  await assert.rejects(pipe.get('/k', () => { calls++; return never }), /超时/)
  assert.equal(calls, 1, '并发合并：同 key 共享同一 promise（重试也只跑一次）')
  pipe.invalidate('/k')
  assert.equal(await pipe.get('/k', async () => 'ok'), 'ok', 'invalidate 后重试成功')
})

test('R2a：正常 resolve 不受超时影响（含种子/已缓存）', async () => {
  const pipe = createDataPipe(30)
  assert.equal(await pipe.get('/a', async () => 'v'), 'v')
  pipe.preload({ '/b': 'seed' })
  assert.equal(await pipe.get('/b'), 'seed', '种子同步命中（不走超时路径）')
})

// ── R2b：async renderFn 挂起 → 组件级 hole 降级 ──

test('R2b：async renderFn 挂起 → 超时 → 组件级 hole 降级（渲染流完整——队列不饿死）', async () => {
  const reg = createComponentRegistry()
  reg.asyncTimeout = 20
  const Hung: any = () => async () => new Promise(() => { /* 永不 resolve */ })
  const { ops, ids } = await drain(renderToStream(h('div', {}, h(Hung, {})), emptyCtx, reg))
  assert.ok(ops.includes('done'), '渲染流必须完整结束（done.full——队列不饿死）')
  // 组件输出 hole 挂 compId.0 子空间（C2）——降级锚 id = root.0.0.0
  const anchorIdx = ops.findIndex((op, i) => op === 'createAnchor' && ids[i] === 'root.0.0.0')
  assert.ok(anchorIdx >= 0, `组件槽位降级为 hole 锚（ops: ${ops.join(',')} / ids: ${ids.join(',')}）`)
})

test('R2b：mount 工厂挂起 → 超时显式 reject（mount 失败 = 整页失败——serve 熔断链）', async () => {
  const reg = createComponentRegistry()
  reg.asyncTimeout = 20
  const HungMount: any = async () => new Promise(() => { /* 永不 resolve */ })
  await assert.rejects(
    (async () => {
      const cmds: Command[] = []
      for await (const c of renderToStream(h('div', {}, h(HungMount, {})), emptyCtx, reg)) cmds.push(c)
    })(),
    /超时/,
    '工厂挂起必须显式 reject（让 serve 熔断链自愈——不静默）',
  )
})

test('R2b：renderFn reject（显式抛错）→ 同样 hole 降级（错误不中断整树）', async () => {
  const reg = createComponentRegistry()
  reg.asyncTimeout = 100
  const Boom: any = () => async () => { throw new Error('renderFn boom') }
  const { ops } = await drain(renderToStream(h('div', {}, [h('span', {}, 'a'), h(Boom, {}), h('span', {}, 'b')]), emptyCtx, reg))
  assert.ok(ops.includes('done'), '渲染流完整结束')
  assert.ok(ops.includes('createAnchor'), '错误组件降级为 hole 锚')
})

// ── R1a：withTimeout 语义 ──

test('R1a：ms ≤ 0 = 不超时（本地/测试禁用路径）', async () => {
  assert.equal(await withTimeout(Promise.resolve('v'), 0, 'x'), 'v')
})

test('R1a：默认超时 15s（生产基线）', () => {
  assert.equal(DEFAULT_ASYNC_TIMEOUT_MS, 15000)
})
