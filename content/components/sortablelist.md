# SortableList · components

## 概述

拖拽排序列表——useDragDrop 原语 + keyed 身份（任务/字段/配置排序）

## 典型场景

- 数据看板/统计报表——指标卡、图表、趋势

## API

> props 提取降级（接口格式特殊）——见源码：`src/components/SortableList/SortableList.ts`

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 图表自研 SVG：数据点 label 为轴名；交互 tooltip 经 usePopup（视口夹紧）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/SortableList/SortableList.ts` |
| 样式 | `src/components/SortableList/SortableList.css` |
| 测试 | `src/components/SortableList/SortableList.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/viz/sortablelist` ——（P1 填充具体步骤）
