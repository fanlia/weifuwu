# 表单页模板

**使用场景**：创建/编辑单条数据的页面

**使用的组件**：Form / Field / Input / Select / Textarea / Button / Alert

## 模板代码

```tsx
import { Form, Field, Input, Select, Textarea, Button, Alert } from 'weifuwu/components'
import type { WfuiContext } from 'weifuwu/client'

export function CreateEntity(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  if (!ctx.ui.ready) {
    // ★ 改这里：初始化字段
    $.name = ''; $.type = ''; $.description = ''; $.error = ''
  }

  async function handleSubmit() {
    // ★ 改这里：API 路径和字段映射
    try {
      await ctx.api.post('/api/items', {
        name: $.name,
        type: $.type,
        description: $.description,
      })
      ctx.toast.success('创建成功')
      ctx.app?.navigate('/items')
    } catch (e: any) {
      $.error = e.message
    }
  }

  return (
    <div class="wf-stack" style="max-width:600px">
      <h2>创建条目</h2>   <!-- ★ 改这里：页面标题 -->

      <Alert if={$.error} variant="error" closable>{$.error}</Alert>

      <Form onSubmit={handleSubmit}>
        <Input label="名称" required
          value={$.name}
          onInput={e => $.name = e.target.value} />

        <Select label="类型"
          value={$.type}
          onChange={e => $.type = e.target.value}
          options={[
            { value: 'a', label: '类型A' },
            { value: 'b', label: '类型B' },
          ]} />

        <Textarea label="描述"
          value={$.description}
          onInput={e => $.description = e.target.value} />

        <div class="wf-split">
          <Button variant="ghost" onClick={() => ctx.app?.navigate('/items')}>取消</Button>
          <Button type="submit" variant="primary">保存</Button>
        </div>
      </Form>
    </div>
  )
}
```

## 可修改的部分

| 位置 | 说明 |
|------|------|
| 初始化字段 | `$.xxx = ''` 替换为你的字段 |
| API 路径 | `POST /api/items` 替换为你的接口 |
| 字段映射 | `name: $.name` 替换为你的字段名 |
| 页面标题 | "创建条目" 替换为你的标题 |
| 字段定义 | 删除/添加 Input/Select 等 |
