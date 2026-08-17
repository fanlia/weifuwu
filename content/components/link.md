# Link · components

## 概述

文字链接：语义色/下划线/disabled/新窗口

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `href` | `string` | 否 |  |
| `variant` | `'default' \| 'primary' \| 'danger' \| 'muted'` | 否 |  |
| `underline` | `boolean` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `target` | `string` | 否 |  |
| `icon` | `any` | 否 |  |
| `onClick` | `(e: any) => void` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Link href="/docs" variant="primary">文档</Link>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[landing](../patterns/landing.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Link/Link.ts` |
| 样式 | `src/components/Link/Link.css` |
| 测试 | `src/components/Link/Link.test.ts` |
| demo | `apps/showcase/src/demos/DemoLink.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/link` ——（P1 填充具体步骤）
