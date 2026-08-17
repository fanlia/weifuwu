# PromptTemplate · components

## 概述

提示词模板编辑器——变量 chips 插入 + 实时预览填充（AI 场景痛点）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 | 模板文本（受控） |
| `onChange` | `(value: string) => void` | 否 |  |
| `variables` | `PromptTemplateVariable[]` | 否 | 变量定义（chips 行——点击插入） |
| `values` | `Record<string, string>` | 否 | 变量值（预览填充用——缺失的变量保持占位） |
| `readOnly` | `boolean` | 否 | 只读（预览场景） |
| `label` | `string` | 否 |  |
| `showPreview` | `boolean` | 否 | 预览区显示开关（默认开） |
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
| 源码 | `src/components/PromptTemplate/PromptTemplate.ts` |
| 样式 | `src/components/PromptTemplate/PromptTemplate.css` |
| 测试 | `src/components/PromptTemplate/PromptTemplate.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/ai/prompttemplate` ——（P1 填充具体步骤）
