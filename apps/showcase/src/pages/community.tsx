/**
 * /community——社区组件收录（01 生态计划 P1）
 * 中级贡献台阶：组件（三件套 + demo + 质量 checklist）→ 提交 PR → 收录展示。
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { Tag, EmptyState } from 'weifuwu/components'
import { fetchIndex } from '../data.ts'

export const Community: Component = async (_init: any, _ctx: any) => {
  const idx = await fetchIndex()
  const list = idx.community ?? []
  return async (_p: any) => (
    <div class="wf-container wf-stack" style="--wf-max:900px;--wf-gap:20px;padding:32px 16px">
      <div class="wf-stack wf-gap-xs">
        <h1 class="wf-text-2xl wf-m-0">社区组件 · {list.length}</h1>
        <p class="wf-text-secondary wf-text-sm wf-m-0">
          外部贡献的组件收录——与内置组件同标（三件套 + style-audit + 质量 checklist）。
          你的第一个组件，从这里开始。
        </p>
      </div>

      {list.length === 0 ? (
        <div class="wf-surface wf-border wf-rounded-md">
          <EmptyState text="暂无收录" hint="期待你的第一个组件——提交 PR 后收录于此">
            <a class="wf-btn wf-btn--sm" href="https://github.com/weifuwu/weifuwu/issues/new?template=component-request.md" target="_blank">
              提交组件提案
            </a>
          </EmptyState>
        </div>
      ) : (
        <div class="wf-stack wf-gap-sm">
          {list.map((c) => (
            <div key={c.id} class="wf-surface wf-border wf-rounded-md wf-p-md wf-stack wf-gap-xs">
              <div class="wf-row wf-between">
                <b class="wf-text-base">{c.name} <span class="wf-text-xs wf-text-tertiary">by {c.author}</span></b>
                <a class="wf-text-xs wf-text-primary" href={c.url} target="_blank" style="text-decoration:none">源码 →</a>
              </div>
              <span class="wf-text-sm wf-text-secondary">{c.desc}</span>
              <span class="wf-cluster wf-gap-xs">{c.quality.map((q) => <Tag key={q}>{q}</Tag>)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 提交指引（与内置组件同标——scaffold 起步） */}
      <div class="wf-surface wf-border wf-rounded-md wf-p-md wf-stack wf-gap-sm">
        <b class="wf-text-base">📋 如何收录你的组件</b>
        <div class="wf-stack wf-gap-xs wf-text-sm">
          <div>1. <code class="wf-text-primary">node .pi/skills/weifuwu-dev/scripts/scaffold.mjs component &lt;Name&gt;</code> 起步（三件套自动生成）</div>
          <div>2. 实现 API + 纪律（受控回调 / 键盘 / 样式 token）+ 单测（渲染/交互/键盘）</div>
          <div>3. 补场景 demo（showcase 活体——不是孤立展示）+ <code>node scripts/gen-content.mjs</code></div>
          <div>4. 质量 checklist 全过（键盘 / 三断点 / 主题 / 对比度 / 状态矩阵 / 性能 / 纪律）</div>
          <div>5. 提交 PR → 维护者合入 → 登记到 registry/community.ts</div>
        </div>
        <a class="wf-text-xs wf-text-primary" href="https://github.com/weifuwu/weifuwu/issues/new?template=component-request.md" target="_blank" style="text-decoration:none">
          提交组件提案（GitHub issue 模板）→
        </a>
      </div>
    </div>
  )
}
