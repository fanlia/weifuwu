# Markdown · components

## 概述

AI 回复渲染：安全子集 parser + 代码块 + 链接白名单

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `string` | 是 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Markdown content={"# 标题

**粗体** 与 `code`

- 列表项

[链接](https://weifuwu.dev)"} />
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
| 源码 | `src/components/Markdown/Markdown.ts` |
| 样式 | `src/components/Markdown/Markdown.css` |
| 测试 | `src/components/Markdown/Markdown.test.ts` |
| demo | `apps/showcase/src/demos/DemoMarkdown.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/markdown` ——（P1 填充具体步骤）
