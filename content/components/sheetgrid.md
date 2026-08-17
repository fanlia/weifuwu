# SheetGrid · components

## 概述

weifuwu/components/SheetGrid — xlsx 网格编辑器（ODES 事件流底座） 设计（design/office-events-plan.md）：文档 = fold(事件流)——SheetGrid 的每个

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/SheetGrid/SheetGrid.ts` |
| 样式 | `src/components/SheetGrid/SheetGrid.css` |
| 测试 | `src/components/SheetGrid/SheetGrid.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/editor/sheetgrid` ——（P1 填充具体步骤）
