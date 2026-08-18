import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TagsInput } from './TagsInput.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

function createTestCtx(): WfuiContext {
  const uncontrolled = new Map<string, any>()
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    useControlled: (opts: any) => {
      const controlled = opts.value !== undefined
      const key = opts.name ?? 'default'
      if (!uncontrolled.has(key)) uncontrolled.set(key, opts.value)
      const setValue = (v: any) => {
        if (controlled) opts.onChange?.(v)
        else uncontrolled.set(key, v)
      }
      return { value: controlled ? opts.value : uncontrolled.get(key), setValue, controlled }
    },
  } } as any
}

/** 深度查找满足 class 的节点 */
function find(v: any, cls: string): any {
  if (v?.props?.class === cls) return v
  if (Array.isArray(v?.props?.children)) {
    for (const c of v.props.children) {
      const r = find(c, cls)
      if (r) return r
    }
  }
  return null
}
function findAll(v: any, cls: string): any[] {
  const out: any[] = []
  const walk = (n: any) => {
    if (n?.props?.class === cls) out.push(n)
    if (Array.isArray(n?.props?.children)) n.props.children.forEach(walk)
  }
  walk(v)
  return out
}
const findInput = (v: any) => find(v, 'wf-tags-input')
const findTags = (v: any) => findAll(v, 'wf-tags-tag')
const findRemove = (v: any, tag: string) => {
  const t = findTags(v).find((x: any) => x.props.children[0].props.children === tag)
  return t?.props.children.find((c: any) => c?.props?.['aria-label'] === `移除 ${tag}`)
}

describe('TagsInput', () => {
  it('渲染已有标签 + 输入框', async () => {
    const vnode = await renderVNode(TagsInput, { value: ['ts', 'js'] }, createTestCtx())!
    assert.equal(findTags(vnode).length, 2)
    assert.ok(findInput(vnode))
  })

  it('Enter 添加标签', async () => {
    let tags: string[] = []
    const vnode = await renderVNode(TagsInput, { value: [], onChange: (t: string[]) => { tags = t } }, createTestCtx())!
    const input = findInput(vnode)
    input.props.onKeyDown({ key: 'Enter', target: { value: 'react' }, preventDefault: () => {} })
    assert.deepEqual(tags, ['react'])
  })

  it('逗号添加标签', async () => {
    let tags: string[] = []
    const vnode = await renderVNode(TagsInput, { value: [], onChange: (t: string[]) => { tags = t } }, createTestCtx())!
    const input = findInput(vnode)
    input.props.onKeyDown({ key: ',', target: { value: 'vue,' }, preventDefault: () => {} })
    assert.deepEqual(tags, ['vue'])
  })

  it('去重（默认）', async () => {
    let tags: string[] = ['react'] // 模拟父组件状态
    const vnode = await renderVNode(TagsInput, { value: ['react'], onChange: (t: string[]) => { tags = t } }, createTestCtx())!
    const input = findInput(vnode)
    input.props.onKeyDown({ key: 'Enter', target: { value: 'react' }, preventDefault: () => {} })
    assert.deepEqual(tags, ['react'], '重复标签不触发 onChange')
  })

  it('空输入 Enter 不添加', async () => {
    let tags: string[] = ['x']
    const vnode = await renderVNode(TagsInput, { value: ['x'], onChange: (t: string[]) => { tags = t } }, createTestCtx())!
    const input = findInput(vnode)
    input.props.onKeyDown({ key: 'Enter', target: { value: '' }, preventDefault: () => {} })
    assert.deepEqual(tags, ['x'])
  })

  it('maxTags 限制', async () => {
    let tags: string[] = ['a', 'b']
    const vnode = await renderVNode(TagsInput, { value: ['a', 'b'], maxTags: 2, onChange: (t: string[]) => { tags = t } }, createTestCtx())!
    const input = findInput(vnode)
    input.props.onKeyDown({ key: 'Enter', target: { value: 'c' }, preventDefault: () => {} })
    assert.deepEqual(tags, ['a', 'b'])
  })

  it('Backspace 空输入删除最后一个', async () => {
    let tags: string[] = ['a', 'b']
    const vnode = await renderVNode(TagsInput, { value: ['a', 'b'], onChange: (t: string[]) => { tags = t } }, createTestCtx())!
    const input = findInput(vnode)
    input.props.onKeyDown({ key: 'Backspace', target: { value: '' }, preventDefault: () => {} })
    assert.deepEqual(tags, ['a'])
  })

  it('中文输入法 composition 期间 Enter 不添加', async () => {
    let tags: string[] = []
    const vnode = await renderVNode(TagsInput, { value: [], onChange: (t: string[]) => { tags = t } }, createTestCtx())!
    const input = findInput(vnode)
    input.props.onCompositionStart?.()
    input.props.onKeyDown({ key: 'Enter', target: { value: '你' }, preventDefault: () => {} })
    assert.deepEqual(tags, [], 'composition 中 Enter 不添加')
    input.props.onCompositionEnd?.()
    input.props.onKeyDown({ key: 'Enter', target: { value: '你' }, preventDefault: () => {} })
    assert.deepEqual(tags, ['你'])
  })

  it('删除按钮移除标签', async () => {
    let tags: string[] = ['a', 'b']
    const vnode = await renderVNode(TagsInput, { value: ['a', 'b'], onChange: (t: string[]) => { tags = t } }, createTestCtx())!
    findRemove(vnode, 'a').props.onClick()
    assert.deepEqual(tags, ['b'])
  })
})
