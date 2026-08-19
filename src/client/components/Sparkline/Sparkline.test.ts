import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeSparklinePoints } from './sparkline-utils.ts'
import { Sparkline } from './Sparkline.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'


describe('computeSparklinePoints — 归一化', () => {
  test('线性映射：data 值映射到 [padding, height-padding]', async () => {
    const pts = computeSparklinePoints([0, 50, 100], 120, 32, 2)
    assert.equal(pts.length, 3)
    assert.equal(pts[0].x, 2) // 首点贴左
    assert.equal(pts[2].x, 118) // 末点贴右
    assert.equal(pts[0].y, 30) // min → 底部
    assert.equal(pts[2].y, 2) // max → 顶部
    assert.equal(pts[1].y, 16) // 中间值 → 中间
  })

  test('单点：居中（x 中点，y 垂直居中）', async () => {
    const pts = computeSparklinePoints([42], 120, 32, 2)
    assert.equal(pts.length, 1)
    assert.equal(pts[0].x, 60)
    assert.equal(pts[0].y, 16)
  })

  test('等值数据：y 居中不崩溃（除零防护）', async () => {
    const pts = computeSparklinePoints([5, 5, 5, 5], 120, 32, 2)
    assert.equal(pts.length, 4)
    assert.ok(pts.every(p => p.y === 16), '等值 → 全部垂直居中')
  })

  test('空数据 → 空数组', async () => {
    assert.deepEqual(computeSparklinePoints([], 120, 32, 2), [])
  })

  test('负数范围映射正确', async () => {
    const pts = computeSparklinePoints([-10, 10], 120, 32, 2)
    assert.equal(pts[0].y, 30)
    assert.equal(pts[1].y, 2)
  })

  test('两点 x 均匀分布', async () => {
    const pts = computeSparklinePoints([1, 2], 100, 30, 2)
    assert.equal(pts[0].x, 2)
    assert.equal(pts[1].x, 98)
  })
})

describe('Sparkline 组件', () => {
  test('渲染 svg + polyline', async () => {
    const vnode = await renderVNode(Sparkline, { data: [1, 3, 2, 5] }, createTestCtx())
    assert.equal(vnode.type, 'svg')
    assert.ok(vnode.props.class.includes('wf-sparkline'))
    // children: polyline + 可能 area
    const kids = vnode.props.children as any[]
    assert.ok(kids.some(k => k.type === 'polyline'), '应有 polyline')
  })

  test('polyline points 含归一化坐标', async () => {
    const vnode = await renderVNode(Sparkline, { data: [0, 100], width: 100, height: 20 }, createTestCtx())
    const kids = vnode.props.children as any[]
    const poly = kids.find(k => k.type === 'polyline')
    assert.match(poly.props.points, /^2,18 98,2$/)
  })

  test('空数据 → 渲染空 svg（无 polyline）', async () => {
    const vnode = await renderVNode(Sparkline, { data: [] }, createTestCtx())
    const kids = vnode.props.children as any[]
    assert.ok(!kids.some(k => k.type === 'polyline'), '空数据无 polyline')
  })

  test('smooth → 渲染 path 而非 polyline', async () => {
    const vnode = await renderVNode(Sparkline, { data: [1, 2, 3], smooth: true }, createTestCtx())
    const kids = vnode.props.children as any[]
    assert.ok(kids.some(k => k.type === 'path'), 'smooth 用 path')
    assert.ok(!kids.some(k => k.type === 'polyline'), 'smooth 不用 polyline')
  })

  test('fill 时渲染 area path', async () => {
    const vnode = await renderVNode(Sparkline, { data: [1, 2, 3], fill: true }, createTestCtx())
    const kids = vnode.props.children as any[]
    assert.ok(kids.filter(k => k.type === 'path').length >= 1 || kids.some(k => k.type === 'polyline' && k.props.fill !== undefined), '有面积填充')
  })

  test('label 提供：role=img + aria-label（否则 aria-hidden）', async () => {
    const v1 = await renderVNode(Sparkline, { data: [1, 2, 3], label: '七日趋势上升' }, createTestCtx())!
    const s1 = JSON.stringify(v1)
    assert.ok(s1.includes('"role":"img"'), 'role=img')
    assert.ok(s1.includes('七日趋势上升'), 'aria-label 文本')
    assert.ok(!s1.includes('"aria-hidden":true'), '有 label 不再 hidden')
    const v2 = await renderVNode(Sparkline, { data: [1, 2, 3] }, createTestCtx())!
    assert.ok(JSON.stringify(v2).includes('"aria-hidden":true'), '无 label 装饰态')
  })
})

