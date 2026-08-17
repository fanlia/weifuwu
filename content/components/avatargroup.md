# AvatarGroup · components

## 概述

头像组：堆叠 + max 溢出 +N

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/AvatarGroup/AvatarGroup.ts` |
| 样式 | `src/components/AvatarGroup/AvatarGroup.css` |
| 测试 | `src/components/AvatarGroup/AvatarGroup.test.ts` |
| demo | `apps/showcase/src/demos/DemoAvatarGroup.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/avatargroup` ——（P1 填充具体步骤）
