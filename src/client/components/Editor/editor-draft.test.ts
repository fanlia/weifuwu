/**
 * Editor 草稿持久化测试（draftKey：防抖自动保存 + 首帧恢复）
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../ui-dom/setup.ts'
import { h } from '../../ui-dom/vdom3/index.ts'
import { createRoot } from '../../ui-dom/vdom3/root.ts'
import { Editor } from './Editor.ts'
import { setSelectionOffsets } from './model/dom.ts'

before(setupJsdom)

interface FakeBrowser {
  store: Map<string, string>
  storageGet: (k: string) => string | null
  storageSet: (k: string, v: string) => void
}

function fakeBrowser(): FakeBrowser {
  const store = new Map<string, string>()
  return {
    store,
    storageGet: (k) => store.get(k) ?? null,
    storageSet: (k, v) => { store.set(k, v) },
  }
}

function makeCtxWithBrowser(b: FakeBrowser): any {
  return { browser: b, ui: { render: () => {}, usePopup: () => ({ portal: () => null, setOpen: () => {}, refresh: () => {}, open: false, wrapProps: {} }) } }
}

async function mountWith(ctx: any, props: Record<string, unknown>): Promise<{ root: HTMLElement; content: () => HTMLElement | null }> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = createRoot(h(Editor, props as any), root, { ctx })
  await handle.ready
  await new Promise((r) => setTimeout(r, 30))
  const content = () => root.querySelector('.wf-editor-content') as HTMLElement | null
  return { root, content }
}

test('draftKey：输入后防抖保存草稿', async () => {
  const b = fakeBrowser()
  const ctx = makeCtxWithBrowser(b)
  const { root, content } = await mountWith(ctx, { value: '<p>hello</p>', onChange: () => {}, draftKey: 'doc-1' })
  const el = content()!
  setSelectionOffsets(el, 5, 5)
  el.innerHTML = '<p>hello world</p>'
  el.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
  // 防抖 500ms——立即不保存
  assert.equal(b.store.get('wf-editor-draft:doc-1'), undefined, '防抖窗口内不保存')
  await new Promise((r) => setTimeout(r, 600))
  assert.equal(b.store.get('wf-editor-draft:doc-1'), '<p>hello world</p>', '防抖后保存草稿')
  root.remove()
})

test('draftKey：格式操作后保存草稿', async () => {
  const b = fakeBrowser()
  const ctx = makeCtxWithBrowser(b)
  const { root, content } = await mountWith(ctx, { value: '<p>hello</p>', onChange: () => {}, draftKey: 'doc-2' })
  const el = content()!
  setSelectionOffsets(el, 0, 5)
  ;(root.querySelector('[data-item="bold"]') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 600))
  assert.equal(b.store.get('wf-editor-draft:doc-2'), '<p><b>hello</b></p>', '格式 commit 保存草稿')
  root.remove()
})

test('首帧恢复：value 空 + 存在草稿 → 恢复草稿内容', async () => {
  const b = fakeBrowser()
  b.store.set('wf-editor-draft:doc-3', '<p>草稿内容</p>')
  const ctx = makeCtxWithBrowser(b)
  const calls: string[] = []
  const { root, content } = await mountWith(ctx, { value: '', onChange: (v: string) => calls.push(v), draftKey: 'doc-3' })
  const el = content()!
  assert.equal(el.textContent, '草稿内容', '草稿恢复')
  assert.ok(calls.some((c) => c.includes('草稿内容')), 'onChange 通知草稿内容')
  root.remove()
})

test('首帧不恢复：value 非空时以受控值为准', async () => {
  const b = fakeBrowser()
  b.store.set('wf-editor-draft:doc-4', '<p>草稿</p>')
  const ctx = makeCtxWithBrowser(b)
  const { root, content } = await mountWith(ctx, { value: '<p>受控值</p>', onChange: () => {}, draftKey: 'doc-4' })
  assert.equal(content()!.textContent, '受控值', '受控值优先（草稿不覆盖）')
  root.remove()
})

test('无 browser 时静默跳过（SSR/无环境安全）', async () => {
  const ctx: any = { ui: { render: () => {}, usePopup: () => ({ portal: () => null, setOpen: () => {}, refresh: () => {}, open: false, wrapProps: {} }) } }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = createRoot(h(Editor, { value: '<p>hello</p>', onChange: () => {}, draftKey: 'doc-5' } as any), root, { ctx })
  await handle.ready
  await new Promise((r) => setTimeout(r, 30))
  const el = root.querySelector('.wf-editor-content') as HTMLElement
  assert.equal(el.textContent, 'hello', '无 browser 正常渲染（存储 no-op）')
  el.innerHTML = '<p>hello x</p>'
  el.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 600))
  assert.equal(el.textContent, 'hello x', '输入正常（无 browser 不抛）')
  root.remove()
})
