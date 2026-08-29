/**
 * vdom v2 — portal/弹窗验证（popup-manager 渲染 v2 化——命令流等价 + FIFO 链）
 *
 * 缺口 6：弹窗独立实例 v2 引擎渲染——内容渲染命令流 v1/v2 相等
 * （renderV2 等价已有——专项：openPopup 的 render 路径 v2 化后行为一致）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { renderV2 } from '../../client/vdom/core/v2/render.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

test('portal 内容渲染：v2 命令流 v1 等价（弹窗内容——含交互组件）', async () => {
  const content = h('div', { class: 'popup-panel' }, [
    h('button', { onClick: () => {}, 'data-k': 'btn' }, '确定'),
    h('span', { class: 'text' }, '内容'),
    null,
  ])
  const v1: Command[] = []
  for await (const c of renderToStream(content, emptyCtx, createComponentRegistry())) v1.push(c)
  const v2: Command[] = []
  await new Promise((res) => renderV2(content, emptyCtx, createComponentRegistry()).subscribe({
    next: (c) => v2.push(c), complete: () => res(),
  }))
  assert.equal(v1.length, v2.length, '命令数相等')
  for (let i = 0; i < v1.length; i++) {
    assert.equal(JSON.stringify(v1[i]), JSON.stringify(v2[i]), `第 ${i} 条（v1: ${v1[i].op} / v2: ${v2[i].op}）`)
  }
})

test('portal 定位组件（浮层常用——Button/Icon 组合）渲染等价', async () => {
  const content = h('div', { class: 'panel' }, [
    h('button', { class: 'wf-btn' }, h('span', {}, 'OK')),
    h('div', { class: 'icon-row' }, [h('i', {}, 'x'), h('i', {}, 'y')]),
  ])
  const v1: Command[] = []
  for await (const c of renderToStream(content, emptyCtx, createComponentRegistry())) v1.push(c)
  const v2: Command[] = []
  await new Promise((res) => renderV2(content, emptyCtx, createComponentRegistry()).subscribe({
    next: (c) => v2.push(c), complete: () => res(),
  }))
  assert.equal(JSON.stringify(v1), JSON.stringify(v2), '弹窗内容命令流完全相等')
})
