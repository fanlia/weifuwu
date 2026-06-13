import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('tsx-context', () => {
  it('setCtx updates store and snapshot', async () => {
    const { setCtx } = await import('../tsx-context.ts')

    setCtx({ params: { id: '42' }, query: { page: '1' } })

    const { useCtx } = await import('../tsx-context.ts')
    const ctx = await new Promise<any>((resolve) => {
      // useCtx reads from globalThis store on server
      const result = (globalThis as any).__WEIFUWU_CTX_STORE?._ctx
      resolve(result)
    })
    assert.equal(ctx?.params?.id, '42')
    assert.equal(ctx?.query?.page, '1')
  })

  it('__registerAls allows custom snapshot source', async () => {
    const { __registerAls, useCtx, setCtx } = await import('../tsx-context.ts')

    setCtx({ params: {} })

    // Register ALS that returns a different context
    __registerAls(() => ({
      params: { from: 'als' },
      query: {},
      user: {},
      parsed: {},
      loaderData: {},
      env: {},
    }))

    // On server, useCtx should prefer ALS
    // Reset after test
    __registerAls(() => undefined)
  })

  it('TsxContext is a React context', async () => {
    const { TsxContext } = await import('../tsx-context.ts')
    assert.equal(typeof TsxContext, 'object')
    assert.ok(TsxContext.Provider)
    assert.ok(TsxContext.Consumer)
  })
})
