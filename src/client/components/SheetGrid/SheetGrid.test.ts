/**
 * SheetGrid 网格编辑器测试（ODES 事件流底座）：
 * - 渲染：列头/行头/单元格值（公式显示 =formula）
 * - 编辑：点击单元格 → input → 提交 → cell-set op + commit（事件流审计）
 * - 行列增删：insert/delete rows/cols → 单元格平移
 * - 撤销：Ctrl+Z 恢复 before 快照
 * - AI：建议浮层 → 接受 = cell-set commit（原子撤销）；拒绝不落 op
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../ui-dom/setup.ts'
import { SheetGrid } from './SheetGrid.ts'
import { h } from '../../ui-dom/vdom3/jsx.ts'
import { createRoot } from '../../ui-dom/vdom3/root.ts'
import { editEvents, resetEditEvents } from '../Editor/edit-events.ts'
import type { WorkbookState } from '../OfficeEditor/model/types.ts'

const mkWorkbook = (): WorkbookState => ({
  sheets: [{
    name: '数据', cols: 2,
    cells: new Map([
      ['A1', { kind: 's', value: '项目' }],
      ['B1', { kind: 's', value: '金额' }],
      ['A2', { kind: 's', value: '营收' }],
      ['B2', { kind: 'n', value: 100 }],
    ]),
  }],
  activeSheet: 0,
})

function mkCtx(): any {
  return {
    i18n: {},
    ui: {
      render: () => {},
      usePopup: () => ({
        portal: (content: any) => content,
        setOpen: () => {},
        refresh: () => {},
        open: false,
        wrapProps: {},
      }),
    },
  }
}

describe('SheetGrid（xlsx 网格编辑器——ODES 事件流）', () => {
  before(() => { setupJsdom() })
  after(() => { resetEditEvents() })

  test('sheet 标签切换：activeSheet 更新 + 内容切换', async () => {
    const wb = mkWorkbook()
    wb.sheets.push({ name: '第二表', cols: 1, cells: new Map([['A1', { kind: 's', value: '另表' }]]) })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SheetGrid, { workbook: wb } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const tabs = Array.from(root.querySelectorAll('.wf-sheet-tab')) as HTMLElement[]
    tabs[1].click()
    await new Promise((r) => setTimeout(r, 30))
    const tds = Array.from(root.querySelectorAll('tbody td')).map((t) => t.textContent)
    assert.ok(tds.includes('另表'), '切换到第二表')
    assert.ok(!tds.includes('项目'), '第一表内容不显示')
    root.remove()
  })

  test('删除行：引用平移 + 单元格值更新', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SheetGrid, { workbook: mkWorkbook() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    ;(root.querySelector('tbody td:nth-child(2)') as HTMLElement).click() // A1 激活
    const delRow = Array.from(root.querySelectorAll('.wf-sheet-tools button'))[1] as HTMLElement // 删除行
    delRow.click()
    await new Promise((r) => setTimeout(r, 30))
    const tds = Array.from(root.querySelectorAll('tbody td')).map((t) => t.textContent)
    assert.equal(tds[0], '营收', '删除行后 A1 = 原 A2')
    const op = editEvents(10, { action: 'office' }).find((e) => (e.payload as any)?.op?.type === 'delete-rows')
    assert.ok(op, 'delete-rows 事件')
    resetEditEvents()
    root.remove()
  })

  test('插入列：单元格右移（B1 → C1）', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SheetGrid, { workbook: mkWorkbook() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    ;(root.querySelector('tbody td:nth-child(2)') as HTMLElement).click() // A1
    const insCol = Array.from(root.querySelectorAll('.wf-sheet-tools button'))[2] as HTMLElement // 插入列
    insCol.click()
    await new Promise((r) => setTimeout(r, 30))
    const tds = Array.from(root.querySelectorAll('tbody td')).map((t) => t.textContent)
    assert.equal(tds[1], '项目', '插入列后 A1 值右移到第 2 个 td（B1）')
    assert.equal(tds[2], '金额', '原 B1 右移到 C1')
    resetEditEvents()
    root.remove()
  })

  test('AI 拒绝：不产生 op（状态记录审计——CS-05）', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const gFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => new Response(
      'event: wf:token\ndata: {"text":"=SUM(B2)"}\n\nevent: wf:done\ndata: {"content":"=SUM(B2)"}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )
    const handle = createRoot(h(SheetGrid, {
      workbook: mkWorkbook(), ai: { url: '/api/ai' },
    } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    ;(Array.from(root.querySelectorAll('tbody td'))[0] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 30))
    const aiBtn = Array.from(root.querySelectorAll('.wf-sheet-tools button')).find((b) => (b as HTMLElement).textContent === 'AI 公式') as HTMLElement
    aiBtn.click()
    await new Promise((r) => setTimeout(r, 200))
    const reject = document.querySelector('#__wf_portal .wf-btn--ghost') as HTMLElement
    reject?.click()
    await new Promise((r) => setTimeout(r, 50))
    const office = editEvents(20, { action: 'office' })
    const rejected = office.find((e) => (e.payload as any)?.ai?.status === 'rejected')
    assert.ok(rejected, 'rejected 事件（不产生 op）')
    assert.equal((rejected!.payload as any).op, undefined, '拒绝不落 op')
    assert.equal(Array.from(root.querySelectorAll('tbody td'))[0]?.textContent, '项目', '单元格未变')
    ;(globalThis as any).fetch = gFetch
    resetEditEvents()
    root.remove()
  })

  test('渲染：列头/行头/单元格值（公式显示 =formula）', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SheetGrid, { workbook: mkWorkbook() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const heads = Array.from(root.querySelectorAll('.wf-sheet-colhead')).map((t) => t.textContent)
    assert.deepEqual(heads, ['A', 'B'], '列头')
    assert.equal(root.querySelector('.wf-sheet-rowhead')?.textContent, '1', '行头')
    assert.equal(root.querySelector('.wf-sheet-tab')?.textContent, '数据', 'sheet 标签')
    const tds = Array.from(root.querySelectorAll('tbody td')).map((t) => t.textContent)
    assert.ok(tds.includes('项目'))
    assert.ok(tds.includes('100'))
    root.remove()
  })

  test('编辑：点击单元格 → input → 提交 → cell-set op + 事件流审计', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SheetGrid, { workbook: mkWorkbook() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    // 点击 B2（第 2 行第 2 列 = 100）
    const tds = Array.from(root.querySelectorAll('tbody td'))
    const b2 = tds[3] as HTMLElement
    b2.click()
    await new Promise((r) => setTimeout(r, 30))
    const input = root.querySelector('.wf-sheet-input') as HTMLInputElement
    assert.ok(input, '编辑 input 出现')
    assert.equal(input.value, '100')
    // 修改 + 提交（blur）
    input.value = '200'
    input.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    input.dispatchEvent(new (window as any).Event('focusout', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    const tdsAfter = Array.from(root.querySelectorAll('tbody td'))
    assert.equal(tdsAfter[3]?.textContent, '200', '单元格更新')
    // 事件流：cell-set op
    const office = editEvents(10, { action: 'office' })
    const set = office.find((e) => (e.payload as any)?.op?.type === 'cell-set')
    assert.ok(set, 'cell-set 事件')
    assert.equal((set!.payload as any).op.ref, 'B2')
    assert.equal((set!.payload as any).op.cell.value, 200)
    resetEditEvents()
    root.remove()
  })

  test('行列增删：insert-rows 平移单元格 + 撤销恢复', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SheetGrid, { workbook: mkWorkbook() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    // 点 A1 → 插入行
    const a1 = root.querySelector('tbody td') as HTMLElement
    a1.click()
    const btns = Array.from(root.querySelectorAll('.wf-sheet-tools button')).map((b) => (b as HTMLElement).textContent)
    const insertBtn = Array.from(root.querySelectorAll('.wf-sheet-tools button'))[0] as HTMLElement
    insertBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    // A1 被平移——原 A1 值 '项目' 现在在 A2（tds 顺序：A1,B1,A2,B2——tds[2]=A2）
    const tds = Array.from(root.querySelectorAll('tbody td'))
    assert.equal(tds[2]?.textContent, '项目', '插入行后原 A1 → A2（行 2 第 1 列）')
    // 撤销
    const undoBtn = Array.from(root.querySelectorAll('.wf-sheet-tools button')).find((b) => (b as HTMLElement).textContent === '撤销') as HTMLElement
    undoBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(root.querySelector('tbody td')?.textContent, '项目', '撤销恢复 A1')
    resetEditEvents()
    root.remove()
  })

  test('AI 公式：选中格 → 建议浮层 → 接受 = cell-set commit；拒绝不落 op', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    // mock aiStream（通过 ui-dom/ai 的全局 fetch mock 不可行——直接 mock fetch SSE）
    const ctx = mkCtx()
    const globalFetch = (globalThis as any).fetch
    let fetchCalled = 0
    ;(globalThis as any).fetch = async () => {
      fetchCalled++
      return new Response(
        'event: wf:token\ndata: {"text":"=SUM(B2)"}\n\nevent: wf:done\ndata: {"content":"=SUM(B2)"}\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    const handle = createRoot(h(SheetGrid, {
      workbook: mkWorkbook(), ai: { url: '/api/ai' },
    } as any), root, { ctx })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    // 激活单元格（tds 顺序 A1,B1,A2,B2——tds[2]=A2）→ AI 按钮
    const tds = Array.from(root.querySelectorAll('tbody td'))
    ;(tds[2] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 30))
    const aiBtn = Array.from(root.querySelectorAll('.wf-sheet-tools button')).find((b) => (b as HTMLElement).textContent === 'AI 公式') as HTMLElement
    assert.ok(aiBtn, 'AI 按钮存在')
    aiBtn.click()
    await new Promise((r) => setTimeout(r, 50))
    await new Promise((r) => setTimeout(r, 300))
    // 浮层 + 接受（usePopup portal → #__wf_portal——§5.4 弹窗纪律）
    assert.ok(fetchCalled > 0, `aiStream fetch 调用（${fetchCalled}）`)
    const panel = document.querySelector('#__wf_portal .wf-sheet-ai-panel') as HTMLElement
    assert.ok(panel, 'AI 建议浮层（portal 容器内）')
    const acceptBtn = panel.querySelector('.wf-btn--primary') as HTMLElement
    acceptBtn.click()
    await new Promise((r) => setTimeout(r, 50))
    // A2 变成公式（=SUM(B2)）
    const tdsAfter = Array.from(root.querySelectorAll('tbody td'))
    assert.equal(tdsAfter[2]?.textContent, '=SUM(B2)', 'AI 接受后单元格公式')
    // 事件流：accepted 关联
    const office = editEvents(20, { action: 'office' })
    const accepted = office.find((e) => (e.payload as any)?.ai?.status === 'accepted')
    assert.ok(accepted, 'accepted 事件')
    assert.equal((accepted!.payload as any).op.ref, 'A2')
    assert.ok(accepted!.target, 'target = messageId')
    assert.equal((accepted!.payload as any).op.ref, 'A2')
    // 撤销（AI commit 原子）
    const undoBtn = Array.from(root.querySelectorAll('.wf-sheet-tools button')).find((b) => (b as HTMLElement).textContent === '撤销') as HTMLElement
    undoBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    const tdsUndo = Array.from(root.querySelectorAll('tbody td'))
    assert.equal(tdsUndo[2]?.textContent, '营收', 'AI commit 撤销一步恢复')
    ;(globalThis as any).fetch = globalFetch
    resetEditEvents()
    root.remove()
  })
})
