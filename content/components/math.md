# Math · components

## 概述

轻量公式渲染——自研 LaTeX 子集（上下标/分数/根号/希腊字母——零依赖不引 KaTeX）

## 典型场景

- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tex` | `string` | 是 | LaTeX 公式（如 'x^2 + \\frac{1}{2}'） |
| `className` | `string` | 否 |  |

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Math/Math.ts` |
| 样式 | `src/client/components/Math/Math.css` |
| 测试 | `src/client/components/Math/Math.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/core/math` ——（P1 填充具体步骤）
