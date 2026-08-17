# ImageCropper · components

## 概述

图片裁剪——canvas 原生 API + 拖拽裁剪框 + 比例控制（零依赖）

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

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
