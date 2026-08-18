# Avatar · components

## 概述

头像（首字母/图片），3 种 size

## 典型场景

- 页面模式：landing、mobile（复制即用蓝本——examples/patterns/）
- 应用模板：admin（examples/apps/ 完整可跑）
- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 否 |  |
| `src` | `string` | 否 |  |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `color` | `string` | 否 | 指定背景色（覆盖按名字哈希的颜色），如按类型着色：user=蓝 / ai=紫 |

## 用法示例

```tsx
<Avatar name="张三" />
<Avatar size="sm" />
<Avatar src="/photo.jpg" />
```

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：[landing](../patterns/landing.md) · [mobile](../patterns/mobile.md)
- ↑ 用于应用：[admin](../apps/admin.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Avatar/Avatar.ts` |
| 样式 | `src/client/components/Avatar/Avatar.css` |
| 测试 | `src/client/components/Avatar/Avatar.test.ts` |
| demo | `apps/showcase/src/demos/DemoAvatar.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/avatar` ——（P1 填充具体步骤）
