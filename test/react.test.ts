import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('react (barrel re-exports)', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../react.ts'), 'utf-8')

  it('re-exports client-router symbols', () => {
    assert.ok(
      source.includes(
        "export { Link, useNavigate, navigate, useNavigating, addInterceptor } from './client-router.ts'",
      ),
    )
    assert.ok(source.includes('./client-router.ts'))
  })

  it('re-exports tsx-context symbols', () => {
    assert.ok(
      source.includes(
        "export { TsxContext, useCtx, setCtx, addCtxRebuilder, useLoaderData } from './tsx-context.ts'",
      ),
    )
  })

  it('re-exports Head component', () => {
    assert.ok(source.includes("export { Head } from './head.tsx'"))
  })

  it('re-exports client-state symbols', () => {
    assert.ok(source.includes('createStore'))
    assert.ok(source.includes('useFetch'))
    assert.ok(source.includes('useQueryState'))
  })

  it('re-exports all hooks', () => {
    assert.ok(source.includes('useWebsocket'))
    assert.ok(source.includes('useAction'))
    assert.ok(source.includes('useLocale'))
    assert.ok(source.includes('useTheme'))
    assert.ok(source.includes('applyTheme'))
    assert.ok(source.includes('useFlashMessage'))
    assert.ok(source.includes('useAgentStream'))
  })

  it('re-exports types from use-websocket', () => {
    assert.ok(source.includes('UseWebsocketOptions'))
    assert.ok(source.includes('UseWebsocketReturn'))
  })

  it('re-exports types from use-action', () => {
    assert.ok(source.includes('UseActionOptions'))
    assert.ok(source.includes('UseActionReturn'))
  })

  it('re-exports StoreApi type', () => {
    assert.ok(source.includes('StoreApi'))
  })

  it('re-exports AgentStream types', () => {
    assert.ok(source.includes('UseAgentStreamOptions'))
    assert.ok(source.includes('UseAgentStreamReturn'))
    assert.ok(source.includes('AgentStreamState'))
  })
})
