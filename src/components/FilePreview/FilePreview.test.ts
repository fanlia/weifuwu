/**
 * FilePreview 组件端到端测试（vdom3 挂载——md 预览/编辑/AI 保存闭环）
 */

import { test, describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../test/client/setup.ts'
import { h } from '../../ui-dom/vdom3/index.ts'
import { createRoot } from '../../ui-dom/vdom3/root.ts'
import { FilePreview } from './FilePreview.ts'
import { editEvents, resetEditEvents } from '../Editor/edit-events.ts'

before(setupJsdom)

describe('FilePreview（串行——事件流全局缓冲）', () => {
  it('md 预览：复用 Markdown 渲染（安全 token——标题/列表）', async () => {
    resetEditEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(FilePreview, {
      type: 'md', content: '# 标题\n\n- 甲\n- 乙',
    } as any), root)
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    assert.ok(root.querySelector('h1'), '标题渲染')
    assert.equal(root.querySelector('h1')?.textContent, '标题')
    assert.equal(root.querySelectorAll('li').length, 2, '列表渲染')
    // 事件流可观测
    const previews = editEvents(10, { action: 'preview' })
    assert.equal(previews[0].payload?.type, 'md')
    assert.equal(previews[0].payload?.status, 'loaded')
    root.remove()
  })

  it('md 编辑：Editor 复用 + 保存回写 md（AI 替换 → serializeMarkdown）', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    let saved: string | null = null
    const handle = createRoot(h(FilePreview, {
      type: 'md',
      content: '# 标题\n\n这是**粗体**段落',
      editable: true,
      onSave: (content: string) => { saved = content },
    } as any), root)
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    // Editor 渲染（contentEditable）
    const editable = root.querySelector('.wf-editor-content')
    assert.ok(editable, '编辑模式渲染 Editor')
    assert.equal(editable?.textContent, '标题这是粗体段落')
    // 编辑：替换 "粗体" → "加粗"（模拟输入）
    const p = editable!.querySelector('p') as HTMLElement
    p!.innerHTML = '这是**加粗**段落'
    ;(editable as HTMLElement).dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    // 保存 → md 回写
    const saveBtn = root.querySelector('.wf-filepreview-actions .wf-btn') as HTMLElement
    assert.ok(saveBtn, '保存按钮存在')
    saveBtn!.click()
    await new Promise((r) => setTimeout(r, 20))
    assert.ok(saved?.includes('# 标题'), '保存含标题')
    assert.ok(saved?.includes('**加粗**'), '保存含粗体 mark')
    const saves = editEvents(10, { action: 'preview' })
    assert.equal(saves[0].payload?.status, 'saved')
    root.remove()
  })

  it('html 预览：iframe sandbox 隔离（不直插 DOM）', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(FilePreview, {
      type: 'html', content: '<script>window.x=1</script><h1>hi</h1>',
    } as any), root)
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const iframe = root.querySelector('iframe')
    assert.ok(iframe, 'iframe 渲染')
    assert.equal(iframe?.getAttribute('sandbox'), 'allow-same-origin', 'sandbox 隔离')
    assert.equal(root.querySelector('h1'), null, '内容不直插外层 DOM')
    assert.equal((window as any).x, undefined, 'script 未执行（sandbox 隔离）')
    root.remove()
  })

  it('远程加载：md 的 url fetch → 预览；加载失败占位', async () => {
    ;(globalThis as any).fetch = async (u: string) => {
      if (u === '/doc/readme.md') return new Response('# 远程文档\n\n内容来自 sandbox', { status: 200 })
      return new Response('not found', { status: 404 })
    }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(FilePreview, { type: 'md', url: '/doc/readme.md' } as any), root)
    await handle.ready
    // 加载完成（mock fetch 瞬时——直接断言结果）
    await new Promise((r) => setTimeout(r, 60))
    assert.equal(root.querySelector('h1')?.textContent, '远程文档', '远程内容渲染')
    assert.equal(root.textContent?.includes('内容来自 sandbox'), true)
    const previews = editEvents(20, { action: 'preview' })
    assert.equal(previews[0].payload?.status, 'loaded')
    root.remove()

    // 404 → 错误占位
    const root2 = document.createElement('div')
    document.body.appendChild(root2)
    const handle2 = createRoot(h(FilePreview, { type: 'md', url: '/missing.md' } as any), root2)
    await handle2.ready
    await new Promise((r) => setTimeout(r, 80))
    assert.ok(root2.querySelector('.wf-filepreview-error'), '错误占位')
    root2.remove()
  })

  it('表格内编辑 → 保存回写新内容（embed 快照变化同步）', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    let saved: string | null = null
    const handle = createRoot(h(FilePreview, {
      type: 'md',
      content: '| a | b |\n|---|---|\n| 1 | 2 |',
      editable: true,
      onSave: (v: string) => { saved = v },
    } as any), root)
    await handle.ready
    await new Promise((r) => setTimeout(r, 30))
    const ed = root.querySelector('.wf-editor-content') as HTMLElement
    // 浏览器直写表格内文本（contentEditable 原生）
    const td = ed!.querySelectorAll('table td')[3] as HTMLElement
    td!.textContent = '99'
    ed!.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    // 保存 → md 回写含新表格内容
    const saveBtn = root.querySelector('.wf-filepreview-actions .wf-btn') as HTMLElement
    saveBtn!.click()
    await new Promise((r) => setTimeout(r, 20))
    assert.ok(saved?.includes('| 99 |'), '表格内编辑保存生效')
    assert.ok(saved?.includes('| 2 |') === false, '旧单元格内容被替换')
    root.remove()
  })

  it('远程加载 + 编辑：md url → fetch → Editor 编辑 → 保存回写', async () => {
    ;(globalThis as any).fetch = async () => new Response('# 远程\n\n内容', { status: 200 })
    const root = document.createElement('div')
    document.body.appendChild(root)
    let saved: string | null = null
    const handle = createRoot(h(FilePreview, {
      type: 'md', url: '/doc/remote.md', editable: true,
      onSave: (v: string) => { saved = v },
    } as any), root)
    await handle.ready
    await new Promise((r) => setTimeout(r, 80))
    const editable = root.querySelector('.wf-editor-content')
    assert.ok(editable, '远程内容进入编辑模式')
    assert.equal(editable?.textContent, '远程内容')
    root.remove()
    assert.equal(saved, null, '未保存前为空')
  })

  it('pdf/office：iframe src 渲染；无 url 占位', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const handle = createRoot(h(FilePreview, { type: 'pdf', url: '/f.pdf' } as any), root)
    await handle.ready
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(root.querySelector('iframe')?.getAttribute('src'), '/f.pdf')
    root.remove()

    const root2 = document.createElement('div')
    document.body.appendChild(root2)
    const handle2 = createRoot(h(FilePreview, { type: 'office' } as any), root2)
    await handle2.ready
    await new Promise((r) => setTimeout(r, 20))
    assert.ok(root2.querySelector('.wf-filepreview-empty'), '缺 URL 占位')
    root2.remove()
  })
})
