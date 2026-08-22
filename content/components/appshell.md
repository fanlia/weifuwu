# AppShell · components

应用壳（SaaS 侧栏布局）：品牌区 + 导航菜单 + 用户区 + 主内容区——认证守卫/导航/用户数据由父层驱动（受控——组件零 fetch 零路由依赖）。

> 来源：agent-platform AppLayout（侧栏壳——Menu/Avatar/Button 组装样板）沉淀——每个 SPA 应用的重复样板。样式复用 `weifuwu/layout` 的 app-shell 原语（grid 栅格 + 移动端降级），组件只补品牌区/用户区细节。

## 属性

| Prop | 类型 | 说明 |
|------|------|------|
| `nav` | `AppShellNavItem[]` | 导航菜单项（`{ key, label, icon?, group? }`——Menu 组件数据） |
| `path` | `string` | 当前路由路径（activeKey 匹配——`'/'` 精确，其余前缀） |
| `brand` | `{ name?, subtitle?, logo? }` | 品牌区（logo = Avatar 文本） |
| `user` | `{ name?, email? } \| null` | 用户信息（null = 未登录——父层守卫） |
| `onNavigate` | `(key: string) => void` | 菜单选择 → 父层 navigate |
| `onLogout` | `() => void` | 退出登录 |
| `onSettings` | `() => void` | 设置入口 |
| `loading` | `boolean` | 守卫加载态（骨架占位） |
| `children` | `any` | 主内容区 |
| `footer` | `any` | 自定义底部（覆盖用户区——高级场景） |
| `sidebarWidth` | `string` | 侧栏宽度（layout 变量——默认 240px） |

## 用法

```tsx
<AppShell
  nav={[
    { key: '/', label: '工作台', icon: h(Icon, { name: 'grid' }), group: '工作台' },
    { key: '/agents', label: 'Agent', icon: h(Icon, { name: 'cpu' }), group: '管理' },
  ]}
  path={currentPath}
  brand={{ name: 'Admin', subtitle: 'Multi-Tenant', logo: 'A' }}
  user={{ name: '张明', email: 'admin@demo.com' }}
  onNavigate={(k) => navigate(k)}
  onSettings={() => navigate('/settings')}
  onLogout={logout}
  loading={guarding}
>
  {page}
</AppShell>
```

## 状态约定（父层驱动）

```
守卫：user 为 null 时父层负责跳登录（组件只渲染用户区「未登录」）
导航：onNavigate(key) → 父层 navigate → 新 path prop → activeKey 更新
加载：loading=true 时用户区显示骨架（守卫判定中）
```

## 与 layout 原语的关系

- `wf-app-shell` grid 栅格 + 移动端降级由 `weifuwu/layout` 提供（`style.css`）
- 组件负责组装（品牌/菜单/用户区/主内容）——`wf-sidebar`/`wf-sidebar-header`/`wf-sidebar-body`/`wf-sidebar-footer`/`wf-main` 类名复用

## 源码

| 文件 | 路径 |
|------|------|
| 组件 | `src/client/components/AppShell/AppShell.ts` |
| 样式 | `src/client/components/AppShell/AppShell.css` |
| 测试 | `src/client/components/AppShell/AppShell.test.ts` |
| Demo | `/components/navigation/appshell` |
