/**
 * 测试对话区（AgentDetail 拆分子组件）
 */
import type { Component } from 'weifuwu/ui-dom'
import { Button, Card, Icon, Input } from 'weifuwu/components'
import { errMsg } from '../../components/ui'
import { inputValue } from '../../lib/types'

export const PreviewSection: Component<{ agentId: string }> = async (_init, ctx) => {
  let previewQuery = ''
  let previewText = ''
  let previewing = false
  const rerender = () => ctx.ui.render()
  const agentId = _init.agentId

  async function previewSend() {
    if (!previewQuery.trim()) return
    previewing = true; previewText = ''; rerender()
    try {
      const token = ctx.browser?.storageGet?.('agent_platform_token') ?? ''
      const res = await fetch(`/api/agents/${agentId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: previewQuery }),
      })
      const reader = res.body?.getReader()
      const dec = new TextDecoder()
      if (reader) {
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value)
          for (const line of buf.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const d = JSON.parse(line.slice(6))
                if (d.text) { previewText += d.text; rerender() }
                if (d.content) { previewText = d.content; rerender() }
              } catch { /* 非 JSON 行跳过 */ }
            }
          }
        }
      }
    } catch (e) { previewText = '预览失败：' + errMsg(e, '') }
    previewing = false; rerender()
  }

  return async () => (
    <Card id="sec-preview">
      <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm"><Icon name="message" size={14} /> 测试对话</div>
      <div class="wf-row wf-gap-xs">
        <div class="wf-fill">
          <Input placeholder="输入消息测试提示词（如：介绍一下你自己）" value={previewQuery}
            onInput={(e: Event) => { previewQuery = inputValue(e); rerender() }} />
        </div>
        <Button size="sm" variant="primary" disabled={previewing} onClick={previewSend}>
          {previewing ? '回复中...' : '发送'}
        </Button>
      </div>
      {previewText && <pre class="wf-bg-secondary wf-rounded wf-p-sm wf-mt-sm wf-text-sm" style="white-space: pre-wrap; line-height: 1.6">{previewText}</pre>}
    </Card>
  )
}
