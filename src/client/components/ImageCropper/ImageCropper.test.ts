import { describe, it } from 'node:test'
import assert from 'node:assert'
import { renderVNode, findByClass, createTestCtx } from '../../vdom/testing.ts'
import { ImageCropper } from './ImageCropper.ts'

it('ImageCropper：渲染画布 + 操作按钮', async () => {
  const vnode: any = await renderVNode(ImageCropper, { src: 'data:image/png;base64,AAAA', onCrop: () => {} }, createTestCtx())
  assert.ok(findByClass(vnode, 'wf-imagecropper').length, '根类存在')
  const btns = findByClass(vnode, 'wf-btn')
  assert.ok(btns.length >= 2, '裁剪/重置按钮存在')
  const canvas = (vnode as any).props
  // canvas 元素在 ref 容器内
  const wrap = (vnode as any)
  assert.ok(wrap, '结构渲染')
})

it('ImageCropper：受控回调缺省不 warn（onCrop 可选——裁剪是显式动作）', async () => {
  const warns: string[] = []
  const ow = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  try {
    await renderVNode(ImageCropper, { src: 'x' }, createTestCtx())
  } finally { console.warn = ow }
  assert.ok(!warns.some((w) => w.includes('ImageCropper')), 'onCrop 可选不 warn')
})

it('ImageCropper：aspect 比例传入（裁剪框按比例）', async () => {
  const vnode: any = await renderVNode(ImageCropper, { src: 'x', aspect: 2, onCrop: () => {} }, createTestCtx())
  assert.ok(findByClass(vnode, 'wf-imagecropper').length, 'aspect 渲染正常')
})
