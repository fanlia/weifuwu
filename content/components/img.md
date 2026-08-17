# Img · components

## 概述

图片 \<img\> 组件：fallback / lazy / preview 点击放大

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `src` | `string` | 否 |  |
| `alt` | `string` | 否 |  |
| `fallback` | `string` | 否 |  |
| `loading` | `'lazy' \| 'eager'` | 否 |  |
| `width` | `number \| string` | 否 |  |
| `height` | `number \| string` | 否 |  |
| `className` | `string` | 否 |  |
| `style` | `Record<string, string>` | 否 |  |
| `preview` | `boolean` | 否 | 点击放大预览（对应 antd/EP Image preview） |
| `previewScale` | `number` | 否 | 预览缩放倍率，默认 1 |

## 用法示例

```tsx
<Img src="/photo.jpg" alt="照片" />
<Img src="/photo.jpg" fallback="/placeholder.png" />
<Img src="..." loading="lazy" width={200} />
<Img src="..." preview /> {/* 点击放大：Escape/遮罩关闭 */}
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Img/Img.ts` |
| 样式 | `src/components/Img/Img.css` |
| 测试 | `src/components/Img/Img.test.ts` |
| demo | `apps/showcase/src/demos/DemoImage.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/img` ——（P1 填充具体步骤）
