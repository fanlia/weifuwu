# CitationCard · components

## 概述

RAG 引用来源：折叠「引用 N 条」+ 条目列表（序号/标题/来源/片段/链接）+ 溢出 +N

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `Citation[]` | 是 |  |
| `label` | `string` | 否 | 折叠头文案（默认「引用来源」） |
| `maxVisible` | `number` | 否 | 折叠时最多显示条数（默认 3；溢出显示 +N 汇总条目） |
| `defaultExpanded` | `boolean` | 否 | 初始展开（默认折叠） |
| `onOpen` | `(citation: Citation) => void` | 否 | 点击条目回调（提供时不渲染链接，由调用方处理跳转/打开） |

## 用法示例

```tsx
<CitationCard items={[{ id, title, source, snippet, url }]} maxVisible={3} />
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
| 源码 | `src/components/CitationCard/CitationCard.ts` |
| 样式 | `src/components/CitationCard/CitationCard.css` |
| 测试 | `src/components/CitationCard/CitationCard.test.ts` |
| demo | `apps/showcase/src/demos/DemoCitationCard.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/citationcard` ——（P1 填充具体步骤）
