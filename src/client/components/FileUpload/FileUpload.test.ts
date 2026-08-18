import { describe, it } from 'node:test'
import assert from 'node:assert'
import { FileUpload } from './FileUpload.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    useDragDrop: () => ({ dropProps: {} }),
  } } as any
}

describe('FileUpload', () => {
  it('renders drop zone with default text', async () => {
    const vnode = await renderVNode(FileUpload, {}, createTestCtx())!
    const dropZone = vnode.props.children[1]
    const text = dropZone.props.children.props.children[1].props.children
    assert.match(text, /上传/)
  })

  it('renders custom children instead of default', async () => {
    const vnode = await renderVNode(FileUpload, { children: '自定义区域' }, createTestCtx())!
    const dropZone = vnode.props.children[1]
    assert.equal(dropZone.props.children, '自定义区域')
  })

  it('renders disabled class when disabled', async () => {
    const vnode = await renderVNode(FileUpload, { disabled: true }, createTestCtx())!
    const dropZone = vnode.props.children[1]
    assert.match(dropZone.props.class, /wf-upload-zone--disabled/)
  })

  it('renders error class and message when error', async () => {
    const vnode = await renderVNode(FileUpload, { error: '文件太大' }, createTestCtx())!
    const children = vnode.props.children
    assert.match(children[1].props.class, /wf-upload-zone--err/)
    const errEl = children[children.length - 1]
    assert.equal(errEl.props.class, 'wf-upload-err')
    assert.equal(errEl.props.children, '文件太大')
  })

  it('renders file list when value provided', async () => {
    const file = new File(['test'], 'readme.txt', { type: 'text/plain' })
    const vnode = await renderVNode(FileUpload, { value: [file] }, createTestCtx())!
    const list = vnode.props.children[2]
    assert.equal(list.type, 'ul')
    assert.match(list.props.class, /wf-upload-list/)
  })

  it('renders hint text when provided', async () => {
    const vnode = await renderVNode(FileUpload, { hint: '支持图片格式' }, createTestCtx())!
    const children = vnode.props.children
    const hint = children[children.length - 1]
    assert.equal(hint.props.class, 'wf-upload-hint')
    assert.equal(hint.props.children, '支持图片格式')
  })

  it('renders accept and maxSize hints', async () => {
    const vnode = await renderVNode(FileUpload, { accept: 'image/*', maxSize: 1024 * 1024 }, createTestCtx())!
    const dropZone = vnode.props.children[1]
    const hints = dropZone.props.children.props.children.filter(Boolean)
    const acceptHint = hints.find((h: any) => h?.props?.children?.includes('image/*'))
    const sizeHint = hints.find((h: any) => h?.props?.children?.includes('1.0MB'))
    assert.ok(acceptHint)
    assert.ok(sizeHint)
  })
})

// ── 第六批增强：缩略图/进度/受控纪律（TDD 红→绿） ──────────────

function collectV(v: any, pred: (n: any) => boolean): any {
  if (!v || typeof v !== 'object') return null
  if (pred(v)) return v
  const ch = v.props?.children
  if (ch == null) return null
  const arr = Array.isArray(ch) ? ch : [ch]
  for (const c of arr) {
    const r = collectV(c, pred)
    if (r) return r
  }
  return null
}

describe('FileUpload 增强', () => {
  it('图片文件渲染缩略图（img 预览）', async () => {
    const img = new File(['x'], 'photo.png', { type: 'image/png' })
    const txt = new File(['y'], 'doc.txt', { type: 'text/plain' })
    const vnode = await renderVNode(FileUpload, { value: [img, txt] }, createTestCtx())!
    const imgEl = collectV(vnode, (n) => n.props?.class?.includes('wf-upload-thumb'))
    assert.ok(imgEl, '图片文件应有缩略图 img')
    assert.equal(imgEl.type, 'img')
    assert.ok(imgEl.props.src, '缩略图应有 src')
    // 文本文件无缩略图
    const items = vnode.props.children[2].props.children
    const thumbCount = collectV(vnode, (n) => n.props?.class?.includes('wf-upload-thumb'))
    assert.equal(items.filter((c: any) => c.props?.class === 'wf-upload-item').length, 2)
  })

  it('受控无 onChange 时 warn（一次性）', async () => {
    const warns: string[] = []
    const ow = console.warn
    console.warn = (m: string) => { warns.push(m) }
    try {
      const file = new File(['t'], 'a.txt', { type: 'text/plain' })
      await renderVNode(FileUpload, { value: [file] }, createTestCtx())
      await renderVNode(FileUpload, { value: [file] }, createTestCtx())
      assert.ok(warns.length >= 1, '应 warn 受控无回调')
      assert.match(warns[0], /onChange/)
    } finally { console.warn = ow }
  })

  it('受控配 onChange 不 warn', async () => {
    const warns: string[] = []
    const ow = console.warn
    console.warn = (m: string) => { warns.push(m) }
    try {
      const file = new File(['t'], 'a.txt', { type: 'text/plain' })
      await renderVNode(FileUpload, { value: [file], onChange: () => {} }, createTestCtx())
      assert.equal(warns.filter(w => w.includes('onChange')).length, 0)
    } finally { console.warn = ow }
  })

  it('uploading/progress 渲染进度条', async () => {
    const vnode = await renderVNode(FileUpload, { uploading: true, progress: 42 }, createTestCtx())!
    const bar = collectV(vnode, (n) => n.props?.class?.includes('wf-upload-progress'))
    assert.ok(bar, '上传中应有进度条')
    const fill = bar.props.children
    assert.match(fill.props.style.width, /42%/)
  })

  it('删除项 → onChange 回传过滤列表', async () => {
    let got: File[] | null = null
    const f1 = new File(['a'], 'a.txt', { type: 'text/plain' })
    const f2 = new File(['b'], 'b.txt', { type: 'text/plain' })
    const vnode = await renderVNode(FileUpload, { value: [f1, f2], onChange: (fs: File[]) => { got = fs } }, createTestCtx())!
    const items = vnode.props.children[2].props.children.filter((c: any) => c.props?.class === 'wf-upload-item')
    items[0].props.children.find((c: any) => c.props?.class?.includes('remove')).props.onClick()
    assert.equal(got?.length, 1)
    assert.equal(got![0].name, 'b.txt')
  })
})
