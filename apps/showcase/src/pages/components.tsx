/**
 * 组件域页面——总览（分类网格）/ 分类页（卡片）/ 详情页（活体 demo + 文档）
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { Tag } from 'weifuwu/components'
import { fetchIndex, type IndexJson } from '../data.ts'


const FAMILIES: Record<string, { name: string; path: string; desc: string }> = {
  'file-preview': { name: 'FilePreview 家族', path: '/guides/file-preview-family', desc: 'office 文档域（预览/xlsx/pptx）' },
  'ai-chat': { name: 'AI 会话家族', path: '/guides/ai-chat-family', desc: 'AI 会话场景（对话/工具/审批/模板）' },
}

/** 家族徽标（链接家族页——组件卡片/详情页复用） */
const FamilyTag = (f: string | null | undefined) => {
  const meta = f ? FAMILIES[f] : null
  if (!meta) return null
  return h('a', {
    href: meta.path,
    class: 'wf-tag wf-tag--primary',
    style: 'text-decoration:none',
    title: meta.desc,
  }, meta.name)
}

export const CATEGORIES = [
  ['core', '基础通用'], ['input', '输入选择'], ['form', '表单'],
  ['display', '数据展示'], ['viz', '可视化'], ['feedback', '反馈'],
  ['navigation', '导航'], ['overlay', '弹层'], ['advanced', '数据进阶'],
  ['virtual', '虚拟化'], ['editor', '文件编辑'], ['ai', 'AI 对话'],
] as const

/** 组件总览——全局搜索 + 分类网格（搜索时跨分类即时过滤） */
export const ComponentsIndex: Component = async (_init: any, ctx: any) => {
  const idx = await fetchIndex()
  let q = ''
  return async (_p: any) => {
    const kw = q.trim().toLowerCase()
    // family 维度搜索（07：输入家族名/office/ai-chat 也能找到家族成员）
    const all = idx.components.filter((c) => !kw
      || c.name.toLowerCase().includes(kw)
      || c.desc.toLowerCase().includes(kw)
      || (c.family ?? '').toLowerCase().includes(kw)
      || (c.family ? (FAMILIES[c.family]?.name ?? '').toLowerCase().includes(kw) : false))
    return (
      <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:20px;padding:24px 16px">
        <div class="wf-row wf-justify-between">
          <div class="wf-stack wf-gap-xs">
            <h1 class="wf-font-2xl wf-margin-none">组件 · {idx.counts.components}</h1>
            <p class="wf-text-secondary wf-font-sm wf-margin-none">逐组件文档（API 表 / 纪律 / 关系 / 验证）——每组件一个稳定 URL</p>
          </div>
          <input class="wf-input" style="max-width:260px" placeholder="🔍 搜索组件（名称/功能）…" value={q}
            onInput={(e: any) => { q = (e.target as HTMLInputElement).value; ctx.render() }} />
        </div>
        {kw ? (
          <div class="wf-stack wf-gap-sm">
            <div class="wf-font-xs wf-text-secondary">匹配 {all.length} 个组件</div>
            <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,300px),1fr));--wf-gap:12px">
              {all.map((c) => (
                <a key={c.id} href={`/components/${c.category}/${c.id}`} class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
                  <b class="wf-font-base">{c.name} <span class="wf-font-xs wf-text-tertiary">· {c.category}</span></b>
                  <span class="wf-font-xs wf-text-secondary">{c.desc}</span>
                  <span class="wf-cluster wf-gap-xs">{FamilyTag(c.family)}</span>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,240px),1fr));--wf-gap:12px">
            {CATEGORIES.map(([id, name]) => {
              const list = idx.components.filter((c) => c.category === id)
              if (!list.length) return null
              return (
                <a key={id} href={`/components/${id}`} class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
                  <span class="wf-font-2xl wf-bold wf-text-primary" style="font-family:var(--wf-font-mono)">{list.length}</span>
                  <b>{name}</b>
                  <span class="wf-font-xs wf-text-secondary">{list.slice(0, 4).map((c) => c.name).join(' · ')}…</span>
                </a>
              )
            })}
          </div>
        )}
      </div>
    )
  }
}

/** 分类页——组件卡片网格（搜索过滤） */
export const CategoryPage: Component = async (initProps: any, ctx: any) => {
  let q = ''
  return async (props: any) => {
    const idx = await fetchIndex()
    const cat = props.category ?? initProps.category ?? ''
    const meta = CATEGORIES.find(([id]) => id === cat)
    const list = idx.components
      .filter((c) => c.category === cat)
      .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.desc.toLowerCase().includes(q.toLowerCase()))
    return (
      <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:16px;padding:24px 16px">
        <div class="wf-row wf-justify-between">
          <div class="wf-stack wf-gap-xs">
            <span class="wf-font-xs wf-text-secondary"><a href="/components" style="color:inherit">组件</a> ›</span>
            <h1 class="wf-font-2xl wf-margin-none">{meta?.[1] ?? cat} · {list.length}</h1>
          </div>
          <input
            class="wf-input"
            style="max-width:240px"
            placeholder="过滤组件…"
            value={q}
            onInput={(e: any) => { q = (e.target as HTMLInputElement).value; ctx.render() }}
          />
        </div>
        <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,300px),1fr));--wf-gap:12px">
          {list.map((c) => (
            <a key={c.id} href={`/components/${cat}/${c.id}`} class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
              <b class="wf-font-base">{c.name}</b>
              <span class="wf-font-xs wf-text-secondary">{c.desc}</span>
              <span class="wf-cluster wf-gap-xs">
                {FamilyTag(c.family)}
                {c.usedInPatterns.length > 0 && <Tag>用于 {c.usedInPatterns.length} 模式</Tag>}
                {c.usedInApps.length > 0 && <Tag>用于 {c.usedInApps.length} 应用</Tag>}
              </span>
            </a>
          ))}
        </div>
      </div>
    )
  }
}

/** 组件详情页——活体 demo（demos 注册表驱动） */
export const ComponentPage: Component = async (initProps: any, _ctx: any) => {
  // 数据声明（工厂层 await——两阶段组件：导航/重渲染缓存命中零成本）
  let name = ''
  let category = ''
  let hasDemo = false
  let compTags: string[] = []
  let compDesc = ''
  let compSource = ''
  let compCss = ''
  let compTest = ''
  let compGotchas: string[] = []
  let isVariant = false
  let compFamily: string | null = null
  let variantDemo: string | null = null
  let variantsOf: { id: string; name: string; desc: string }[] = []
  try {
    const idx = await fetchIndex()
    const id = initProps.id
    const comp = idx.components.find((c) => c.id === id)
    name = comp?.name ?? id
    category = comp?.category ?? 'others'
    compTags = comp?.tags ?? []
    compDesc = comp?.desc ?? ''
    compFamily = comp?.family ?? null
    // 变体聚合：变体 id → 渲染主组件页 + 变体 demo 突出（一页一组件心智）
    let resolved = comp
    if (comp?.variantOf) {
      const parent = idx.components.find((c) => c.id === comp.variantOf)
      isVariant = true
      variantDemo = name
      if (parent) {
        resolved = parent
        name = parent.name
        category = parent.category
        compTags = parent.tags ?? []
        variantsOf = idx.components.filter((c) => c.variantOf === parent.id)
      }
    } else {
      variantsOf = idx.components.filter((c) => c.variantOf === comp?.id)
    }
    // demo 活体：demos 注册表（已迁移分类）
    const demos = await import('../demos/index.ts')
    hasDemo = !!demos.DEMOS[name]
    compSource = resolved?.sourceFile ?? ''
    compCss = resolved?.cssFile ?? ''
    compTest = resolved?.testFile ?? ''
    compGotchas = resolved?.gotchas ?? []
  } catch { /* 索引不可用——页头兼容降级（名字 = id） */ }
  return async (_p: any) => {
    const demos = await import('../demos/index.ts')
    const Demo = (demos as any).DEMOS[name]
    return (
      <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:16px;padding:24px 16px">
        <div class="wf-font-xs wf-text-secondary">
          <a href="/components" style="color:inherit">组件</a> › <a href={`/components/${category}`} style="color:inherit">{category}</a> › {name}
        </div>
        <div class="wf-stack wf-gap-sm">
          <div class="wf-row wf-justify-between" style="--wf-align:flex-start">
            <div class="wf-stack wf-gap-xs">
              <h1 class="wf-font-3xl wf-margin-none">{name}</h1>
              {compDesc && <div class="wf-font-sm wf-text-secondary wf-margin-none">{compDesc}</div>}
              {(compTags.length > 0 || compFamily) && (
                <div class="wf-cluster wf-gap-xs">
                  {FamilyTag(compFamily)}
                  {compTags.map((t) => <Tag key={t}>{t}</Tag>)}
                </div>
              )}
            </div>
          </div>
          {hasDemo && Demo && (
            <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-stack wf-gap-none" style="overflow:hidden">
              {/* 舞台标题栏：品牌圆点 + 标签——分隔线（细边框美学） */}
              <div class="wf-row wf-justify-between wf-padding-x-md wf-padding-y-sm wf-border-bottom">
                <span class="wf-cluster wf-gap-xs wf-font-xs wf-text-secondary">
                  <span style="width:6px;height:6px;border-radius:50%;background:var(--wf-color-primary);display:inline-block"></span>
                  活体 demo（可交互）{isVariant ? ' · 当前为变体视图' : ''}
                </span>
              </div>
              <div class="wf-padding-md wf-stack wf-gap-md" style="min-height:220px;background:var(--wf-color-bg)">
                <Demo />
              </div>
            </div>
          )}
          {!hasDemo && (
            <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-font-sm wf-text-secondary">
              本组件无独立活体 demo——能力见下方组件文件/纪律，或在组合页面中体验。
            </div>
          )}
          {/* 组件文件 + 纪律（registry 元数据——源码导航） */}
          {(compSource || compCss || compTest || compGotchas.length > 0) && (
            <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-stack wf-gap-sm">
              <div class="wf-font-xs wf-text-secondary">组件文件</div>
              <div class="wf-stack wf-gap-xs wf-font-xs" style="font-family:var(--wf-font-mono)">
                {compSource && <span>{compSource}</span>}
                {compCss && <span>{compCss}</span>}
                {compTest && <span>{compTest}</span>}
              </div>
              {compGotchas.map((g, i) => (
                <div key={i} class="wf-font-xs wf-text-warning">⚠ {g}</div>
              ))}
            </div>
          )}
          {/* 变体聚合：主组件页列出全部使用方式（变体区块） */}
          {variantsOf.length > 0 && (
            <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-stack wf-gap-sm">
              <div class="wf-font-xs wf-text-secondary">本组件的不同使用方式（{variantsOf.length} 个变体）：</div>
              <div class="wf-cluster wf-gap-xs">
                {variantsOf.map((v) => (
                  <a key={v.id} href={`/components/${category}/${v.id}`} class="wf-tag wf-tag--primary" style="text-decoration:none">{v.name}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
}
