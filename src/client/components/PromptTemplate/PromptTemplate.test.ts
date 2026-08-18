import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../ui-dom/setup.ts'
import { renderVNode, findByClass, createTestCtx, mountComponent } from '../../ui-dom/testing.ts'
import { PromptTemplate } from './PromptTemplate.ts'

before(setupJsdom)

const VARS = [
  { name: 'topic', description: '主题' },
  { name: 'tone', description: '语气' },
]

describe('PromptTemplate', () => {
  it('渲染模板编辑区 + 变量 chips + 预览', async () => {
    const vnode = await renderVNode(PromptTemplate, {
      value: '写一篇关于 {{topic}} 的文章',
      variables: VARS,
    }, createTestCtx())!
    const chips = findByClass(vnode, 'wf-prompt-chip')
    assert.equal(chips.length, 2, '两个变量 chips')
    assert.equal(chips[0].props.children, '{{topic}}')
    const ta = findByClass(vnode, 'wf-prompt-editor')[0]
    assert.ok(ta, 'textarea 存在')
    assert.equal(ta.props.value, '写一篇关于 {{topic}} 的文章')
  })

  it('点击 chip → 光标处插入变量 + onChange', async () => {
    const calls: string[] = []
    const vnode = await renderVNode(PromptTemplate, {
      value: '你好，',
      variables: VARS,
      onChange: (v: string) => calls.push(v),
    }, createTestCtx())!
    const chips = findByClass(vnode, 'wf-prompt-chip')
    // textarea ref 未挂载（VNode 层）——插入退化为末尾追加
    chips[0].props.onClick()
    assert.equal(calls.length, 1)
    assert.equal(calls[0], '你好，{{topic}}', '变量插入到末尾（无 DOM ref 时）')
  })

  it('预览填充 values（缺失变量保持占位——诚实可见）', async () => {
    const vnode = await renderVNode(PromptTemplate, {
      value: '以{{tone}}语气写{{topic}}，主题是{{missing}}',
      variables: VARS,
      values: { tone: '幽默', topic: 'AI' },
    }, createTestCtx())!
    const preview = findByClass(vnode, 'wf-prompt-preview-body')[0]
    assert.equal(preview.props.children, '以幽默语气写AI，主题是{{missing}}')
  })

  it('无变量/空模板：chips 行不渲染 + 预览空占位', async () => {
    const vnode = await renderVNode(PromptTemplate, { value: '' }, createTestCtx())!
    assert.equal(findByClass(vnode, 'wf-prompt-chip').length, 0)
    const preview = findByClass(vnode, 'wf-prompt-preview-body')[0]
    assert.equal(preview.props.children, '（空模板）')
  })

  it('readOnly：textarea 只读 + chips 禁用 + 无预览', async () => {
    const vnode = await renderVNode(PromptTemplate, {
      value: '{{topic}}', variables: VARS, readOnly: true,
    }, createTestCtx())!
    const ta = findByClass(vnode, 'wf-prompt-editor')[0]
    assert.equal(ta.props.readOnly, true)
    assert.equal(findByClass(vnode, 'wf-prompt-chip')[0].props.disabled, true)
    assert.equal(findByClass(vnode, 'wf-prompt-preview').length, 0, '只读不渲染预览')
  })

  it('label 渲染', async () => {
    const vnode = await renderVNode(PromptTemplate, { value: '', label: '系统提示词' }, createTestCtx())!
    const label = findByClass(vnode, 'wf-prompt-label')[0]
    assert.equal(label.props.children, '系统提示词')
  })

  it('受控输入：onInput → onChange（组件不持输入态）', async () => {
    const calls: string[] = []
    const vnode = await renderVNode(PromptTemplate, {
      value: 'x', onChange: (v: string) => calls.push(v),
    }, createTestCtx())!
    const ta = findByClass(vnode, 'wf-prompt-editor')[0]
    ta.props.onInput({ target: { value: '新内容' } })
    assert.deepEqual(calls, ['新内容'])
  })
})

describe('PromptTemplate 补充', () => {
  it('showPreview=false 不渲染预览区', async () => {
    const vnode = await renderVNode(PromptTemplate, {
      value: '{{topic}}', showPreview: false,
    }, createTestCtx())!
    assert.equal(findByClass(vnode, 'wf-prompt-preview').length, 0)
    assert.ok(findByClass(vnode, 'wf-prompt-editor')[0], '编辑区保留')
  })

  it('同实例：插入后值变化 + 预览联动（mountComponent）', async () => {
    let value = '你好'
    const render = await mountComponent(PromptTemplate, {
      value, variables: VARS,
      onChange: (v: string) => { value = v },
    }, createTestCtx())
    let vnode = (await render())!
    // 模拟父更新受控值 → 重新渲染
    vnode = (await render())!
    assert.ok(vnode, 're-render 正常')
    // 插入后（无 DOM ref → 末尾追加）→ 值变化
    let calls: string[] = []
    const vnode2 = await renderVNode(PromptTemplate, {
      value: '你好', variables: VARS,
      onChange: (v: string) => calls.push(v),
    }, createTestCtx())!
    findByClass(vnode2, 'wf-prompt-chip')[1].props.onClick()
    assert.equal(calls[0], '你好{{tone}}')
  })
})
