/**
 * 布局原语索引页（/layout——registry/primitives.ts 驱动——结构化索引渲染）
 * 族详情页随 content/ 文档库移除——族卡片即完整清单（代表类 + 源码文件）
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { Tag } from 'weifuwu/components'
import { fetchIndex, type IndexJson } from '../data.ts'

export const LayoutIndex: Component = async (_init: any) => {
  const idx: IndexJson = await fetchIndex()
  const list = idx.primitives
  return async (_p: any) => (
    <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:16px;padding:24px 16px">
      <h1 class="wf-font-2xl wf-margin-none">布局原语 · {list.length} 族</h1>
      <div class="wf-font-xs wf-text-secondary">
        wf-* 原语与工具类——命名规则：概念原语 / 属性根全名 / 裸值词（docs/style-guide.md）
      </div>
      <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,300px),1fr));--wf-gap:12px">
        {list.map((it) => (
          <div key={it.id} class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-stack wf-gap-xs">
            <div class="wf-justify-between">
              <b class="wf-font-base">{it.name}</b>
              <Tag>{it.kind === 'utility' ? '工具类' : '原语'}</Tag>
            </div>
            <span class="wf-font-xs wf-text-secondary">{it.desc}</span>
            <div class="wf-row wf-gap-xs">
              {it.classes.map((c) => <Tag key={c}>{c}</Tag>)}
            </div>
            <span class="wf-font-xs wf-text-tertiary">src/client/layout/{it.cssFile}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
