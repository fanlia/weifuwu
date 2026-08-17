# ImageCropper · components

## 概述

图片裁剪——canvas 原生 API + 拖拽裁剪框 + 比例控制（零依赖）

## 典型场景

- office 文档/代码/内容编辑——xlsx/pptx/代码/公式/裁剪

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `src` | `string` | 是 |  |
| `aspect` | `number` | 否 | 裁剪比例（宽/高——默认 1） |
| `onCrop` | `(dataUrl: string) => void` | 否 |  |
| `onError` | `(err: Error) => void` | 否 |  |
| `className` | `string` | 否 |  |

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
| 源码 | `src/components/ImageCropper/ImageCropper.ts` |
| 样式 | `src/components/ImageCropper/ImageCropper.css` |
| 测试 | `src/components/ImageCropper/ImageCropper.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/editor/imagecropper` ——（P1 填充具体步骤）
