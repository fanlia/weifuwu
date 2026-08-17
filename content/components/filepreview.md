# FilePreview · components

## 概述

文件预览（md/html/pdf/office）——基于事件流，可编辑

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `FileType` | 否 | 文件类型（缺省按 fileName/url 扩展名自动探测） |
| `content` | `string` | 否 | md/html/text 内容（直接传入）；pdf/office 用 url |
| `url` | `string` | 否 | pdf/office 文件 URL（或 html 远程加载） |
| `fileName` | `string` | 否 |  |
| `editable` | `boolean` | 否 | md/text：切换 Editor（复用事件流事务层——编辑/撤销/时光机/AI） |
| `ai` | `EditorAiOptions` | 否 | 编辑模式 AI 协作（透传 Editor） |
| `onSave` | `(content: string, type: 'md' \| 'text') => void` | 否 | 编辑保存回调（md/text 序列化回写） |
| `height` | `string` | 否 | 内容高度 |

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
| 源码 | `src/components/FilePreview/FilePreview.ts` |
| 样式 | `src/components/FilePreview/FilePreview.css` |
| 测试 | `src/components/FilePreview/FilePreview.test.ts` |
| demo | `apps/showcase/src/demos/DemoFilePreview.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/editor/filepreview` ——（P1 填充具体步骤）
