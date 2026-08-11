import type { Component } from 'weifuwu/ui-dom'
import {Text, Button, CodeBlock, Descriptions, Divider, Icon, List, Tabs, Space } from 'weifuwu/components'


// ─────────────────────────────────────────────────────────────
// 模式 4：分栏工作台（Split Workspace）
//
// 左中右三栏：文件树 / 编辑器 / 属性面板——IDE、邮箱、客服台通用。
// 100% 原语 + 组件：wf-split（--wf-split-ratio 控制比例）+ wf-fill
//   List（文件树）、CodeBlock（代码）、Descriptions（属性）
// ─────────────────────────────────────────────────────────────

const FILES2 = [
  { name: 'server.ts', icon: 'file-text' as const, depth: 0, code: `// server.ts —— 一个文件启动全栈应用
import { serve, Router, ui } from 'weifuwu'

const app = new Router()
app.use(ui())

app.get('/api/ping', () => Response.json({ pong: true }))
app.get('/app.js', (req, ctx) =>
  ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))

serve(app, { port: 3000 })
console.log('http://localhost:3000')` },
  { name: 'ui.ts', icon: 'file-text' as const, depth: 0, code: `// ui.ts —— 组件 + 响应式状态
export const Counter: Component = async (_init, ctx) => {
  const $ = ctx.ui.$()
  $.count = 0
  return () => h('button', {
    onClick: () => { $.count++ },
  }, '计数：' + $.count)
}` },
  { name: 'diff.ts', icon: 'file-text' as const, depth: 0, code: `// diff.ts —— VNode diff（无 key 复用）
export function patchKeyedChildren(...) {
  // 数组 diff：allUnkeyed 按位置复用
  // keyed：移动最小化
}` },
]

export const SplitWorkspace: Component = async (_init, ctx) => {
  const $ = ctx.ui.$()
  $.file = 'server.ts'
  $.tab = 'server.ts'

  return () => {
    const code = (FILES2.find((f) => f.name === $.file) ?? FILES2[0]).code
    return (
    <div class="wf-grid wf-border wf-rounded-lg" style={{ height: 'calc(100vh - 48px)', '--wf-cols': '20% 1fr 260px', overflow: 'hidden' }}>
      {/* 左栏：文件树 */}
      <aside class="wf-stack wf-gap-none wf-p-md wf-bg-secondary wf-scroll">
        <Text className="wf-text-sm" strong>资源管理器</Text>
        <Divider />
        <div class="wf-stack wf-gap-sm">
          {FILES2.map((f) => (
            <div
              key={f.name}
              class={`wf-nav-item wf-pointer${$.file === f.name ? ' wf-nav-item--active' : ''}`}
              onClick={() => { $.file = f.name }}
            >
              <span class="wf-nav-icon"><Icon name={f.icon} size={14} /></span>
              <span class="wf-nav-label">{f.name}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* 中栏：编辑器 */}
      <main class="wf-stack wf-gap-none wf-fill">
        <div class="wf-p-sm wf-border-b">
          <Tabs
            active={$.tab}
            onChange={(k) => { $.tab = k; $.file = k }}
            items={FILES2.map((f) => ({ key: f.name, label: f.name }))}
          />
        </div>
        <div class="wf-fill wf-p-md wf-scroll">
          <CodeBlock lang="ts" title={$.file} code={code} />
        </div>
        {/* 底部状态栏 */}
        <div class="wf-row wf-p-sm wf-gap-md wf-border-t">
          <Space size="lg">
            <Text type="secondary" className="wf-text-xs">✓ 已保存</Text>
            <Text type="secondary" className="wf-text-xs">UTF-8</Text>
            <Text type="secondary" className="wf-text-xs">TypeScript</Text>
          </Space>
        </div>
      </main>

      {/* 右栏：属性面板 */}
      <aside class="wf-stack wf-gap-md wf-p-md wf-border-l wf-scroll">
        <Text className="wf-text-sm" strong>属性</Text>
        <Descriptions
          size="sm"
          items={[
            { label: '文件', value: 'server.ts' },
            { label: '语言', value: 'TypeScript' },
            { label: '行数', value: '12' },
            { label: '大小', value: '412 B' },
            { label: '修改', value: '刚刚' },
          ]}
        />
        <Divider />
        <div class="wf-stack wf-gap-sm">
          <Button size="sm" variant="primary" block>运行</Button>
          <Button size="sm" variant="ghost" block>格式化</Button>
        </div>
      </aside>
    </div>
    )
  }
}

