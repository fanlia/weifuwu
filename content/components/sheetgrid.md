# SheetGrid · components

## 概述

weifuwu/components/SheetGrid — xlsx 网格编辑器（ODES 事件流底座） 设计（design/office-events-plan.md）：文档 = fold(事件流)——SheetGrid 的每个

## 典型场景

- office 文档/代码/内容编辑——xlsx/pptx/代码/公式/裁剪

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workbook` | `WorkbookState` | 是 | 受控工作簿（FilePreview 传入——编辑经 onChange 回写） |
| `onChange` | `(wb: WorkbookState) => void` | 否 |  |
| `height` | `string` | 否 | AI 公式（SSE wf: 协议——选中单元格 → 建议 → 接受 commit） |
| `readonly` | `boolean` | 否 | 关闭编辑（只读展示） |

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
| 源码 | `src/client/components/SheetGrid/SheetGrid.ts` |
| 样式 | `src/client/components/SheetGrid/SheetGrid.css` |
| 测试 | `src/client/components/SheetGrid/SheetGrid.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/editor/sheetgrid` ——（P1 填充具体步骤）
