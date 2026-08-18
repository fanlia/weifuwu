/**
 * SlideCanvas 画布编辑器测试（ODES 事件流——阶段 3）：
 * - 渲染：幻灯片/shape（文本/矩形——几何+层叠）
 * - 添加 shape → shape-add op + commit；删除
 * - 选中 + 拖拽（pointer move → pointerup 提交 move/resize commit）
 * - 双击文本编辑 → shape-set op
 * - AI 润色：浮层 → 接受 = shape-set commit（target=messageId）；拒绝不落 op
 * - 幻灯片增删
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../test/client/setup.ts'
import { SlideCanvas } from './SlideCanvas.ts'
import { h } from '../../ui-dom/vdom3/jsx.ts'
import { createRoot } from '../../ui-dom/vdom3/root.ts'
import { editEvents, resetEditEvents } from '../Editor/edit-events.ts'
import type { DeckState } from '../OfficeEditor/model/types.ts'

const mkDeck = (): DeckState => ({
  slides: [
    {
      shapes: [
        { id: 's1', kind: 'text', x: 100, y: 50, w: 400, h: 60, props: { text: '标题文本' } },
        { id: 's2', kind: 'rect', x: 0, y: 0, w: 200, h: 100, props: { fill: '#ff0000' } },
      ],
    },
    { shapes: [{ id: 's1', kind: 'text', x: 10, y: 10, w: 300, h: 40, props: { text: '第二页' } }] },
  ],
  activeSlide: 0,
  size: { w: 960, h: 540 },
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

describe('SlideCanvas（pptx 画布编辑器——ODES 事件流）', () => {
  before(() => { setupJsdom() })
  after(() => { resetEditEvents() })

  test('缩放 handle：pointerup 提交 resize commit（原子）', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SlideCanvas, { deck: mkDeck() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const shape = root.querySelector('.wf-slide-shape') as HTMLElement
    shape.dispatchEvent(new (window as any).PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 30))
    const resize = root.querySelector('.wf-slide-shape-resize') as HTMLElement
    assert.ok(resize, '选中后缩放 handle 出现')
    const r = shape.getBoundingClientRect()
    resize.dispatchEvent(new (window as any).PointerEvent('pointerdown', { clientX: r.right, clientY: r.bottom, bubbles: true, cancelable: true }))
    const scroll = root.querySelector('.wf-slide-canvas-scroll') as HTMLElement
    scroll.dispatchEvent(new (window as any).PointerEvent('pointermove', { clientX: r.right + 60, clientY: r.bottom + 40, bubbles: true }))
    scroll.dispatchEvent(new (window as any).PointerEvent('pointerup', { clientX: r.right + 60, clientY: r.bottom + 40, bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    const ops = editEvents(10, { action: 'office' }).map((e) => (e.payload as any)?.op?.type)
    assert.ok(ops.includes('shape-resize'), 'resize commit')
    assert.equal(ops.filter((t: string) => t === 'shape-resize').length, 1, '原子提交一次')
    resetEditEvents()
    root.remove()
  })

  test('Delete 键删除选中 shape → shape-remove op', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SlideCanvas, { deck: mkDeck() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const shape = root.querySelector('.wf-slide-shape') as HTMLElement
    shape.dispatchEvent(new (window as any).PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    const slideRoot = root.querySelector('.wf-slide') as HTMLElement
    slideRoot!.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(root.querySelectorAll('.wf-slide-shape').length, 1, '删除后 1 个 shape')
    const ops = editEvents(10, { action: 'office' }).map((e) => (e.payload as any)?.op?.type)
    assert.ok(ops.includes('shape-remove'), 'shape-remove 事件')
    resetEditEvents()
    root.remove()
  })

  test('AI 拒绝：不产生 op（状态记录审计）', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const gFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => new Response(
      'event: wf:token\ndata: {"text":"润色后"}\n\nevent: wf:done\ndata: {"content":"润色后"}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )
    const handle = createRoot(h(SlideCanvas, { deck: mkDeck(), ai: { url: '/api/ai' } } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const shape = root.querySelector('.wf-slide-shape') as HTMLElement
    shape.dispatchEvent(new (window as any).PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    const aiBtn = Array.from(root.querySelectorAll('.wf-slide-toolbar button')).find((b) => (b as HTMLElement).textContent === 'AI 润色') as HTMLElement
    aiBtn.click()
    await new Promise((r) => setTimeout(r, 200))
    const reject = document.querySelector('#__wf_portal .wf-btn--ghost') as HTMLElement
    reject?.click()
    await new Promise((r) => setTimeout(r, 50))
    const office = editEvents(20, { action: 'office' })
    const rejected = office.find((e) => (e.payload as any)?.ai?.status === 'rejected')
    assert.ok(rejected, 'rejected 事件')
    assert.equal((rejected!.payload as any).op, undefined, '拒绝不落 op')
    assert.ok(shape.textContent?.includes('标题文本'), '文本未变')
    ;(globalThis as any).fetch = gFetch
    resetEditEvents()
    root.remove()
  })

  test('渲染：幻灯片标签 + shape 几何/文本/层叠', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SlideCanvas, { deck: mkDeck() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const tabs = Array.from(root.querySelectorAll('.wf-slide-tab')).map((t) => t.textContent)
    assert.deepEqual(tabs, ['幻灯片 1', '幻灯片 2'], '幻灯片标签')
    const shapes = Array.from(root.querySelectorAll('.wf-slide-shape'))
    assert.equal(shapes.length, 2, 'shape 层叠')
    assert.ok(shapes[0].textContent?.includes('标题文本'), '文本 shape')
    assert.equal((shapes[1] as HTMLElement).style.background, 'rgb(255, 0, 0)', '矩形 fill')
    assert.equal((shapes[0] as HTMLElement).style.left, '100px', '几何 x')
    root.remove()
  })

  test('添加/删除 shape → shape-add/remove op + commit 审计', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SlideCanvas, { deck: mkDeck() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    // 添加文本
    const addText = Array.from(root.querySelectorAll('.wf-slide-toolbar button')).find((b) => (b as HTMLElement).textContent === '文本') as HTMLElement
    addText.click()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(root.querySelectorAll('.wf-slide-shape').length, 3, '添加后 3 个 shape')
    // 事件流：shape-add
    const add = editEvents(10, { action: 'office' }).find((e) => (e.payload as any)?.op?.type === 'shape-add')
    assert.ok(add, 'shape-add 事件')
    assert.equal((add!.payload as any).op.shape.kind, 'text')
    // 删除（选中后）
    const del = Array.from(root.querySelectorAll('.wf-slide-toolbar button')).find((b) => (b as HTMLElement).textContent === '删除') as HTMLElement
    del.click()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(root.querySelectorAll('.wf-slide-shape').length, 2, '删除后 2 个')
    const rm = editEvents(20, { action: 'office' }).find((e) => (e.payload as any)?.op?.type === 'shape-remove')
    assert.ok(rm, 'shape-remove 事件')
    resetEditEvents()
    root.remove()
  })

  test('拖拽：pointermove → pointerup 提交 move commit（live 不产生事件）', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SlideCanvas, { deck: mkDeck() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const shape = root.querySelector('.wf-slide-shape') as HTMLElement
    // pointerdown（move）→ pointermove（拖 50,30）→ pointerup
    shape.dispatchEvent(new (window as any).PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true, cancelable: true }))
    const scroll = root.querySelector('.wf-slide-canvas-scroll') as HTMLElement
    scroll.dispatchEvent(new (window as any).PointerEvent('pointermove', { clientX: 150, clientY: 130, bubbles: true }))
    scroll.dispatchEvent(new (window as any).PointerEvent('pointerup', { clientX: 150, clientY: 130, bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    // jsdom clientWidth=0 → fallback 640 → scale = 616/960
    const scale = (640 - 24) / 960
    const expX = Math.round(100 + 50 / scale)
    const expY = Math.round(50 + 30 / scale)
    assert.equal((shape as HTMLElement).style.left, `${expX}px`, '拖拽后 x 更新（scale 换算）')
    assert.equal((shape as HTMLElement).style.top, `${expY}px`, '拖拽后 y 更新')
    // 事件流：只有 1 次 move commit（live 期间无事件）
    const moves = editEvents(10, { action: 'office' }).filter((e) => (e.payload as any)?.op?.type === 'shape-move')
    assert.equal(moves.length, 1, 'pointerup 原子提交一次')
    resetEditEvents()
    root.remove()
  })

  test('双击文本编辑 → shape-set op；AI 润色浮层接受/拒绝', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const ctx = mkCtx()
    const gFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => new Response(
      'event: wf:token\ndata: {"text":"润色后的标题"}\n\nevent: wf:done\ndata: {"content":"润色后的标题"}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )
    const handle = createRoot(h(SlideCanvas, { deck: mkDeck(), ai: { url: '/api/ai' } } as any), root, { ctx })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    // 选中 shape（pointerdown 即可选中）
    const shape = root.querySelector('.wf-slide-shape') as HTMLElement
    shape.dispatchEvent(new (window as any).PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    // AI 润色
    const aiBtn = Array.from(root.querySelectorAll('.wf-slide-toolbar button')).find((b) => (b as HTMLElement).textContent === 'AI 润色') as HTMLElement
    aiBtn.click()
    await new Promise((r) => setTimeout(r, 250))
    const panel = document.querySelector('#__wf_portal .wf-slide-ai-panel') as HTMLElement
    assert.ok(panel, 'AI 浮层（portal 容器）')
    const accept = panel.querySelector('.wf-btn--primary') as HTMLElement
    accept.click()
    await new Promise((r) => setTimeout(r, 50))
    assert.ok(shape.textContent?.includes('润色后的标题'), 'AI 接受后文本更新')
    // 事件流：accepted + target=messageId
    const accepted = editEvents(20, { action: 'office' }).find((e) => (e.payload as any)?.ai?.status === 'accepted')
    assert.ok(accepted, 'accepted 事件')
    assert.ok(accepted!.target, 'target = messageId')
    assert.equal((accepted!.payload as any).op.type, 'shape-set')
    // 撤销恢复
    const undoBtn = Array.from(root.querySelectorAll('.wf-slide-toolbar button')).find((b) => (b as HTMLElement).textContent === '撤销') as HTMLElement
    undoBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    assert.ok(shape.textContent?.includes('标题文本'), '撤销恢复原文')
    ;(globalThis as any).fetch = gFetch
    resetEditEvents()
    root.remove()
  })

  test('幻灯片增删：+ 页 → slide-add；删页 → slide-delete', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(SlideCanvas, { deck: mkDeck() } as any), root, { ctx: mkCtx() })
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const addSlide = Array.from(root.querySelectorAll('.wf-slide-toolbar button')).find((b) => (b as HTMLElement).textContent === '+ 页') as HTMLElement
    addSlide.click()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(root.querySelectorAll('.wf-slide-tab').length, 3, '3 页')
    const ops = editEvents(10, { action: 'office' })
    assert.ok(ops.some((e) => (e.payload as any)?.op?.type === 'slide-add'), 'slide-add 事件')
    const delSlide = Array.from(root.querySelectorAll('.wf-slide-toolbar button')).find((b) => (b as HTMLElement).textContent === '删页') as HTMLElement
    delSlide.click()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(root.querySelectorAll('.wf-slide-tab').length, 2, '删回 2 页')
    resetEditEvents()
    root.remove()
  })
})
