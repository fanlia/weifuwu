import { describe, it } from 'node:test'
import assert from 'node:assert'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { i18n } from '../../ui-dom/i18n.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true }, app: {} } as any
}

describe('i18n middleware', () => {
  it('injects ctx.i18n with defaults', () => {
    const ctx = mockCtx()
    i18n({ locale: 'zh-CN' })(ctx)
    assert.ok((ctx as any).i18n)
    assert.equal((ctx as any).i18n.locale, 'zh-CN')
  })

  it('provides t() function', () => {
    const ctx = mockCtx()
    i18n({ locale: 'zh-CN', messages: { 'hello': '你好' } })(ctx)
    assert.equal((ctx as any).i18n.t('hello'), '你好')
    assert.equal((ctx as any).i18n.t('missing', '缺省'), '缺省')
  })

  it('loads component locale', () => {
    const ctx = mockCtx()
    i18n({ locale: 'en-US' })(ctx)
    assert.equal((ctx as any).i18n.components.Button?.loading, 'Loading...')
    assert.equal((ctx as any).i18n.components.FileUpload?.placeholder, 'Click or drag to upload')
  })

  it('resolves locale aliases', () => {
    const ctx = mockCtx()
    i18n({ locale: 'en' })(ctx)
    assert.equal((ctx as any).i18n.locale, 'en-US')
    assert.equal((ctx as any).i18n.components.Button?.loading, 'Loading...')
  })

  it('sets locale and triggers render', () => {
    let rendered = 0
    const ctx = { ...mockCtx(), ui: { $: () => ({}), render: () => { rendered++ }, dirty: () => {}, ready: true } }
    i18n({ locale: 'zh-CN' })(ctx)
    ;(ctx as any).i18n.setLocale('en')
    assert.equal((ctx as any).i18n.locale, 'en-US')
    assert.equal((ctx as any).i18n.components.Button?.loading, 'Loading...')
    assert.equal(rendered, 1)
  })
})
