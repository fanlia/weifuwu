# Title · components

## 概述

标题排版（语义标签 + 语义色 -text 变体）——Typography 家族

## 典型场景

- 页面模式：docs、dashboard、landing（复制即用蓝本——examples/patterns/）
- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `level` | `1 \| 2 \| 3 \| 4 \| 5` | 否 | 1-5，默认 1（h1-h5） |
| `children` | `any` | 否 |  |
| `className` | `string` | 否 |  |
| `style` | `Record<string, string>` | 否 |  |

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：[docs](../patterns/docs.md) · [dashboard](../patterns/dashboard.md) · [landing](../patterns/landing.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Typography/Typography.ts` |
| 样式 | `src/components/Typography/Typography.css` |
| 测试 | `src/components/Typography/Typography.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/core/title` ——（P1 填充具体步骤）
