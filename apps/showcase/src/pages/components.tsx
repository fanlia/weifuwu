/**
 * 组件域页面——目录（全量平铺 A→Z + 即时搜索）/ 详情页（活体 demo + 文档）
 *
 * **components-only 定稿（SHOWCASE-COMPONENTS-ONLY-PLAN——2027-XX）**：
 * 分类层取消、字母序、组件即首页（/）——用户路径：落地即目录 → 搜索/扫读
 * → 详情 → 用起来。CategoryPage 已删（git 历史可查）。
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { Tag } from 'weifuwu/components'
import { fetchIndexCached } from '../data.ts'
import * as demosAny from '../demos/index.ts'
import { NotFound } from './not-found.tsx'

/** 家族元数据（家族徽标——目录搜索 family 维度 + 详情页徽标） */
const FAMILIES: Record<string, { name: string; desc: string }> = {
  'file-preview': { name: 'FilePreview 家族', desc: 'office 文档域（预览/xlsx/pptx）' },
  'ai-chat': { name: 'AI 会话家族', desc: 'AI 会话场景（对话/工具/审批/模板）' },
}

/** 家族徽标（非链接 span——guides 域已移除，家族页不存在——title 提示即可） */
const FamilyTag = (f: string | null | undefined) => {
  const meta = f ? FAMILIES[f] : null
  if (!meta) return null
  return h('span', {
    class: 'wf-tag wf-tag--primary',
    title: meta.desc,
  }, meta.name)
}

/** 组件目录（兼站首页）——全量平铺（A→Z 字母序）+ 即时搜索（名称/描述/家族） */
export const ComponentsIndex: Component = (_init: any, ctx: any) => {
  const idx = fetchIndexCached(() => ctx.render())
  let q = ''
  return (_p: any) => {
    const kw = q.trim().toLowerCase()
    const all = idx.components
      .filter((c) => !kw
        || c.name.toLowerCase().includes(kw)
        || c.desc.toLowerCase().includes(kw)
        || (c.family ?? '').toLowerCase().includes(kw)
        || (c.family ? (FAMILIES[c.family]?.name ?? '').toLowerCase().includes(kw) : false))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    return (
      <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:20px;padding:24px 16px">
        <div class="wf-row wf-justify-between">
          <div class="wf-stack wf-gap-xs">
            <h1 class="wf-font-2xl wf-margin-none">组件 · {idx.components.length || '…'}</h1>
            <p class="wf-text-secondary wf-font-sm wf-margin-none">每组件一个活体 demo——按字母排序，搜索名称/功能直达</p>
          </div>
          <input class="wf-input" style="max-width:260px" placeholder="🔍 搜索组件（名称/功能）…" value={q}
            onInput={(e: any) => { q = (e.target as HTMLInputElement).value; ctx.render() }} />
        </div>
        {kw && <div class="wf-font-xs wf-text-secondary">匹配 {all.length} 个组件</div>}
        <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,300px),1fr));--wf-gap:12px">
          {all.map((c) => (
            <a key={c.id} href={`/components/${c.id}`} class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
              <b class="wf-font-base">{c.name}</b>
              <span class="wf-font-xs wf-text-secondary">{c.desc}</span>
              <span class="wf-cluster wf-gap-xs">{FamilyTag(c.family)}</span>
            </a>
          ))}
        </div>
      </div>
    )
  }
}

/** 组件详情页——活体 demo（demos 注册表驱动） */
export const ComponentPage: Component = (initProps: any, ctx: any) => {
  // **2027-08 同步化——数据在 renderFn 内同步读**（fetchIndexCached——
  // SSR prefetch / 客户端种子预热 → 首帧同步命中——SSR≡SPA 一致）——
  // 未命中 EMPTY + notify（数据到 → 重渲染）——无异步启动时序差异
  return (_p: any) => {
    const idx = fetchIndexCached(() => ctx.render())
    // 数据未到（冷启动无种子——SSR 回退 SPA 壳）：loading 占位（数据到 → 重渲染）
    if (!idx.components.length) {
      return <div class="wf-container wf-padding-md wf-font-sm wf-text-secondary">加载中…</div>
    }
    const id = initProps.id
    const comp = idx.components.find((c) => c.id === id)
    // 未知组件 id（含旧分类链接 /components/<category>）→ 404 壳（导航可用）
    if (!comp) return h(NotFound)
    let name = comp.name
    const compTags = comp.tags ?? []
    const compDesc = comp.desc ?? ''
    const compFamily = comp.family ?? null
    // 变体聚合：变体 id → 渲染主组件页 + 变体 demo 突出（一页一组件心智）
    let resolved = comp
    let isVariant = false
    let variantsOf: { id: string; name: string; desc: string }[] = []
    if (comp.variantOf) {
      const parent = idx.components.find((c) => c.id === comp.variantOf)
      isVariant = true
      if (parent) {
        resolved = parent
        name = parent.name
      }
    }
    variantsOf = idx.components.filter((c) => c.variantOf === resolved.id)
    // demo 活体：demos 注册表（已迁移分类）——同步引用
    const Demo = (demosAny as any).DEMOS[name]
    const compSource = resolved?.sourceFile ?? ''
    const compCss = resolved?.cssFile ?? ''
    const compTest = resolved?.testFile ?? ''
    const compGotchas = resolved?.gotchas ?? []
    return (
      <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:16px;padding:24px 16px">
        <div class="wf-font-xs wf-text-secondary">
          <a href="/components" style="color:inherit">组件</a> › {name}
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
          {Demo ? (
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
          ) : (
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
                  <a key={v.id} href={`/components/${v.id}`} class="wf-tag wf-tag--primary" style="text-decoration:none">{v.name}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
}
