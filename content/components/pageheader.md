# PageHeader · components

## 概述

页面标题栏，支持 sub + 右侧操作区 + display 大标题

## 典型场景

- 页面模式：app-shell、dashboard、list-page、detail-page、settings-page（复制即用蓝本——examples/patterns/）
- 应用模板：todo（examples/apps/ 完整可跑）
- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 是 |  |
| `sub` | `string` | 否 |  |
| `display` | `boolean` | 否 | 顶级页面大标题（display 档 30px），默认 21px |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<PageHeader title="用户管理" sub="管理平台所有用户的账号、角色与权限">
  <Button size="sm" variant="primary">新建用户</Button>
  <Button size="sm">导出</Button>
</PageHeader>
<PageHeader display title="大标题模式" />
```

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [dashboard](../patterns/dashboard.md) · [list-page](../patterns/list-page.md) · [detail-page](../patterns/detail-page.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：[todo](../apps/todo.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/PageHeader/PageHeader.ts` |
| 样式 | `src/components/PageHeader/PageHeader.css` |
| 测试 | `src/components/PageHeader/PageHeader.test.ts` |
| demo | `apps/showcase/src/demos/DemoPageHeader.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/pageheader` ——（P1 填充具体步骤）
