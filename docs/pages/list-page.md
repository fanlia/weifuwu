# 列表页模板

**使用场景**：展示数据列表，支持搜索、分页

**使用的组件**：PageHeader / SearchInput / Table / Pagination / Loading / EmptyState / Badge / Button / Alert

## 模板代码

```tsx
import { Table, SearchInput, Pagination, Button, Loading, EmptyState, Alert, Badge } from 'weifuwu/components'
import type { WfuiContext } from 'weifuwu/client'

export function EntityList(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  if (!ctx.ui.ready) {
    $.items = []; $.loading = true; $.error = ''; $.search = ''; $.page = 1; $.total = 0
    loadData()
  }

  // ★ 改这里：API 地址
  async function loadData() {
    try {
      const res = await ctx.api.get(`/api/items?page=${$.page}&search=${$.search}`)
      $.items = res.items ?? []
      $.total = res.total ?? 0
    } catch (e: any) { $.error = e.message }
    finally { $.loading = false }
  }

  async function handleDelete(id: string) {
    // ★ 改这里：删除 API
    await ctx.api.delete(`/api/items/${id}`)
    ctx.toast.success('已删除')
    $.items = $.items.filter(i => i.id !== id)
  }

  if ($.loading) return <Loading />
  if ($.error) return <Alert variant="error">{$.error}</Alert>

  return (
    <div class="wf-stack" style="padding:var(--wf-space-lg)">
      <div class="wf-split">
        <h2>列表</h2>   <!-- ★ 改这里：页面标题 -->
        <Button variant="primary" onClick={() => ctx.app?.navigate('/items/new')}>创建</Button>
      </div>

      <SearchInput value={$.search} onInput={e => { $.search = e.target.value; loadData() }} />

      <EmptyState if={$.items.length === 0} icon="📦" text="暂无数据" />

      <Table if={$.items.length > 0}
        data={$.items}
        // ★ 改这里：列定义
        columns={[
          { key: 'id', label: 'ID', width: 80 },
          { key: 'name', label: '名称' },
          { key: 'status', label: '状态', render: v => <Badge>{v}</Badge> },
          { key: 'created_at', label: '创建时间' },
          { key: 'actions', label: '', render: (_, row) => (
            <Button variant="ghost" size="sm" onClick={() => ctx.app?.navigate(`/items/${row.id}`)}>详情</Button>
          )},
        ]}
      />

      <Pagination if={$.total > 0} total={$.total} page={$.page} onChange={p => { $.page = p; loadData() }} />
    </div>
  )
}
```

## 可修改的部分

| 位置 | 说明 |
|------|------|
| API 地址 | `/api/items` 替换为实际接口 |
| 页面标题 | "列表" 替换为实际标题 |
| 列定义 | columns 数组替换为实际字段 |
| 删除 API | `DELETE /api/items/:id` |
| 创建路径 | `/items/new` 替换为实际路径 |
