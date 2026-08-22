# FileTree · components

## 概述

文件树浏览器——面包屑 + 列表/编辑态 + 上传（受控——数据源无关）

## 典型场景

- office 文档/代码/内容编辑——xlsx/pptx/代码/公式/裁剪

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `entries` | `FileTreeEntry[]` | 否 | 当前目录条目（父层数据源驱动） |
| `path` | `string` | 否 | 当前目录路径（面包屑） |
| `loading` | `boolean` | 否 |  |
| `openFile` | `FileTreeOpenFile \| null` | 否 | 编辑态（非空 = 文件编辑中——列表替换为编辑器） |
| `editValue` | `string` | 否 | 编辑内容（受控） |
| `saving` | `boolean` | 否 |  |
| `emptyText` | `string` | 否 | 目录空态文案 |
| `onBack` | `() => void` | 否 | 编辑态返回列表 |
| `onOpenDir` | `(path: string) => void` | 否 |  |
| `onOpenFile` | `(path: string) => void` | 否 |  |
| `onSave` | `(content: string) => void` | 否 |  |
| `onEditChange` | `(value: string) => void` | 否 |  |
| `onUpload` | `(file: File) => void` | 否 | 上传（父层处理 File——组件只触发选择） |
| `onRefresh` | `() => void` | 否 |  |
| `accept` | `string` | 否 | 上传 accept（默认全部） |

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
| 源码 | `src/client/components/FileTree/FileTree.ts` |
| 样式 | `src/client/components/FileTree/FileTree.css` |
| 测试 | `src/client/components/FileTree/FileTree.test.ts` |
| demo | `apps/showcase/src/demos/DemoFileTree.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/editor/filetree` ——（P1 填充具体步骤）
