import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Avatar } from './Avatar.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */



describe('Avatar', () => {
  it('renders initial when no src', async () => {
    const vnode = await renderVNode(Avatar, { name: '张三' }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.equal(vnode.props.children, '张')
  })

  it('renders fallback for empty name', async () => {
    const vnode = await renderVNode(Avatar, {}, createTestCtx())!
    assert.equal(vnode.props.children, '?')
  })

  it('renders img when src provided', async () => {
    const vnode = await renderVNode(Avatar, { name: '张三', src: '/photo.jpg' }, createTestCtx())!
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, '/photo.jpg')
    assert.equal(vnode.props.alt, '张三')
  })

  it('applies size classes', async () => {
    const sm = await renderVNode(Avatar, { name: 'A', size: 'sm' }, createTestCtx())!
    const lg = await renderVNode(Avatar, { name: 'B', size: 'lg' }, createTestCtx())!
    assert.match(sm.props.class, /wf-avatar--sm/)
    assert.match(lg.props.class, /wf-avatar--lg/)
  })

  it('color prop overrides hashed background', async () => {
    const vnode = await renderVNode(Avatar, { name: '张三', color: '#4f6ef7' }, createTestCtx())!
    assert.equal(vnode.props.style.background, '#4f6ef7')
  })
})

  it('renders img with src', async () => {
    const vnode = await renderVNode(Avatar, { name: '张三', src: '/photo.jpg' }, createTestCtx())!
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, '/photo.jpg')
  })

  it('renders uppercase initial', async () => {
    const vnode = await renderVNode(Avatar, { name: 'alice' }, createTestCtx())!
    assert.equal(vnode.props.children, 'A')
  })

  it('emoji name → 完整 emoji 首字符（禁止切出孤立代理项——Chrome AX 树挂死根因）', async () => {
    const vnode = await renderVNode(Avatar, { name: '💬' }, createTestCtx())!
    const initial = String(vnode.props.children)
    // 必须是完整码点（代理对成对出现——无孤立代理项）
    assert.equal(initial.length, 2) // surrogate pair
    assert.equal(initial.codePointAt(0)!.toString(16), '1f4ac')
    assert.equal([...initial].length, 1)
    assert.equal(hasLoneSurrogate(initial), false)
  })

  it('emoji+文本名 → 完整 emoji 首字符', async () => {
    const vnode = await renderVNode(Avatar, { name: '🤖小悟' }, createTestCtx())!
    assert.equal(vnode.props.children, '🤖')
    assert.equal([...String(vnode.props.children)].length, 1)
  })

/** 孤立代理项检测（高代理无低配对 / 低代理独处） */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i)
    if (u >= 0xd800 && u <= 0xdbff) {
      if (i + 1 >= s.length) return true
      const next = s.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      i++
    } else if (u >= 0xdc00 && u <= 0xdfff) {
      return true
    }
  }
  return false
}
