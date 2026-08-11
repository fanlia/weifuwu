/**
 * draggable 属性渲染正确性（enumerated 属性——空字符串 = false 的回归防线）
 * 根因：setProp/patchProps 对 true 值 setAttribute(key, '') 适用于 boolean 属性，
 * 但 draggable 是 enumerated——必须显式 'true'/'false'，否则 el.draggable 为 false
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'
import { h } from '../../ui-dom/vnode.ts'
import { mountVNode } from '../../ui-dom/render.ts'
const browser = createClientBrowser()

setupJsdom()

async function renderToDom(vnode: any){
  const container = browser.createElement('div')
  await mountVNode(container, vnode, { ui: {} } as any)
  return container.firstChild as HTMLElement
}

test('draggable: true → el.draggable === true（enumerated 显式 true）', async () => {
  const el = await renderToDom(h('div', { draggable: true }))
  assert.equal(el.getAttribute('draggable'), 'true')
  assert.equal(el.draggable, true)
})

test('draggable: false → el.draggable === false', async () => {
  const el = await renderToDom(h('div', { draggable: false }))
  assert.equal(el.getAttribute('draggable'), 'false')
  assert.equal(el.draggable, false)
})

test('drag 事件绑定（onDragStart → dragstart listener）', async () => {
  let fired = 0
  const el = await renderToDom(h('div', { draggable: true, onDragStart: () => { fired++ } }))
  el.dispatchEvent(new (window as any).Event('dragstart', { bubbles: true }))
  assert.equal(fired, 1, 'dragstart 事件应触发')
})
