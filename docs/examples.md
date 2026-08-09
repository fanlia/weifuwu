# 组合场景示例

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

## 登录表单

```tsx
const LoginPage = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.errors = {}
  $.submitting = false

  return (props) =>
    h('div', { class: 'wf-stack', style: { maxWidth: 400, margin: '40px auto' } },
      h(Card, { padding: 'lg' },
        h('div', { class: 'wf-stack', style: { gap: 'var(--wf-space-md)' } },
          h('h2', {}, '登录'),
          h(Form, {
            validation: {
              email: [{ required: true, pattern: /@/, message: '请输入有效邮箱' }],
              password: [{ required: true, minLength: 6, message: '密码至少6位' }],
            },
            onSubmit: async (values) => {
              $.submitting = true
              await ctx.api?.post('/login', values)   // api 客户端由中间件注入 ctx.api
              $.submitting = false
            },
            onError: (errors) => { $.errors = errors },
          }, [
            h(Field, { label: '邮箱', error: $.errors.email },
              h(Input, { name: 'email', type: 'email', placeholder: 'name@example.com' })),
            h(Field, { label: '密码', error: $.errors.password },
              h(Input, { name: 'password', type: 'password' })),
            h(Button, { type: 'submit', loading: $.submitting, block: true }, '登录'),
          ])
        )
      )
    )
}
```

## 数据列表 + 搜索

```tsx
const UserList = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.keyword = ''
  $.sortKey = 'name'
  $.sortOrder = 'asc'
  const users = [
    { id: 1, name: '张三', email: 'zhang@example.com', role: '管理员' },
    { id: 2, name: '李四', email: 'li@example.com', role: '编辑' },
  ]

  return (props) => {
    // 派生数据必须在 render 内计算（每次 render 读最新 $.keyword）
    const filtered = users.filter(u =>
      !$.keyword || u.name.includes($.keyword) || u.email.includes($.keyword)
    )

    return h('div', { class: 'wf-stack', style: { gap: 'var(--wf-space-md)' } },
      h('div', { class: 'wf-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
        h(SearchInput, { placeholder: '搜索用户...', value: $.keyword, onInput: (e: Event) => { $.keyword = (e.target as HTMLInputElement).value } }),
        h(Button, { variant: 'primary' }, '新建用户'),
      ),
      h(Table, {
        columns: [
          { key: 'id', label: 'ID', width: 60 },
          { key: 'name', label: '姓名', sortable: true },
          { key: 'email', label: '邮箱', sortable: true },
          { key: 'role', label: '角色' },
        ],
        data: filtered,
        sortKey: $.sortKey,
        sortOrder: $.sortOrder,
        onSort: (key, order) => { $.sortKey = key; $.sortOrder = order },
        emptyText: '无匹配用户',
      }),
      h(Pagination, { total: filtered.length, page: 1, pageSize: 10, onChange: (p: number) => {} }),
    )
  }
}
```

## 消息提示

```tsx
// 在任意组件中调用
let toastId = 0

function showToast(ctx: WfuiContext, type: ToastType, message: string) {
  // 通过 ctx 管理 Toast 列表
  const $ = ctx.ui.$()
  $.toasts = $.toasts ?? []
  const id = String(++toastId)
  $.toasts = [...$.toasts, { id, type, message }]

  // 自动消失
  if (type !== 'error') {
    setTimeout(() => {
      $.toasts = $.toasts.filter((t: any) => t.id !== id)
    }, 3000)
  }
}

// 页面中使用
const App = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.toasts = []

  return (props) =>
    h('div', {}, [
      h(Button, {
        onClick: () => showToast(ctx, 'success', '操作成功'),
      }, '显示提示'),
      h(Toast, {
        toasts: $.toasts,
        position: 'top-right',
        max: 3,
        onRemove: (id) => { $.toasts = $.toasts.filter((t: any) => t.id !== id) },
      }),
    ])
}
```

---

