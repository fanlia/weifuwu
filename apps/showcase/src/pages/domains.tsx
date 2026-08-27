/**
 * 通用域页面工厂——layout / patterns / apps / backend / capabilities / guides
 * 每个域：索引页（index.json 卡片网格）+ 详情页（content/.md 渲染——与 LLM 同源）
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { Markdown, Tag } from 'weifuwu/components'
import { fetchIndex, fetchMd, type IndexJson } from '../data.ts'
import { TodoEmbed } from './todo-embed.tsx'
import { PatternLive } from './patterns-live.tsx'
import { MultiEmbed } from './multi-embed.tsx'

interface DomainCfg {
  domain: string
  title: string
  groupKey?: keyof IndexJson
  groupTitle?: (g: string) => string
  itemTitle: (idx: IndexJson, id: string) => string
  itemDesc: (idx: IndexJson, id: string) => string
  itemTags?: (idx: IndexJson, id: string) => string[]
  /** 详情页额外区块（如 apps 域活体嵌入） */
  extraRender?: (id: string) => any
  /** 详情页源码链接（如 patterns 的 examples 文件） */
  sourceLink?: (idx: IndexJson, id: string) => string | null
}

function makeDomainPages(cfg: DomainCfg) {
  const IndexPage: Component = async (_init: any, _ctx: any) => {
    const idx = await fetchIndex()
    const list = (idx as any)[cfg.groupKey ?? cfg.domain] as any[]
    const groups = new Map<string, any[]>()
    for (const it of list) {
      const g = (it.group ?? '') as string
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(it)
    }
    return async (_p: any) => (
      <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:16px;padding:24px 16px">
        <h1 class="wf-font-2xl wf-margin-none">{cfg.title} · {list.length}</h1>
        {[...groups.entries()].map(([g, items]) => (
          <div class="wf-stack wf-gap-sm" key={g}>
            {g && <b class="wf-font-base wf-border-bottom wf-padding-bottom-xs">{cfg.groupTitle ? cfg.groupTitle(g) : g}</b>}
            <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,300px),1fr));--wf-gap:12px">
              {items.map((it) => (
                <a key={it.id} href={`/${cfg.domain}/${it.id}`} class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
                  <b class="wf-font-base">{cfg.itemTitle(idx, it.id)}</b>
                  <span class="wf-font-xs wf-text-secondary">{cfg.itemDesc(idx, it.id)}</span>
                  {cfg.itemTags && cfg.itemTags(idx, it.id).length > 0 && (
                    <span class="wf-cluster wf-gap-xs">{cfg.itemTags(idx, it.id).map((t) => <Tag key={t}>{t}</Tag>)}</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const DetailPage: Component = async (initProps: any, _ctx: any) => {
    let md = ''
    let title = initProps.id
    let idx: IndexJson | null = null
    try {
      idx = await fetchIndex()
      title = cfg.itemTitle(idx, initProps.id)
      md = await fetchMd(cfg.domain, initProps.id)
    } catch (e) {
      md = `# ${initProps.id}\n\n> 文档加载失败：${(e as Error).message}`
    }
    const sourceHref = idx && cfg.sourceLink ? cfg.sourceLink(idx, initProps.id) : null
    return async (_p: any) => (
      <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:16px;padding:24px 16px">
        <div class="wf-font-xs wf-text-secondary">
          <a href={`/${cfg.domain}`} style="color:inherit">{cfg.title}</a> › {title}
        </div>
        <div class="wf-row wf-justify-between">
          <h1 class="wf-font-2xl wf-margin-none">{title}</h1>
          <div class="wf-row wf-gap-xs">
            {sourceHref && (
              <a class="wf-btn wf-btn--sm" href={sourceHref} target="_blank">查看源码</a>
            )}
            <a class="wf-btn wf-btn--sm" href={`/content/${cfg.domain}/${initProps.id}.md`} target="_blank">原始 .md（LLM）</a>
          </div>
        </div>
        {cfg.extraRender?.(initProps.id)}
        <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md">
          <Markdown content={md} />
        </div>
      </div>
    )
  }
  return { IndexPage, DetailPage }
}

// ── layout ──
export const { IndexPage: LayoutIndex, DetailPage: LayoutPage } = makeDomainPages({
  domain: 'layout', title: '布局原语', groupKey: 'primitives',
  itemTitle: (_idx, id) => { const m = { grid: '网格', stack: '纵向堆叠', row: '横向行', center: '居中', fill: '填满', container: '页面容器', cluster: '自动换行簇', split: '分栏', layer: '层叠', 'app-shell': '应用外壳', hidden: '显隐与显示类型', position: '定位', scroll: '滚动与裁剪', 'safe-area': '安全区', anchor: '锚点定位', align: '对齐', spacing: '间距工具', surface: '表面工具', border: '边框工具', text: '文本工具' } as Record<string, string>; return m[id] ?? id },
  itemDesc: (idx, id) => { const p = (idx.primitives as any[]).find((x) => x.id === id); return p?.desc ?? '' },
  itemTags: (idx, id) => { const p = (idx.primitives as any[]).find((x) => x.id === id); return p ? [p.kind === 'utility' ? '工具类' : '原语'] : [] },
})
