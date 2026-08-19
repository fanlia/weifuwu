import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AvatarGroup } from './AvatarGroup.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'


const items = [
  { name: '张三' },
  { name: '李四' },
  { name: '王五' },
  { name: '赵六' },
]

describe('AvatarGroup', () => {
  it('渲染全部头像', async () => {
    const vnode = await renderVNode(AvatarGroup, { items }, createTestCtx())!
    assert.match(vnode.props.class, /wf-avatar-group/)
    assert.equal(vnode.props.children.length, 4)
  })

  it('max 截断 + 溢出 +N', async () => {
    const vnode = await renderVNode(AvatarGroup, { items, max: 3 }, createTestCtx())!
    assert.equal(vnode.props.children.length, 4) // 3 头像 + 1 计数
    const count = vnode.props.children[3]
    assert.match(count.props.class, /wf-avatar-group-more/)
    assert.match(count.props.children, /\+1/)
  })

  it('size 透传', async () => {
    const vnode = await renderVNode(AvatarGroup, { items: [{ name: 'A' }], size: 'lg' }, createTestCtx())!
    const avatar = vnode.props.children[0].props.children // span > Avatar 组件 VNode
    assert.equal(avatar.props.size, 'lg')
    assert.equal(avatar.props.name, 'A')
  })

  it('空 items 返回 null', async () => {
    assert.equal(await renderVNode(AvatarGroup, { items: [] }, createTestCtx()), null)
  })
})
