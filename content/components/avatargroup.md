# AvatarGroup · components

## 概述

头像组：堆叠 + max 溢出 +N

## 典型场景

- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `AvatarGroupItem[]` | 是 |  |
| `max` | `number` | 否 |  |
| `size` | `AvatarProps['size']` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<AvatarGroup items={[{ name: '张三' }, { name: '李四' }]} max={3} />
```

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/AvatarGroup/AvatarGroup.ts` |
| 样式 | `src/client/components/AvatarGroup/AvatarGroup.css` |
| 测试 | `src/client/components/AvatarGroup/AvatarGroup.test.ts` |
| demo | `apps/showcase/src/demos/DemoAvatarGroup.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/avatargroup` ——（P1 填充具体步骤）
