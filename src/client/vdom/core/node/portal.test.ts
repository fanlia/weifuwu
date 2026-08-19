/**
 * vdom core — portal 测试
 *
 * 锁定规则（AGENTS §5.4/§4.0）：Portal 内部符号（公共面不导出）；createPortal
 * 工厂（纯数据——key = portalKey 语义化）；命令流——主树插槽占位锚 + 内容
 * 渲染到 #__wf_portal 容器（id 前缀 'portal:'——命名空间隔离）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../../setup.ts'
import { Portal, isPortal, createPortal, portalContainerId, PORTAL_CONTAINER_ID, PORTAL_ID_PREFIX } from './portal.ts'
import { h } from '../vnode.ts'
import { renderToStream } from '../build.ts'
import { CommandApplier } from '../patch/index.ts'
import type { Command } from '../command/index.ts'

test('Portal 内部符号 + createPortal 工厂（纯数据——key 语义化）', () => {
  const p = createPortal(h('div', {}, 'dropdown'), 'menu')
  assert.equal(isPortal(p), true)
  assert.equal(p.key, 'menu', 'portalKey 进 vnode.key')
  assert.equal(portalContainerId('menu'), `${PORTAL_CONTAINER_ID}-menu`)
  assert.equal(isPortal(h('div', {})), false)
  const def = createPortal(h('span', {}))
  assert.equal(def.key, null, '无 portalKey → default')
  assert.ok(typeof Portal === 'symbol')
})

test('renderToStream：portal 内容渲染到 portal 容器（id 前缀隔离）', async () => {
  const stream = renderToStream(
    h('div', {}, [
      h('span', {}, 'main'),
      createPortal(h('div', { class: 'pop' }, 'float'), 'menu'),
    ]),
  )
  const cmds: Command[] = []
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  const portalInserts = cmds.filter((c) => c.op === 'insert' && c.parent.startsWith(PORTAL_ID_PREFIX))
  assert.equal(portalInserts.length, 2, 'portal 内容 2 节点（div.pop + 文本）挂 portal 容器')
  const anchor = cmds.find((c) => c.op === 'createAnchor')
  assert.ok(anchor, '主树插槽占位锚存在')
})

test('apply：portal 内容落到 #__wf_portal（惰性容器创建——挂 body）', async () => {
  const browser = testBrowser()
  const stream = renderToStream(
    h('div', {}, [
      h('span', {}, 'main'),
      createPortal(h('div', { class: 'pop' }, 'float'), 'menu'),
    ]),
  )
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  assert.equal(root.querySelector('span')?.textContent, 'main', '主树正常')
  const host = browser.document.getElementById(PORTAL_CONTAINER_ID)
  assert.ok(host, '#__wf_portal 容器已创建')
  const pop = browser.document.querySelector('.pop')
  assert.ok(pop, 'portal 内容渲染到浮层容器')
  assert.equal(pop?.closest(`#${PORTAL_CONTAINER_ID}`) !== null, true, '内容在 portal 容器内')
  assert.equal(pop?.textContent, 'float')
})

test('portal 容器按 key 区分（同组件多弹层隔离）', async () => {
  const browser = testBrowser()
  const stream = renderToStream(
    h('div', {}, [
      createPortal(h('div', { class: 'a' }, 'A'), 'menu'),
      createPortal(h('div', { class: 'b' }, 'B'), 'tooltip'),
    ]),
  )
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  const a = browser.document.querySelector('.a')
  const b = browser.document.querySelector('.b')
  assert.equal(a?.parentElement?.id, `${PORTAL_CONTAINER_ID}-menu`)
  assert.equal(b?.parentElement?.id, `${PORTAL_CONTAINER_ID}-tooltip`)
})

test('portal 同 key 内容更新：精准对照到 portal 容器（插槽锚保持——不重建）', async () => {
  const browser = testBrowser()
  const doc = browser.document
  const root = doc.createElement('div')
  doc.body.appendChild(root)
  const applier = new CommandApplier(root, doc)
  // 首帧：portal 内容 'a'（id portal:dd.0）
  applier.apply({ op: 'create', id: 'root.0', tag: 'div', attrs: {} })
  applier.apply({ op: 'insert', id: 'root.0', parent: 'root', ref: null })
  applier.apply({ op: 'createAnchor', id: 'root.0.0', detail: 'portal' })
  applier.apply({ op: 'insert', id: 'root.0.0', parent: 'root.0', ref: null })
  applier.apply({ op: 'createText', id: 'portal:dd.0', value: 'a' })
  applier.apply({ op: 'insert', id: 'portal:dd.0', parent: 'portal:dd', ref: null })
  // 更新：内容 'a' → 'b'（同 key——diff 精准——setText 不重建）
  applier.apply({ op: 'setText', id: 'portal:dd.0', value: 'b' })
  assert.equal(doc.querySelector('#__wf_portal-dd')?.textContent, 'b', '同 key 内容更新（就地 setText）')
  assert.equal(root.querySelector('#root\\.0\\.0'), null, '插槽锚在主树（不在 portal 容器）')
})

test('portal 异 key 切换：旧容器清理（removePortal——无残留）+ 新容器渲染', async () => {
  const browser = testBrowser()
  const doc = browser.document
  const root = doc.createElement('div')
  doc.body.appendChild(root)
  const applier = new CommandApplier(root, doc)
  // 首帧：portal 'a'（内容 'old'）
  applier.apply({ op: 'create', id: 'root.0', tag: 'div', attrs: {} })
  applier.apply({ op: 'insert', id: 'root.0', parent: 'root', ref: null })
  applier.apply({ op: 'createAnchor', id: 'root.0.0', detail: 'portal' })
  applier.apply({ op: 'insert', id: 'root.0.0', parent: 'root.0', ref: null })
  applier.apply({ op: 'createText', id: 'portal:a.0', value: 'old' })
  applier.apply({ op: 'insert', id: 'portal:a.0', parent: 'portal:a', ref: null })
  assert.equal(doc.querySelector('#__wf_portal-a')?.textContent, 'old')
  // 异 key 切换：portal 'b'——旧容器 removePortal 清理
  applier.apply({ op: 'removePortal', key: 'a' })
  assert.equal(doc.querySelector('#__wf_portal-a'), null, '旧容器移除（无残留）')
  applier.apply({ op: 'createText', id: 'portal:b.0', value: 'new' })
  applier.apply({ op: 'insert', id: 'portal:b.0', parent: 'portal:b', ref: null })
  assert.equal(doc.querySelector('#__wf_portal-b')?.textContent, 'new', '新容器渲染')
  assert.equal(doc.querySelectorAll('#__wf_portal > div').length, 1, '仅新容器（旧容器已清）')
})
