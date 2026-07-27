# 详情页模板

**使用场景**：展示单条数据的详细信息，包含 Tabs 切换

**使用的组件**：Card / Badge / Tabs / Button / Alert / Loading

## 模板代码

```tsx
import { Card, Badge, Tabs, Button, Alert, Loading, Avatar } from 'weifuwu/components'
import type { WfuiContext } from 'weifuwu/client'

export function EntityDetail(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$
  const id = ctx.route?.params?.id

  if (!ctx.ui.ready) {
    $.item = null; $.loading = true; $.error = ''; $.tab = 'detail'
    // ★ 改这里：API 地址
    ctx.api.get(`/api/items/${id}`).then(data => {
      $.item = data
      $.loading = false
    }).catch(e => { $.error = e.message; $.loading = false })
  }

  if ($.loading) return <Loading />
  if ($.error) return <Alert variant="error">{$.error}</Alert>
  if (!$.item) return <Alert variant="warning">未找到</Alert>

  // ★ 改这里：展示字段
  const detailContent = (
    <div class="wf-stack">
      <div class="wf-split"><strong>名称</strong><span>{$.item.name}</span></div>
      <div class="wf-split"><strong>状态</strong><Badge>{$.item.status}</Badge></div>
      <div class="wf-split"><strong>创建时间</strong><span>{$.item.created_at}</span></div>
    </div>
  )

  return (
    <div class="wf-stack" style="padding:var(--wf-space-lg)">
      <div class="wf-split">
        <h2>{$.item.name}</h2>
        <div class="wf-row">
          <Button variant="ghost" onClick={() => ctx.app?.navigate(`/items/${id}/edit`)}>编辑</Button>
          <Button variant="danger">删除</Button>
        </div>
      </div>

      <Card>
        <Tabs items={[
          { key: 'detail', label: '详情', content: detailContent },
          { key: 'related', label: '关联数据', content: '关联内容' },
          { key: 'logs', label: '日志', content: '日志内容' },
        ]} active={$.tab} onChange={v => $.tab = v} />
      </Card>
    </div>
  )
}
```

## 可修改的部分

| 位置 | 说明 |
|------|------|
| API 地址 | `/api/items/:id` |
| 展示字段 | detailContent 中的字段 |
| Tabs 定义 | 增删 tab 项 |
| 操作按钮 | 编辑/删除等 |
