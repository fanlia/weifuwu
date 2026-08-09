import type { Component } from 'weifuwu/client'
import { Button, Tabs } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 4：分栏工作台（Split Workspace）
//
// 左中右三栏：文件树 / 编辑器 / 属性面板——IDE、邮箱、客服台通用结构。
// 使用 wf-split（flex 分栏，可配 --wf-split-ratio 调整比例）+ wf-fill。
// ─────────────────────────────────────────────────────────────

const FILES = [
  { name: 'src/', type: 'dir' },
  { name: '  client/', type: 'dir' },
  { name: '    ui.ts', type: 'file' },
  { name: '    diff.ts', type: 'file' },
  { name: '  server.ts', type: 'file' },
  { name: '  components/', type: 'dir' },
  { name: '    Button.tsx', type: 'file' },
  { name: 'package.json', type: 'file' },
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
    <div class="wf-split" style={{ height: 'calc(100vh - 48px)', '--wf-split-ratio': '20% 1fr 260px', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--wf-color-border-light)' }}>
      {/* 左栏：文件树 */}
      <aside class="wf-stack wf-gap-none wf-pad-md" style={{ background: 'var(--wf-color-bg-subtle)', overflow: 'auto' }}>
        <b style={{ fontSize: 13, paddingBottom: 8 }}>资源管理器</b>
        {FILES.map((f) => (
          <span key={f.name} class="wf-nav-item" style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6 }}>
            {f.type === 'dir' ? '📁' : '📄'} {f.name}
          </span>
        ))}
      </aside>

      {/* 中栏：编辑器 */}
      <main class="wf-stack wf-gap-none wf-fill" style={{ background: 'var(--wf-color-bg)' }}>
        <div class="wf-row wf-pad-sm wf-gap-sm" style={{ borderBottom: '1px solid var(--wf-color-border-light)' }}>
          <Tabs
            active="server.ts"
            onChange={() => {}}
            items={[
              { key: 'server.ts', label: 'server.ts' },
              { key: 'ui.ts', label: 'ui.ts' },
            ]}
          />
        </div>
        <div class="wf-fill wf-pad-md" style={{ overflow: 'auto', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 }}>
          {CODE.split('\n').map((line, i) => (
            <div key={i} style={{ whiteSpace: 'pre' }}>
              <span class="wf-text-tertiary" style={{ display: 'inline-block', width: 28, textAlign: 'right', marginRight: 12 }}>{i + 1}</span>
              {line || ' '}
            </div>
          ))}
        </div>
        {/* 底部状态栏 */}
        <div class="wf-row wf-pad-sm wf-gap-md wf-text-secondary" style={{ borderTop: '1px solid var(--wf-color-border-light)', fontSize: 12 }}>
          <span>✓ 已保存</span>
          <span>UTF-8</span>
          <span>TypeScript</span>
        </div>
      </main>

      {/* 右栏：属性面板 */}
      <aside class="wf-stack wf-gap-md wf-pad-md" style={{ borderLeft: '1px solid var(--wf-color-border-light)', overflow: 'auto' }}>
        <b style={{ fontSize: 13 }}>属性</b>
        {[
          ['文件', 'server.ts'],
          ['语言', 'TypeScript'],
          ['行数', '12'],
          ['大小', '412 B'],
          ['修改', '刚刚'],
        ].map(([k, v]) => (
          <div key={k} class="wf-row wf-gap-sm" style={{ justifyContent: 'space-between', fontSize: 13 }}>
            <span class="wf-text-secondary">{k}</span>
            <span>{v}</span>
          </div>
        ))}
        <div class="wf-stack wf-gap-sm" style={{ marginTop: 'auto' }}>
          <Button size="sm" variant="primary" block>运行</Button>
          <Button size="sm" variant="ghost" block>格式化</Button>
        </div>
      </aside>
    </div>
  )
)

// register({ id: 'workspace', name: '分栏工作台', desc: '左中右三栏（文件树 + 编辑器 + 属性）', comp: SplitWorkspace })
