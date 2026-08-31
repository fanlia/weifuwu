/**
 * shared 导出面锁定（SHARED-TRIE-EXCELLENCE D2——2027-10）
 *
 * **前后端唯一共享模块的公共 API**——导出清单契约：新增导出必须显式
 * 登记进清单（防意外扩散——API 面只可收紧不可扩大——收窄需同步更新
 * 清单 + 双端消费面核查）。
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('shared/router 导出面（公共 API 清单）', () => {
  test('trie.ts——六 API（TrieNode/createTrie/splitPath/trieFind/trieRegister/trieMatch）', async () => {
    const m = await import('./trie.ts')
    // TrieNode 为 interface（类型擦除——运行时键不含）
    assert.deepEqual(Object.keys(m).sort(), [
      'createTrie', 'splitPath', 'trieFind', 'trieMatch', 'trieRegister',
    ], 'trie.ts 运行时导出清单（TrieNode 类型擦除）')
  })

  test('pipeline.ts——二 API（RouteMatch/RouterPipeline 类型 + dispatchRouter）', async () => {
    const m = await import('./pipeline.ts')
    // RouteMatch/RouterPipeline 为 interface（类型擦除）
    assert.deepEqual(Object.keys(m), ['dispatchRouter'], 'pipeline.ts 运行时导出')
    assert.equal(typeof m.dispatchRouter, 'function')
  })

  test('context.ts——三 API（RequestTarget 类型 + parseRequestTarget/freshParams/parseQuery）', async () => {
    const m = await import('./context.ts')
    assert.equal(typeof (m as any).parseRequestTarget, 'function')
    assert.equal(typeof (m as any).freshParams, 'function')
    assert.equal(typeof (m as any).parseQuery, 'function')
  })

  test('chain.ts——一 API（runChain）', async () => {
    const m = await import('./chain.ts')
    assert.deepEqual(Object.keys(m).sort(), ['runChain'])
  })

  test('ctx-fields.ts——二 API（CtxFieldRegistry 类型 + createCtxFieldRegistry）', async () => {
    const m = await import('./ctx-fields.ts')
    assert.equal(typeof (m as any).createCtxFieldRegistry, 'function')
  })

  test('types.ts——四类型（SharedHandler/SharedMiddleware/MiddlewareMeta/MetaMiddleware）', async () => {
    const m = await import('./types.ts')
    // 纯类型模块——运行时无导出（类型擦除）
    assert.deepEqual(Object.keys(m), [], 'types.ts 纯类型——零运行时导出')
  })
})
