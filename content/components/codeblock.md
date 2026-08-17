# CodeBlock · components

## 概述

代码块：语言标签 + 复制按钮 + 横向滚动

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | `string` | 是 |  |
| `lang` | `string` | 否 |  |
| `title` | `string` | 否 |  |

## 用法示例

```tsx
<CodeBlock lang="ts" title="示例.ts" code={...} />
{/* 复制按钮 + 语言标签 + 横向滚动 */}
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[workspace](../patterns/workspace.md) · [docs](../patterns/docs.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/CodeBlock/CodeBlock.ts` |
| 样式 | `src/components/CodeBlock/CodeBlock.css` |
| 测试 | `src/components/CodeBlock/CodeBlock.test.ts` |
| demo | `apps/showcase/src/demos/DemoCodeBlock.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/codeblock` ——（P1 填充具体步骤）
