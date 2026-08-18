# Tag · components

## 概述

标签，支持 closable/onClose

## 典型场景

- 页面模式：docs、list-page、detail-page（复制即用蓝本——examples/patterns/）
- 应用模板：todo、admin、multi（examples/apps/ 完整可跑）
- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `closable` | `boolean` | 否 |  |
| `onClose` | `() => void` | 否 |  |
| `variant` | `'default' \| 'primary' \| 'success' \| 'danger'` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Tag>标签</Tag>
<Tag variant="primary" />
<Tag closable>可关闭</Tag>
```

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：[docs](../patterns/docs.md) · [list-page](../patterns/list-page.md) · [detail-page](../patterns/detail-page.md)
- ↑ 用于应用：[todo](../apps/todo.md) · [admin](../apps/admin.md) · [multi](../apps/multi.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Tag/Tag.ts` |
| 样式 | `src/client/components/Tag/Tag.css` |
| 测试 | `src/client/components/Tag/Tag.test.ts` |
| demo | `apps/showcase/src/demos/DemoTag.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/tag` ——（P1 填充具体步骤）
