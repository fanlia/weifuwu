# AlertGroup · components

## 概述

通知合并组：≥3 条折叠为 +N，点击展开

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `AlertGroupItem[]` | 是 |  |
| `onClose` | `(id: string) => void` | 否 |  |

## 用法示例

```tsx
<AlertGroup items={alerts} />
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
| 源码 | `src/components/AlertGroup/AlertGroup.ts` |
| 样式 | `src/components/AlertGroup/AlertGroup.css` |
| 测试 | `src/components/AlertGroup/AlertGroup.test.ts` |
| demo | `apps/showcase/src/demos/DemoAlertGroup.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/feedback/alertgroup` ——（P1 填充具体步骤）
