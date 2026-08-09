import type { Component } from 'weifuwu/client'
import {Text, Button, CodeBlock, Descriptions, Divider, Icon, List, Tabs, Space } from 'weifuwu/components'


// ─────────────────────────────────────────────────────────────
// 模式 4：分栏工作台（Split Workspace）
//
// 左中右三栏：文件树 / 编辑器 / 属性面板——IDE、邮箱、客服台通用。
// 100% 原语 + 组件：wf-split（--wf-split-ratio 控制比例）+ wf-fill
//   List（文件树）、CodeBlock（代码）、Descriptions（属性）
// ─────────────────────────────────────────────────────────────

const FILES = [
  { name: 'src/', icon: 'folder' as const, depth: 0 },
  { name: 'client/', icon: 'folder' as const, depth: 1 },
  { name: 'ui.ts', icon: 'file-text' as const, depth: 2 },
  { name: 'diff.ts', icon: 'file-text' as const, depth: 2 },
  { name: 'server.ts', icon: 'file-text' as const, depth: 1 },
  { name: 'components/', icon: 'folder' as const, depth: 1 },
  { name: 'Button.tsx', icon: 'file-text' as const, depth: 2 },
]

const CODE = `// server.ts —— 一个文件启动全栈应用
import { serve, Router, ui } from 'weifuwu'

const app = new Router()
app.use(ui())

app.get('/api/ping', () => Response.json({ pong: true }))
app.get('/app.js', (req, ctx) =>
  ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))

serve(app, { port: 3000 })
console.log('http://localhost:3000')`

export const SplitWorkspace: Component = (_init, _ctx) => (
  () => (
    <div class="wf-grid wf-border wf-rounded-lg" style={{ height: 'calc(100vh - 48px)', '--wf-cols': '20% 1fr 260px', overflow: 'hidden' }}>
      {/* 左栏：文件树 */}
      <aside class="wf-stack wf-gap-none wf-p-md wf-bg-secondary wf-scroll">
        <Text className="wf-text-sm" strong>资源管理器</Text>
        <Divider />
        <List
          items={FILES}
          renderItem={(f) => (
            <div class="wf-row wf-gap-sm" style={{ paddingLeft: f.depth * 16 }}>
              <Icon name={f.icon} size={14} className="wf-text-tertiary" />
              <Text className="wf-text-sm">{f.name}</Text>
            </div>
          )}
        />
      </aside>

      {/* 中栏：编辑器 */}
      <main class="wf-stack wf-gap-none wf-fill">
        <div class="wf-p-sm wf-border-b">
          <Tabs
            active="server.ts"
            onChange={() => {}}
            items={[
              { key: 'server.ts', label: 'server.ts' },
              { key: 'ui.ts', label: 'ui.ts' },
            ]}
          />
        </div>
        <div class="wf-fill wf-p-md wf-scroll">
          <CodeBlock lang="ts" title="server.ts" code={CODE} />
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
)

