/**
 * weifuwu/client — Confirm test
 */

import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()

import { confirm } from '../../client/confirm.ts'
import type { WfuiContext } from '../../client/types.ts'

describe('confirm middleware', () => {
  it('injects ctx.confirm', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    assert.equal(typeof (ctx as any).confirm, 'function')
  })

  it('creates modal and resolves on confirm', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    const promise = (ctx as any).confirm('确定？')
    // Should have created DOM elements
    const overlay = document.querySelector('.wf-modal')
    assert.ok(overlay, 'overlay should exist')
    // Click confirm button
    const btn = overlay!.querySelector('.wf-btn--primary') as HTMLButtonElement
    assert.ok(btn, 'confirm button should exist')
    btn.click()
    const result = await promise
    assert.equal(result, true)
  })

  it('resolves false on cancel', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    const promise = (ctx as any).confirm('确定？')
    const btn = document.querySelector('.wf-btn--secondary') as HTMLButtonElement
    btn.click()
    const result = await promise
    assert.equal(result, false)
  })
})
