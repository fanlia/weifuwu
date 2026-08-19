/**
 * 知识库文档区（AgentDetail 拆分子组件——KB 类型：上传/批量/检索/删除/分块配置）
 */
import type { Component } from 'weifuwu/vdom'
import { Button, Card, Field, Icon, Input, Textarea } from 'weifuwu/components'
import { errMsg } from '../../components/ui'
import { inputValue } from '../../lib/types'
import type { Agent, KbChunk, KbDocument } from '../../lib/types'

export const KnowledgeSection: Component<{ agentId: string; agent: Agent }> = async (_init, ctx) => {
  let docs: KbDocument[] = []
  let docsLoading = true
  let newDocFilename = ''
  let newDocContent = ''
  let uploading = false
  let expandedDoc: string | null = null
  let docChunks: KbChunk[] = []
  let loadingChunks = false
  let kbQuery = ''
  let kbResults: Array<{ filename: string; content: string; similarity: number }> = []
  let kbSearching = false
  let reindexing = false
  let kbChunkSize = String(_init.agent?.chunk_size ?? 500)
  let kbChunkOverlap = String(_init.agent?.chunk_overlap ?? 50)
  const rerender = () => ctx.render()
  const agentId = _init.agentId

  async function reloadDocs() {
    const d = await ctx.api!.get<{ documents: KbDocument[] }>(`/api/agents/${agentId}/knowledge`).catch(() => null)
    docs = d?.documents ?? []
    docsLoading = false
    rerender()
  }
  await reloadDocs()

  async function kbSearch() {
    if (!kbQuery.trim()) return
    kbSearching = true; rerender()
    try {
      const d = await ctx.api!.post(`/api/agents/${agentId}/knowledge/search`, { query: kbQuery, top_k: 3 })
      kbResults = d.results ?? []
    } catch (e) { kbResults = []; ctx.toast!('检索失败：' + errMsg(e, ''), 'error') }
    kbSearching = false; rerender()
  }

  async function reindexDocs() {
    reindexing = true; rerender()
    try {
      const d = await ctx.api!.post(`/api/agents/${agentId}/knowledge/reindex`)
      ctx.toast!(`已重新向量化 ${(d as any)?.reindexed ?? 0} 个文档`, 'success')
      await reloadDocs()
    } catch (e) { ctx.toast!('重新向量化失败：' + errMsg(e, ''), 'error') }
    reindexing = false; rerender()
  }

  async function saveChunkConfig() {
    try {
      await ctx.api!.put(`/api/agents/${agentId}`, {
        chunk_size: parseInt(kbChunkSize) || 500,
        chunk_overlap: parseInt(kbChunkOverlap) || 50,
      })
      ctx.toast!('分块配置已保存（新上传文档生效）', 'success')
    } catch (e) { ctx.toast!('保存失败：' + errMsg(e, ''), 'error') }
  }

  async function toggleExpandDoc(docId: string) {
    if (expandedDoc === docId) { expandedDoc = null; docChunks = []; rerender(); return }
    expandedDoc = docId; loadingChunks = true
    rerender()
    try {
      const d = await ctx.api!.get(`/api/knowledge/${docId}?chunks=true`).catch(() => null)
      if (d) docChunks = d.chunks ?? []
    } catch {}
    loadingChunks = false
    rerender()
  }

  async function uploadDoc(e: Event) {
    e.preventDefault()
    if (!newDocFilename.trim() || !newDocContent.trim()) return
    uploading = true
    rerender()
    try {
      await ctx.api!.post(`/api/agents/${agentId}/knowledge`, { filename: newDocFilename.trim(), content: newDocContent })
      newDocFilename = ''; newDocContent = ''
      await reloadDocs()
    } catch {}
    uploading = false
    rerender()
  }

  /** 批量上传：文件选择（multiple）→ 逐个读内容 → 上传 */
  async function uploadFiles(e: Event) {
    const input = e.target as HTMLInputElement
    const files = input.files ? Array.from(input.files) : []
    if (files.length === 0) return
    uploading = true
    rerender()
    let ok = 0
    for (const f of files) {
      try {
        const text = await f.text()
        await ctx.api!.post(`/api/agents/${agentId}/knowledge`, { filename: f.name, content: text })
        ok++
      } catch { /* 单个失败跳过 */ }
    }
    input.value = ''
    uploading = false
    await reloadDocs()
    ctx.toast?.(`上传完成：${ok}/${files.length} 个文档`, ok === files.length ? 'success' : 'warning')
  }

  async function deleteDoc(docId: string) {
    await ctx.api!.delete(`/api/knowledge/${docId}`)
    await reloadDocs()
  }

  return async () => (
    <Card id="sec-knowledge">
      <div class="wf-split wf-mb-md">
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">📚 知识库文档</div>
        <span class="wf-text-xs wf-text-tertiary">{docs.length} 个文档</span>
        <Button size="sm" variant="ghost" disabled={reindexing} onClick={reindexDocs}>
          {reindexing ? '向量化中...' : '重新向量化'}
        </Button>
      </div>

      <div class="wf-row wf-gap-lg wf-mb-md">
        <div class="wf-fill">
          <Field label="分块大小">
            <Input type="number" min="100" max="2000" step="50" value={kbChunkSize}
              onInput={(e: Event) => { kbChunkSize = inputValue(e); rerender() }} />
          </Field>
        </div>
        <div class="wf-fill">
          <Field label="分块重叠" hint="保存后新上传文档按新配置分块">
            <Input type="number" min="0" max="400" step="10" value={kbChunkOverlap}
              onInput={(e: Event) => { kbChunkOverlap = inputValue(e); rerender() }} />
          </Field>
        </div>
        <div class="wf-self-end">
          <Button size="sm" onClick={saveChunkConfig}>保存分块配置</Button>
        </div>
      </div>

      <Card outlined>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm">🔍 检索测试</div>
        <div class="wf-row wf-gap-xs">
          <div class="wf-fill">
            <Input placeholder="输入问题测试检索（如：退款政策是什么？）" value={kbQuery}
              onInput={(e: Event) => { kbQuery = inputValue(e); rerender() }} />
          </div>
          <Button size="sm" variant="primary" disabled={kbSearching} onClick={kbSearch}>
            {kbSearching ? '检索中...' : '检索'}
          </Button>
        </div>
        {kbResults.length > 0 && (
          <div class="wf-stack wf-gap-sm wf-mt-sm">
            {kbResults.map((r: { filename: string; content: string; similarity: number }, i: number) => (
              <div key={i} class="wf-bg-secondary wf-p-sm wf-rounded-sm wf-text-xs" style="line-height: 1.6">
                <span class="wf-text-xs wf-text-medium">{r.filename} · 相似度 {(r.similarity ?? 0).toFixed(3)}</span><br />
                {(r.content ?? '').slice(0, 200)}
              </div>
            ))}
          </div>
        )}
      </Card>

      {docs.length > 0 && (
        <div class="wf-stack wf-gap-none wf-mb-md">
          {docs.map((d: KbDocument) => (
            <div key={d.id}>
              <div class="wf-row wf-gap-sm wf-py-sm wf-border-b" style="cursor: pointer" onClick={() => toggleExpandDoc(d.id)}>
                <span>{expandedDoc === d.id ? <Icon name="folder" size={14} /> : <Icon name="file" size={14} />}</span>
                <span class="wf-fill wf-text-sm wf-truncate">{d.filename}</span>
                <span class="wf-text-xs wf-text-tertiary">{d.chunk_count ?? 0} 块</span>
                <Button size="sm" variant="danger" onClick={(e: Event) => { e.stopPropagation(); deleteDoc(d.id) }}>删除</Button>
              </div>
              {expandedDoc === d.id && (
                <div class="wf-bg-secondary wf-p-md wf-text-sm wf-stack wf-gap-sm">
                  {loadingChunks && <div class="wf-text-xs wf-text-tertiary">加载中...</div>}
                  {!loadingChunks && docChunks.length === 0 && <div class="wf-text-xs wf-text-tertiary">无分块数据</div>}
                  {docChunks.map((ch: KbChunk, i: number) => (
                    <div key={i} class="wf-surface wf-p-sm wf-rounded-sm wf-text-xs" style="line-height: 1.6">
                      <span class="wf-text-xs wf-text-tertiary">块 #{(ch.chunk_index ?? 0) + 1}</span><br />
                      {(ch.content ?? '').slice(0, 300)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form class="wf-stack wf-gap-md" onSubmit={uploadDoc}>
        <Field label="批量上传" hint="支持 .txt / .md / .csv / .json——一次选择多个文件">
          <input type="file" multiple accept=".txt,.md,.csv,.json,.jsonl,.log"
            onChange={uploadFiles} disabled={uploading} class="wf-input" />
        </Field>
        <div class="wf-text-xs wf-text-tertiary wf-border-t wf-pt-sm">或手动粘贴：</div>
        <Field label="文件名">
          <Input type="text" placeholder="如：产品手册.txt" value={newDocFilename}
            onInput={(e: Event) => { newDocFilename = inputValue(e); rerender() }} />
        </Field>
        <Field label="文档内容">
          <Textarea rows={5} placeholder="粘贴文档内容..." value={newDocContent}
            onInput={(e: Event) => { newDocContent = inputValue(e); rerender() }} />
        </Field>
        <div class="wf-right">
          <Button type="submit" variant="primary" disabled={uploading}>
            {uploading ? '上传中...' : '上传文档'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
