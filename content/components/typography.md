# Typography · components

## 概述

Title/Text/Paragraph：语义标签 + 语义色 -text 变体 + mark/code/删除线

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `level` | `1 \| 2 \| 3 \| 4 \| 5` | 否 | 1-5，默认 1（h1-h5） |
| `children` | `any` | 否 |  |
| `className` | `string` | 否 |  |
| `style` | `Record<string, string>` | 否 |  |

## 用法示例

```tsx
<Title level={1}>标题</Title>
<Text type="secondary">次要</Text>
<Text type="danger">危险</Text>
<Text code>code</Text>
<Paragraph ellipsis>长文本</Paragraph>
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
| 源码 | `src/components/Typography/Typography.ts` |
| 样式 | `src/components/Typography/Typography.css` |
| 测试 | `src/components/Typography/Typography.test.ts` |
| demo | `apps/showcase/src/demos/DemoTypography.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/typography` ——（P1 填充具体步骤）
