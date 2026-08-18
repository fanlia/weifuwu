# CodeEditor · components

## 概述

轻量代码编辑器——textarea + 行号 + Tab 缩进（零依赖，不引 Monaco）

## 典型场景

- office 文档/代码/内容编辑——xlsx/pptx/代码/公式/裁剪

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 是 |  |
| `onChange` | `(value: string) => void` | 否 |  |
| `lang` | `'ts' \| 'tsx' \| 'js' \| 'css' \| 'json' \| 'md' \| 'text'` | 否 |  |
| `rows` | `number` | 否 |  |
| `readOnly` | `boolean` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 内容编辑：textarea value 走 property（attribute 只是 defaultValue）；受控输入纪律

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/CodeEditor/CodeEditor.ts` |
| 样式 | `src/client/components/CodeEditor/CodeEditor.css` |
| 测试 | `src/client/components/CodeEditor/CodeEditor.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/editor/codeeditor` ——（P1 填充具体步骤）
