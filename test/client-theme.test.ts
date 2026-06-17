import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import './setup.ts'
import { applyTheme, useTheme } from '../client-theme.ts'

describe('client-theme', () => {
  it('useTheme is a function', () => {
    assert.equal(typeof useTheme, 'function')
  })

  it('applyTheme sets data-theme on documentElement', () => {
    applyTheme('dark')
    assert.equal(document.documentElement.dataset.theme, 'dark')
  })

  it('applyTheme with light sets data-theme to light', () => {
    applyTheme('light')
    assert.equal(document.documentElement.dataset.theme, 'light')
  })

  it('applyTheme is a function', () => {
    assert.equal(typeof applyTheme, 'function')
  })
})
