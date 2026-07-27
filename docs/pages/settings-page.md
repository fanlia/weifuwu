# 设置页模板

**使用场景**：包含多个独立保存的设置分组

**使用的组件**：Card / Switch / Input / Button / Alert

## 模板代码

```tsx
import { Card, Switch, Input, Button, Alert, Tabs } from 'weifuwu/components'
import type { WfuiContext } from 'weifuwu/client'

export function Settings(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  if (!ctx.ui.ready) {
    // ★ 改这里：初始化设置字段
    $.siteName = ''; $.siteUrl = ''; $.notifyEnabled = false; $.error = ''
    loadSettings()
  }

  async function loadSettings() {
    try {
      // ★ 改这里：加载 API
      const data = await ctx.api.get('/api/settings')
      $.siteName = data.site_name ?? ''
      $.siteUrl = data.site_url ?? ''
      $.notifyEnabled = data.notify_enabled ?? false
    } catch (e: any) { $.error = e.message }
  }

  async function saveBasic() {
    try {
      await ctx.api.put('/api/settings', { site_name: $.siteName, site_url: $.siteUrl })
      ctx.toast.success('已保存')
    } catch (e: any) { $.error = e.message }
  }

  async function saveNotify() {
    try {
      await ctx.api.put('/api/settings', { notify_enabled: $.notifyEnabled })
      ctx.toast.success('已保存')
    } catch (e: any) { $.error = e.message }
  }

  return (
    <div class="wf-stack" style="max-width:600px;padding:var(--wf-space-lg)">
      <h2>设置</h2>
      <Alert if={$.error} variant="error">{$.error}</Alert>

      <Card>
        <div class="wf-stack">
          <h3>基本信息</h3>
          <Input label="站点名称" value={$.siteName} onInput={e => $.siteName = e.target.value} />
          <Input label="站点 URL" value={$.siteUrl} onInput={e => $.siteUrl = e.target.value} />
          <div class="wf-right"><Button variant="primary" onClick={saveBasic}>保存基本信息</Button></div>
        </div>
      </Card>

      <Card>
        <div class="wf-stack">
          <h3>通知设置</h3>
          <Switch label="启用通知" checked={$.notifyEnabled} onChange={v => $.notifyEnabled = v} />
          <div class="wf-right"><Button variant="primary" onClick={saveNotify}>保存通知设置</Button></div>
        </div>
      </Card>
    </div>
  )
}
```

## 可修改的部分

| 位置 | 说明 |
|------|------|
| 初始化字段 | 你的设置项 |
| 加载 API | `GET /api/settings` |
| 保存 API | `PUT /api/settings` |
| 设置分组 | 每个 Card 是一个设置分组 |
