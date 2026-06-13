import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('ai-sdk (barrel re-exports)', () => {
  it('re-exports all expected functions from ai SDK', async () => {
    const mod = await import('../ai-sdk.ts')
    assert.equal(typeof mod.streamText, 'function')
    assert.equal(typeof mod.generateText, 'function')
    assert.equal(typeof mod.generateObject, 'function')
    assert.equal(typeof mod.streamObject, 'function')
    assert.equal(typeof mod.tool, 'function')
    assert.equal(typeof mod.embed, 'function')
    assert.equal(typeof mod.embedMany, 'function')
    assert.equal(typeof mod.smoothStream, 'function')
  })

  it('re-exports openai from @ai-sdk/openai', async () => {
    const mod = await import('../ai-sdk.ts')
    assert.equal(typeof mod.openai, 'function')
    assert.equal(typeof mod.createOpenAI, 'function')
  })

  it('all exports are properly named', async () => {
    const mod = await import('../ai-sdk.ts')
    const keys = Object.keys(mod).sort()
    // openai and createOpenAI come from @ai-sdk/openai, everything else from ai
    assert.ok(keys.includes('openai'), 'openai is exported')
    assert.ok(keys.includes('createOpenAI'), 'createOpenAI is exported')
    assert.ok(keys.includes('streamText'), 'streamText is exported')
    assert.ok(keys.includes('generateText'), 'generateText is exported')
  })
})
