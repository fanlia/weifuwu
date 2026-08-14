import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { diffLines } from './diff-utils.ts'
import { DiffView } from './DiffView.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'


describe('diffLines — LCS 行 diff 算法', () => {
  test('纯新增：所有新行标记 add', async () => {
    const r = diffLines('', 'a\nb\nc')
    assert.deepEqual(r, [
      { type: 'add', line: 'a' },
      { type: 'add', line: 'b' },
      { type: 'add', line: 'c' },
    ])
  })

  test('纯删除：所有旧行标记 remove', async () => {
    const r = diffLines('a\nb\nc', '')
    assert.deepEqual(r, [
      { type: 'remove', line: 'a' },
      { type: 'remove', line: 'b' },
      { type: 'remove', line: 'c' },
    ])
  })

  test('未变：全部 same', async () => {
    const r = diffLines('a\nb', 'a\nb')
    assert.deepEqual(r, [
      { type: 'same', line: 'a' },
      { type: 'same', line: 'b' },
    ])
  })

  test('修改 = 删旧 + 增新（相邻配对）', async () => {
    const r = diffLines('a\nx\nb', 'a\ny\nb')
    assert.deepEqual(r, [
      { type: 'same', line: 'a' },
      { type: 'remove', line: 'x' },
      { type: 'add', line: 'y' },
      { type: 'same', line: 'b' },
    ])
  })

  test('交错 diff：多个增删块', async () => {
    const r = diffLines('a\nb\nc\nd', 'a\nx\nc\ny')
    assert.deepEqual(r, [
      { type: 'same', line: 'a' },
      { type: 'remove', line: 'b' },
      { type: 'add', line: 'x' },
      { type: 'same', line: 'c' },
      { type: 'remove', line: 'd' },
      { type: 'add', line: 'y' },
    ])
  })

  test('尾部追加', async () => {
    const r = diffLines('a\nb', 'a\nb\nc')
    assert.deepEqual(r, [
      { type: 'same', line: 'a' },
      { type: 'same', line: 'b' },
      { type: 'add', line: 'c' },
    ])
  })

  test('头部插入', async () => {
    const r = diffLines('a\nb', 'x\na\nb')
    assert.deepEqual(r, [
      { type: 'add', line: 'x' },
      { type: 'same', line: 'a' },
      { type: 'same', line: 'b' },
    ])
  })

  test('空输入：两侧空 → 空结果', async () => {
    assert.deepEqual(diffLines('', ''), [])
  })
})

describe('DiffView 组件', () => {
  test('渲染三态行 + 行号', async () => {
    const vnode = await renderVNode(
      DiffView,
      { oldCode: 'a\nx\nb', newCode: 'a\ny\nb' },
      createTestCtx(),
    )
    // 容器
    assert.equal(vnode.type, 'div')
    assert.equal(vnode.props.class, 'wf-diffview')
    const rows = vnode.props.children as any[]
    assert.ok(rows.length >= 2)
  })

  test('不变行超过 foldThreshold 折叠为块', async () => {
    const oldCode = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n')
    const newCode = 'line0\nchanged\n' + Array.from({ length: 8 }, (_, i) => `line${i + 2}`).join('\n')
    const vnode = await renderVNode(
      DiffView,
      { oldCode, newCode, foldThreshold: 4 },
      createTestCtx(),
    )
    const rows = vnode.props.children[1].props.children as any[]
    // 变化行 + 折叠块
    assert.ok(rows.some(r => r.props?.class?.includes('wf-diffview-fold')), '应有折叠块')
  })

  test('全部不变：不渲染折叠块（无变化无需折叠）', async () => {
    const vnode = await renderVNode(
      DiffView,
      { oldCode: 'a\nb\nc', newCode: 'a\nb\nc' },
      createTestCtx(),
    )
    const rows = vnode.props.children[1].props.children as any[]
    assert.ok(!rows.some(r => r.props?.class?.includes('wf-diffview-fold')), '无变化不折叠')
  })

  test('标题渲染', async () => {
    const vnode = await renderVNode(
      DiffView,
      { oldCode: 'a', newCode: 'b', oldTitle: '旧版', newTitle: '新版' },
      createTestCtx(),
    )
    // 有标题区域
    const header = (vnode.props.children as any[]).find(c => c.props?.class?.includes('wf-diffview-header'))
    assert.ok(header, '应有 header')
  })
})

describe('DiffView 组件渲染', () => {
  test('渲染 diff 行（add/remove 三态）', async () => {
    const vnode = await renderVNode(DiffView, { oldCode: 'a\nb', newCode: 'a\nc' }, createTestCtx())!
    const s = JSON.stringify(vnode)
    assert.ok(s.includes('wf-diffview'), '容器类')
    assert.ok(s.includes('--add') && s.includes('--remove'), '三态行类')
  })

  test('oldTitle/newTitle 渲染', async () => {
    const vnode = await renderVNode(DiffView, { oldCode: 'a', newCode: 'b', oldTitle: '旧', newTitle: '新' }, createTestCtx())!
    const s = JSON.stringify(vnode)
    assert.ok(s.includes('旧') && s.includes('新'), '标题渲染')
  })

  test('相同代码 / 空代码安全', async () => {
    const same = await renderVNode(DiffView, { oldCode: 'x', newCode: 'x' }, createTestCtx())!
    assert.ok(same)
    const empty = await renderVNode(DiffView, { oldCode: '', newCode: '' }, createTestCtx())!
    assert.ok(empty, '空代码渲染')
  })

  test('foldThreshold 折叠不抛错', async () => {
    const vnode = await renderVNode(DiffView, { oldCode: 'a\nb\nc\nd\ne\nf\ng', newCode: 'a\nx\nc\nd\ne\nf\ng', foldThreshold: 5 }, createTestCtx())!
    assert.ok(vnode)
  })

  test('maxLines 限制', async () => {
    const vnode = await renderVNode(DiffView, { oldCode: 'a\nb\nc', newCode: 'a\nx\nc', maxLines: 2 }, createTestCtx())!
    assert.ok(vnode)
  })
})
