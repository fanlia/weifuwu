/**
 * vdom core — portal 测试
 *
 * 锁定规则（AGENTS §5.4/§4.0）：Portal 内部符号（公共面不导出）；createPortal
 * 工厂（纯数据——key = portalKey 语义化）；命令流——主树插槽占位锚 + 内容
 * 渲染到 #__wf_portal 容器（id 前缀 'portal:'——命名空间隔离）。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { Portal, isPortal, createPortal, portalContainerId, PORTAL_CONTAINER_ID, PORTAL_ID_PREFIX } from './portal.ts'
import { h } from '../vnode.ts'
import { renderToStream } from '../build.ts'
import { CommandApplier } from '../patch/index.ts'
import type { Command } from '../command/index.ts'

test('Portal 内部符号 + createPortal 工厂（纯数据——key 语义化）', () => {
  const p = createPortal(h('div', {}, 'dropdown'), 'menu')
  expect(isPortal(p)).toBe(true)
  expect(p.key, 'portalKey 进 vnode.key').toBe('menu')
  expect(portalContainerId('menu')).toBe(`${PORTAL_CONTAINER_ID}-menu`)
  expect(isPortal(h('div', {}))).toBe(false)
  const def = createPortal(h('span', {}))
  expect(def.key, '无 portalKey → default').toBe(null)
  expect(typeof Portal === 'symbol').toBeTruthy()
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
  expect(portalInserts.length, 'portal 内容 2 节点（div.pop + 文本）挂 portal 容器').toBe(2)
  const anchor = cmds.find((c) => c.op === 'createAnchor')
  expect(anchor, '主树插槽占位锚存在').toBeTruthy()
})

test('apply：portal 内容落到 #__wf_portal（惰性容器创建——挂 body）', async () => {
  const stream = renderToStream(
    h('div', {}, [
      h('span', {}, 'main'),
      createPortal(h('div', { class: 'pop' }, 'float'), 'menu'),
    ]),
  )
  const root = document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, document)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  expect(root.querySelector('span')?.textContent, '主树正常').toBe('main')
  const host = document.getElementById(PORTAL_CONTAINER_ID)
  expect(host, '#__wf_portal 容器已创建').toBeTruthy()
  const pop = document.querySelector('.pop')
  expect(pop, 'portal 内容渲染到浮层容器').toBeTruthy()
  expect(pop?.closest(`#${PORTAL_CONTAINER_ID}`) !== null, '内容在 portal 容器内').toBe(true)
  expect(pop?.textContent).toBe('float')
})

test('portal 容器按 key 区分（同组件多弹层隔离）', async () => {
  const stream = renderToStream(
    h('div', {}, [
      createPortal(h('div', { class: 'a' }, 'A'), 'menu'),
      createPortal(h('div', { class: 'b' }, 'B'), 'tooltip'),
    ]),
  )
  const root = document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, document)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  const a = document.querySelector('.a')
  const b = document.querySelector('.b')
  expect(a?.parentElement?.id).toBe(`${PORTAL_CONTAINER_ID}-menu`)
  expect(b?.parentElement?.id).toBe(`${PORTAL_CONTAINER_ID}-tooltip`)
})

test('portal 同 key 内容更新：精准对照到 portal 容器（插槽锚保持——不重建）', async () => {
  const doc = document
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
  expect(doc.querySelector('#__wf_portal-dd')?.textContent, '同 key 内容更新（就地 setText）').toBe('b')
  expect(root.querySelector('#root\\.0\\.0'), '插槽锚在主树（不在 portal 容器）').toBe(null)
})

test('portal 异 key 切换：旧容器清理（removePortal——无残留）+ 新容器渲染', async () => {
  const doc = document
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
  expect(doc.querySelector('#__wf_portal-a')?.textContent).toBe('old')
  // 异 key 切换：portal 'b'——旧容器 removePortal 清理
  applier.apply({ op: 'removePortal', key: 'a' })
  expect(doc.querySelector('#__wf_portal-a'), '旧容器移除（无残留）').toBe(null)
  applier.apply({ op: 'createText', id: 'portal:b.0', value: 'new' })
  applier.apply({ op: 'insert', id: 'portal:b.0', parent: 'portal:b', ref: null })
  expect(doc.querySelector('#__wf_portal-b')?.textContent, '新容器渲染').toBe('new')
  expect(doc.querySelectorAll('#__wf_portal > div').length, '仅新容器（旧容器已清）').toBe(1)
})
