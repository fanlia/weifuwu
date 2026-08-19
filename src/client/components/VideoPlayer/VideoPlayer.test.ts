import { describe, it } from 'node:test'
import assert from 'node:assert'
import { renderVNode, findByClass, createTestCtx } from '../../vdom/testing.ts'
import { VideoPlayer } from './VideoPlayer.ts'

it('VideoPlayer：video 元素 + 控制属性渲染', async () => {
  const vnode: any = await renderVNode(VideoPlayer, { src: 'https://example.com/v.mp4', poster: 'p.jpg' }, createTestCtx())
  assert.ok(findByClass(vnode, 'wf-videoplayer').length, '根类存在')
  // video 元素在 children
  const video = (vnode as any)?.props?.children
  assert.equal(video?.props?.src, 'https://example.com/v.mp4', 'src 传递')
  assert.equal(video?.props?.poster, 'p.jpg', 'poster 传递')
  assert.equal(video?.props?.controls, true, '默认 controls')
  assert.ok(typeof (vnode as any)?.props?.ref === 'function', 'ref 存在')
})

it('VideoPlayer：事件回调挂载（onPlay/onEnded）', async () => {
  const vnode: any = await renderVNode(VideoPlayer, { src: 'x', onPlay: () => {}, onEnded: () => {} }, createTestCtx())
  assert.ok(findByClass(vnode, 'wf-videoplayer').length, '事件配置渲染')
})

it('VideoPlayer：aspect 比例容器', async () => {
  const vnode: any = await renderVNode(VideoPlayer, { src: 'x', aspect: 4 / 3 }, createTestCtx())
  const root = findByClass(vnode, 'wf-videoplayer')[0] as any
  assert.match(String(root.props.style?.aspectRatio ?? ''), /1\.333/, 'aspect 传递')
})
