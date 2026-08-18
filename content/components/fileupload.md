# FileUpload · components

## 概述

文件上传，拖拽区 + 文件列表 + accept/maxSize

## 典型场景

- office 文档/代码/内容编辑——xlsx/pptx/代码/公式/裁剪

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `accept` | `string` | 否 |  |
| `multiple` | `boolean` | 否 |  |
| `maxSize` | `number` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `error` | `string` | 否 |  |
| `hint` | `string` | 否 |  |
| `value` | `File[]` | 否 |  |
| `onChange` | `(files: File[]) => void` | 否 |  |
| `uploading` | `boolean` | 否 | 上传中状态（父层驱动——组件不做 xhr，诚实裁剪） |
| `progress` | `number` | 否 | 上传进度 0-100（父层驱动） |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<FileUpload accept="image/*,.pdf"
  multiple maxSize={5242880}
  value={files}
  onChange={f => files = f} />
```

## 纪律/坑

> 内容编辑：textarea value 走 property（attribute 只是 defaultValue）；受控输入纪律

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/FileUpload/FileUpload.ts` |
| 样式 | `src/client/components/FileUpload/FileUpload.css` |
| 测试 | `src/client/components/FileUpload/FileUpload.test.ts` |
| demo | `apps/showcase/src/demos/DemoFileUpload.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/editor/fileupload` ——（P1 填充具体步骤）
