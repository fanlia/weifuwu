# Layout · components

## 概述

布局外壳：Sider 折叠 + Header/Content/Footer 骨架（antd Layout / shadcn Sidebar 等价）

## 典型场景

- 应用模板：admin（examples/apps/ 完整可跑）
- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `style` | `any` | 否 |  |
| `className` | `string` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Layout>
  <LayoutSider collapsible collapsed onCollapse={setCollapsed}>导航</LayoutSider>
  <Layout>
    <LayoutHeader>顶部</LayoutHeader>
    <LayoutContent>主区</LayoutContent>
    <LayoutFooter>底部</LayoutFooter>
  </Layout>
</Layout>
```

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[admin](../apps/admin.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Layout/Layout.ts` |
| 样式 | `src/client/components/Layout/Layout.css` |
| 测试 | `src/client/components/Layout/Layout.test.ts` |
| demo | `apps/showcase/src/demos/DemoLayout.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/layout` ——（P1 填充具体步骤）
