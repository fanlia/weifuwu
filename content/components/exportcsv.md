# ExportCSV · components

## 概述

数据导出 CSV——RFC 4180 转义 + BOM（Excel 兼容）零依赖

## 典型场景

- 数据展示——列表页、详情页、信息呈现

## API

> props 提取降级（接口格式特殊）——见源码：`src/client/components/ExportCSV/ExportCSV.ts`

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 三层一致（§6.3）：条件渲染 false 是空洞占位——数组项 key 由业务声明

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/ExportCSV/ExportCSV.ts` |
| 测试 | `src/client/components/ExportCSV/ExportCSV.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/display/exportcsv` ——（P1 填充具体步骤）
