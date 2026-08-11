/**
 * vdom style diff 防线：null/undefined 值移除旧样式 + 值更新
 *
 * v1 时代曾踩过「style diff 只设不删：display: undefined 残留旧 none」——
 * vdom setProp 修复后以单元测试固化（不依赖挂载/rerender 机制）。
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { setProp } from '../../ui-dom/vdom/render.ts'
import { patchProps } from '../../ui-dom/vdom/diff.ts'

before(setupJsdom)

test('style diff：display: undefined 移除旧 display: none', () => {
  const el = document.createElement('div')
  // 首次渲染：display: none
  setProp(el, 'style', { display: 'none' })
  assert.equal(el.style.display, 'none', '初始 none')

  // diff：display → undefined（移除）
  patchProps(el, { style: { display: 'none' } }, { style: { display: undefined } })
  assert.equal(el.style.display, '', 'undefined 应移除旧 display（不残留 none）')

  // 再切回 none
  patchProps(el, { style: { display: undefined } }, { style: { display: 'none' } })
  assert.equal(el.style.display, 'none', '再次设置恢复 none')
})

test('style 值更新（字符串 + number）', () => {
  const el = document.createElement('div')
  setProp(el, 'style', { width: '10px', opacity: 0.5 })
  assert.equal(el.style.width, '10px')
  assert.equal(el.style.opacity, '0.5')

  patchProps(el, { style: { width: '10px', opacity: 0.5 } }, { style: { width: '100px', opacity: 1 } })
  assert.equal(el.style.width, '100px')
  assert.equal(el.style.opacity, '1')
})
