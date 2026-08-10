/**
 * popup 基础设施测试 — computeFixedPosRect（纯函数）+ clampToViewport（视口夹紧）
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { computeFixedPosRect, computeFixedPos, clampToViewport } from '../../ui-dom/popup.ts'

// 构造 DOMRect（jsdom 的 getBoundingClientRect 返回全 0，这里手造）
function rect(x: number, y: number, w: number, h: number): DOMRect {
  return { x, y, width: w, height: h, top: y, bottom: y + h, left: x, right: x + w, toJSON: () => ({}) } as DOMRect
}

// ── computeFixedPosRect ──────────────────────────────

test('computeFixedPosRect: bottom 居中', () => {
  const r = rect(100, 200, 40, 20) // bottom=220
  const p = computeFixedPosRect(r, 'bottom', 6, true)
  assert.equal(p.top, 226) // 220 + 6
  assert.equal(p.left, 120) // 100 + 40/2
})

test('computeFixedPosRect: bottom 左对齐（center=false）', () => {
  const r = rect(100, 200, 40, 20)
  const p = computeFixedPosRect(r, 'bottom', 6, false)
  assert.equal(p.top, 226)
  assert.equal(p.left, 100)
})

test('computeFixedPosRect: top 居中', () => {
  const r = rect(100, 200, 40, 20) // top=200
  const p = computeFixedPosRect(r, 'top', 6, true)
  assert.equal(p.top, 194) // 200 - 6
  assert.equal(p.left, 120)
})

test('computeFixedPosRect: left 居中', () => {
  const r = rect(100, 200, 40, 20) // left=100
  const p = computeFixedPosRect(r, 'left', 6, true)
  assert.equal(p.left, 94) // 100 - 6
  assert.equal(p.top, 210) // 200 + 20/2
})

test('computeFixedPosRect: right 居中', () => {
  const r = rect(100, 200, 40, 20) // right=140
  const p = computeFixedPosRect(r, 'right', 6, true)
  assert.equal(p.left, 146) // 140 + 6
  assert.equal(p.top, 210)
})

test('computeFixedPosRect: gap 默认 6', () => {
  const r = rect(0, 0, 10, 10)
  const p = computeFixedPosRect(r, 'bottom')
  assert.equal(p.top, 16) // 10 + 6
})

// ── clampToViewport ──────────────────────────────────

test('clampToViewport: panel 为 null 时原样返回', () => {
  const pos = { top: 999, left: 999 }
  const r = clampToViewport(pos, null)
  assert.deepEqual(r, pos)
})

test('clampToViewport: 0 rect 跳过（未布局）', () => {
  const el = document.createElement('div')
  const pos = { top: 500, left: 500 }
  // jsdom getBoundingClientRect 返回全 0 → 跳过
  const r = clampToViewport(pos, el)
  assert.deepEqual(r, pos)
})

test('clampToViewport: 底部超出视口时上移', () => {
  // 视口 jsdom 默认 innerWidth/Height = 1024x768
  const panel = document.createElement('div')
  // 模拟面板已渲染在 pos 位置：rect top=700 height=200 → bottom=900 > 768
  ;(panel as any).getBoundingClientRect = () => rect(100, 700, 200, 200)
  ;(panel as any).style = { top: '700px', left: '100px' }
  const pos = { top: 700, left: 100 } // 目标位置同当前
  const r = clampToViewport(pos, panel, 8)
  // bottom=900 > 768-8=760 → 上移 (900-760)=140 → top=560
  assert.equal(r.top, 560)
})

test('clampToViewport: 在视口内不动', () => {
  const panel = document.createElement('div')
  ;(panel as any).getBoundingClientRect = () => rect(100, 100, 200, 200)
  ;(panel as any).style = { top: '100px', left: '100px' }
  const pos = { top: 100, left: 100 }
  const r = clampToViewport(pos, panel, 8)
  assert.equal(r.top, 100)
  assert.equal(r.left, 100)
})
