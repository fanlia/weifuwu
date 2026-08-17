# MarkdownEditor · components

## 概述

分屏 Markdown 编辑器——textarea + 实时预览（复用 Markdown parser 零漂移）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 是 |  |
| `onChange` | `(value: string) => void` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `mode` | `'write' \| 'preview' \| 'split'` | 否 | 初始模式：'write' | 'preview' | 'split'（默认 split） |
| `rows` | `number` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/MarkdownEditor/MarkdownEditor.ts` |
| 样式 | `src/components/MarkdownEditor/MarkdownEditor.css` |
| 测试 | `src/components/MarkdownEditor/MarkdownEditor.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/editor/markdowneditor` ——（P1 填充具体步骤）
