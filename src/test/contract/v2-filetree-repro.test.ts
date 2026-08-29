import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { renderV2 } from '../../client/vdom/core/v2/render.ts'
import { diffV2 } from '../../client/vdom/core/v2/diff.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import { FileTree } from '../../client/components/FileTree/FileTree.ts'

const entries = [
  { name: 'README.md', type: 'file' as const, size: 4096 },
  { name: 'docs', type: 'dir' as const },
]
const mk = (open: { path: string; content: string } | null, edit: string) =>
  h(FileTree, {
    path: '/', entries, openFile: open, editValue: edit, saving: false,
    onOpenFile: () => {}, onOpenDir: () => {}, onSave: () => {}, onBack: () => {},
    onUpload: () => {}, onRefresh: () => {},
  })

function collect(o: any): Promise<any[]> {
  return new Promise((res, rej) => {
    const out: any[] = []
    o.subscribe({ next: (c: any) => out.push(c), error: rej, complete: () => res(out) })
  })
}

test('FileTree 列表态 → 编辑态 diff（契约复现——2027-08 Icon name undefined）', async () => {
  const segs: any = new Map()
  const reg = createComponentRegistry()
  const ctx: any = { render: async () => {}, browser: null }
  const oldT = mk(null, '')
  await collect(renderV2(oldT, ctx, reg, segs, () => {}))
  try {
    const cmds = await collect(diffV2(oldT, mk({ path: 'README.md', content: 'abc' }, 'abc'), ctx, segs, reg, () => {}))
    assert.ok(cmds.length > 0, 'diff 有命令')
    console.log('cmds:', cmds.length)
  } catch (e) {
    console.log('DIFF ERR:', (e as Error).message)
    throw e
  }
})
