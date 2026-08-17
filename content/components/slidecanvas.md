# SlideCanvas · components

## 概述

weifuwu/components/SlideCanvas — pptx 画布编辑器（ODES 事件流——阶段 3） 设计（design/office-events-plan.md）：文档 = fold(事件流)——每个编辑 =

## 典型场景

- office 文档/代码/内容编辑——xlsx/pptx/代码/公式/裁剪

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `deck` | `DeckState` | 是 | 受控 DeckState |
| `onChange` | `(deck: DeckState) => void` | 否 |  |
| `height` | `string` | 否 |  |
| `readonly` | `boolean` | 否 |  |

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
| 源码 | `src/components/SlideCanvas/SlideCanvas.ts` |
| 样式 | `src/components/SlideCanvas/SlideCanvas.css` |
| 测试 | `src/components/SlideCanvas/SlideCanvas.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/editor/slidecanvas` ——（P1 填充具体步骤）
