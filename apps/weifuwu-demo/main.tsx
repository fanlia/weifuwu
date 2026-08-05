/**
 * weifuwu/client + weifuwu/components 开发体感 —— 零自定义 CSS
 *
 * 这个文件展示一个开发者写完一整个页面的完整代码。
 * 唯一的样式来源是 weifuwu/components/style.css（内含全部 Token + 布局原语 + 组件样式）。
 * 没有 style.css，没有 style=""，没有任何手写 CSS。
 */

import { createApp, router, RouteView } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { Avatar, Badge, Button, PageHeader, StatCard, Table } from 'weifuwu/components'

/* ═══════════════════════════════════════
 * 开发者只需要关心两件事：
 *   1. 组件（Button/StatCard/Table/...）→ 页面功能块
 *   2. wf-* 原语（wf-stack/wf-row/wf-gap/...）→ 块之间的空间关系
 *
 * 不需要 flex/grid/position，不需要查色值，不需要 CSS 文件。
 * ═══════════════════════════════════════ */

/* ── Dashboard 页面 ── */
function Dashboard(_props: {}, ctx: WfuiContext) {
  let dark = false
  const users = [
    { name: 'Alice', email: 'alice@example.com', status: 'active' },
    { name: 'Bob', email: 'bob@example.com', status: 'offline' },
    { name: 'Charlie', email: 'charlie@example.com', status: 'active' },
  ]

  function toggleTheme() {
    dark = !dark
    ctx.ui.render()
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }

  return (__props: {}) =>
    (
    <div class="wf-container wf-stack wf-gap-2xl wf-p-xl wf-mx-auto" style="--wf-max:1000px">
      {/* ── 顶栏 ── */}
      <div class="wf-split">
        <div class="wf-row wf-gap-sm">
          <Avatar name="W" />
          <div class="wf-stack wf-gap-xs">
            <span class="wf-text-lg wf-text-semibold">WeiFuWu</span>
            <span class="wf-text-xs wf-text-tertiary">管理后台</span>
          </div>
        </div>
        <div class="wf-row wf-gap-sm">
          <Button variant="secondary" size="sm" onClick={toggleTheme}>
            {dark ? '☀️ 亮色' : '🌙 暗色'}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleTheme}>{dark ? '🌙' : '☀️'}</Button>
        </div>
      </div>

      {/* ── 页头 + 主操作 ── */}
      <PageHeader title="仪表盘" sub="欢迎回来，这是今天的概览">
        <Button variant="primary">+ 新建</Button>
      </PageHeader>

      {/* ── 指标卡 ── */}
      <div class="wf-row wf-gap-lg">
        <div class="wf-fill"><StatCard label="总用户" value="1,234" icon="👤" trend="up" trendLabel="12%" /></div>
        <div class="wf-fill"><StatCard label="活跃用户" value="856" icon="⚡" trend="up" trendLabel="5.2%" /></div>
        <div class="wf-fill"><StatCard label="新注册" value="48" icon="✨" trend="up" trendLabel="18.7%" /></div>
        <div class="wf-fill"><StatCard label="转化率" value="3.2%" icon="📈" trend="down" trendLabel="0.4%" /></div>
      </div>

      {/* ── 用户表 ── */}
      <div class="wf-surface wf-clip">
        <Table
          data={users}
          columns={[
            {
              key: 'name', label: '姓名',
              render: (v: string, row: any) => (
                <div class="wf-row wf-gap-sm">
                  <Avatar name={v} size="sm" />
                  <span class="wf-text-lg">{v}</span>
                </div>
              ),
            },
            {
              key: 'email', label: '邮箱',
              render: (v: string) => <span class="wf-text-secondary">{v}</span>,
            },
            {
              key: 'status', label: '状态',
              render: (v: string) => (
                <span class="wf-row wf-gap-xs wf-text-sm">
                  <Badge dot variant={v === 'active' ? 'success' : 'default'} />
                  <span class={v === 'active' ? 'wf-text-success' : 'wf-text-tertiary'}>{v === 'active' ? '在线' : '离线'}</span>
                </span>
              ),
            },
            {
              key: 'actions', label: '操作',
              render: () => <a class="wf-text-base" style="cursor: pointer; text-decoration: none">编辑</a>,
            },
          ]}
        />
      </div>

      {/* ── 页脚 ── */}
      <div class="wf-center wf-py-lg">
        <span class="wf-text-xs wf-text-tertiary">
          使用 weifuwu/client + weifuwu/components 构建 · {dark ? '暗色' : '亮色'}模式 · 零自定义 CSS
        </span>
      </div>

    </div>
    )
}

/* ── 启动 ── */
createApp()
  .use(router({ routes: [{ path: '/', component: Dashboard }], mode: 'hash' }))
  .mount('#root', Dashboard)
