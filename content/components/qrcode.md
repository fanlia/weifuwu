# QRCode · components

## 概述

二维码：自研 QR 编码（Reed-Solomon + 8 掩码）零依赖 SVG

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 是 | 二维码内容（URL/文本） |
| `ecLevel` | `QrEcLevel` | 否 | 纠错级别，默认 M |
| `size` | `number` | 否 | 渲染尺寸（px），默认 128 |
| `quietZone` | `number` | 否 | 静默区模块数，默认 4 |
| `color` | `string` | 否 | 模块颜色，默认 currentColor |
| `bgColor` | `string` | 否 | 背景色（填充静默区），默认 transparent |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<QRCode value="https://weifuwu.dev" size={128} />
<QRCode value="..." color="#4f6ef7" />
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
| 源码 | `src/components/QRCode/QRCode.ts` |
| 测试 | `src/components/QRCode/QRCode.test.ts` |
| demo | `apps/showcase/src/demos/DemoQRCode.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/qrcode` ——（P1 填充具体步骤）
