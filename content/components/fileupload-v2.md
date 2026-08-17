# FileUpload 禁用 · components

## 概述

disabled + accept 限定（状态矩阵覆盖）

## 典型场景

- office 文档/代码/内容编辑——xlsx/pptx/代码/公式/裁剪

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<FileUpload accept="image/*" multiple disabled error />
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
| demo | `apps/showcase/src/demos/DemoFileUploadDis.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/editor/fileupload-v2` ——（P1 填充具体步骤）
