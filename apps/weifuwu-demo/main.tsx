/**
 * weifuwu/client + weifuwu/layout 开发体感
 *
 * 这个文件展示一个开发者写完一整个页面的完整代码。
 * 注意看：没有任何 flex/grid 手写，没有任何硬编码色值。
 */

import { createApp, router, RouteView } from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'

/* ═══════════════════════════════════════
 * 开发者只需要关心两件事：
 *   1. wf-* 原语 → 元素之间的空间关系
 *   2. var(--wf-*) → 视觉 Token
 *
 * 不需要学 flex/grid/position，不需要查色值。
 * ═══════════════════════════════════════ */

/* ── 页面头组件 ── */
function PageHead(props: { title: string; sub?: string; children?: any }, _ctx: WfuiContext) {
  return (
    <div class="wf-split" style="margin-bottom: var(--wf-space-lg)">
      <div class="wf-stack" style="--wf-gap: 4px">
        <h2 style="font-size: var(--wf-font-size-2xl); font-weight: var(--wf-font-weight-semibold);
                   color: var(--wf-color-text)">{props.title}</h2>
        {props.sub && <p style="font-size: var(--wf-font-size-base);
                                color: var(--wf-color-text-secondary)">{props.sub}</p>}
      </div>
      {props.children &&
        <div class="wf-row" style="--wf-gap: var(--wf-space-sm)">{props.children}</div>}
    </div>
  )
}

/* ── 统计卡片 ── */
function StatCard(props: { label: string; value: string; change?: string; up?: boolean }, _ctx: WfuiContext) {
  return (
    <div class="wf-surface wf-stack"
         style="padding: var(--wf-space-lg); background: var(--wf-color-bg); text-align: center; --wf-gap: 4px">
      <span style="font-size: var(--wf-font-size-xs); color: var(--wf-color-text-secondary); text-transform: uppercase;
                   letter-spacing: 0.5px">{props.label}</span>
      <span style="font-size: var(--wf-font-size-4xl); font-weight: var(--wf-font-weight-bold);
                   color: var(--wf-color-text)">{props.value}</span>
      {props.change && <span class={`stat-change ${props.up ? 'up' : 'down'}`}>{props.change}</span>}
    </div>
  )
}

/* ── Dashboard 页面 ── */
function Dashboard(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  if (!ctx.ui.ready) {
    $.dark = document.documentElement.getAttribute('data-theme') === 'dark'
    $.users = [
      { id: 1, name: '张三', email: 'zhang@example.com', status: 'active', avatar: '张' },
      { id: 2, name: '李四', email: 'li@example.com', status: 'active', avatar: '李' },
      { id: 3, name: '王五', email: 'wang@example.com', status: 'inactive', avatar: '王' },
    ]
  }

  function toggleTheme() {
    $.dark = !$.dark
    document.documentElement.setAttribute('data-theme', $.dark ? 'dark' : 'light')
  }

  return (
    <!-- 整个页面只用 wf-*原语 排布局，没有任何手写 flex/grid -->
    <div class="wf-stack" style="--wf-gap: var(--wf-space-xl); max-width: 1000px; margin: 0 auto; padding: var(--wf-space-xl)">

      <!-- 顶栏：split 两端展开 -->
      <div class="wf-split">
        <div class="wf-row" style="--wf-gap: var(--wf-space-sm)">
          <div class="user-avatar">W</div>
          <div class="wf-stack" style="--wf-gap: 2px">
            <span style="font-size: var(--wf-font-size-lg); font-weight: var(--wf-font-weight-semibold);
                         color: var(--wf-color-text)">WeiFuWu</span>
            <span style="font-size: var(--wf-font-size-xs); color: var(--wf-color-text-tertiary)">管理后台</span>
          </div>
        </div>
        <div class="wf-row" style="--wf-gap: var(--wf-space-sm)">
          <button class="wf-row" style="--wf-gap: 6px; padding: 6px 12px; cursor: pointer;
                  background: var(--wf-color-bg); border: var(--wf-border-width) solid var(--wf-color-border);
                  border-radius: var(--wf-radius); color: var(--wf-color-text); font-size: var(--wf-font-size-base)"
                  onClick={toggleTheme}>
            <span>{$.dark ? '☀️' : '🌙'}</span>
            <span>{$.dark ? '亮色' : '暗色'}</span>
          </button>
          <div class="user-avatar" style="cursor: pointer">{$.dark ? '🌙' : '☀️'}</div>
        </div>
      </div>

      <!-- PageHead：split 标题 + 新建按钮 -->
      <PageHead title="仪表盘" sub="欢迎回来，这是今天的概览">
        <button style="padding: 8px 16px; background: var(--wf-color-primary); color: #fff;
                       border: none; border-radius: var(--wf-radius); cursor: pointer;
                       font-size: var(--wf-font-size-base); font-weight: var(--wf-font-weight-medium)">+ 新建</button>
      </PageHead>

      <!-- 统计行：row + fill 等分成四列 -->
      <div class="wf-row" style="--wf-gap: var(--wf-space-md)">
        <StatCard label="总用户" value="1,234" change="↑ 12%" up={true} />
        <StatCard label="活跃用户" value="856" change="↑ 5.2%" up={true} />
        <StatCard label="新注册" value="48" change="↑ 18.7%" up={true} />
        <StatCard label="转化率" value="3.2%" change="↓ 0.4%" up={false} />
      </div>

      <!-- 用户表格 -->
      <div class="wf-surface" style="background: var(--wf-color-bg); overflow: hidden">
        <table class="wf-stack" style="width: 100%; border-collapse: collapse; --wf-gap: 0">
          <thead>
            <tr class="wf-row" style="--wf-gap: 0; padding: 0 var(--wf-space-md); border-bottom: var(--wf-border-width) solid var(--wf-color-border);
                      background: var(--wf-color-bg-secondary)">
              {['姓名', '邮箱', '状态', '操作'].map(label =>
                <th class="wf-fill" style="padding: var(--wf-space) var(--wf-space-sm); font-size: var(--wf-font-size-xs);
                           color: var(--wf-color-text-tertiary); font-weight: var(--wf-font-weight-medium);
                           text-align: left; text-transform: uppercase; letter-spacing: 0.5px">{label}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {$.users.map((u: any) =>
              <tr class="wf-row" style="--wf-gap: 0; padding: 0 var(--wf-space-md); border-bottom: var(--wf-border-width) solid var(--wf-color-border)">
                <td class="wf-fill wf-row" style="--wf-gap: var(--wf-space-sm); padding: var(--wf-space) var(--wf-space-sm)">
                  <div class="user-avatar">{u.avatar}</div>
                  <div style="color: var(--wf-color-text); font-size: var(--wf-font-size-lg)">{u.name}</div>
                </td>
                <td class="wf-fill" style="padding: var(--wf-space) var(--wf-space-sm); font-size: var(--wf-font-size-base); color: var(--wf-color-text-secondary)">{u.email}</td>
                <td class="wf-fill" style="padding: var(--wf-space) var(--wf-space-sm)">
                  <span class="wf-row" style="--wf-gap: 4px; font-size: var(--wf-font-size-sm);
                        color: {u.status === 'active' ? 'var(--wf-color-success)' : 'var(--wf-color-text-tertiary)'}">
                    <span style="width: 6px; height: 6px; border-radius: 50%;
                         background: {u.status === 'active' ? 'var(--wf-color-success)' : 'var(--wf-color-text-disabled)'}"></span>
                    {u.status === 'active' ? '在线' : '离线'}
                  </span>
                </td>
                <td class="wf-fill" style="padding: var(--wf-space) var(--wf-space-sm)">
                  <a style="color: var(--wf-color-primary); cursor: pointer; font-size: var(--wf-font-size-base);
                            text-decoration: none">编辑</a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <!-- 底部提示 -->
      <div class="wf-center" style="padding: var(--wf-space-lg) 0">
        <span style="font-size: var(--wf-font-size-xs); color: var(--wf-color-text-tertiary)">
          使用 weifuwu/client + weifuwu/layout 构建 · {$.dark ? '暗色' : '亮色'}模式
        </span>
      </div>

    </div>
  )
}

/* ── 启动 ── */
createApp()
  .use(router({ routes: [{ path: '/', component: Dashboard }], mode: 'hash' }))
  .mount('#root', () => <Dashboard />)
