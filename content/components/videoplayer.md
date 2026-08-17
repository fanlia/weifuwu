# VideoPlayer · components

## 概述

视频播放器——原生 video 封装（controls/封面/宽高比/事件——零依赖）

## 典型场景

- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `src` | `string` | 是 |  |
| `poster` | `string` | 否 |  |
| `aspect` | `number` | 否 | 宽高比（默认 16/9） |
| `controls` | `boolean` | 否 |  |
| `autoPlay` | `boolean` | 否 |  |
| `loop` | `boolean` | 否 |  |
| `muted` | `boolean` | 否 |  |
| `onPlay` | `() => void` | 否 | 事件回调 |
| `onPause` | `() => void` | 否 |  |
| `onEnded` | `() => void` | 否 |  |
| `onError` | `(err: Error) => void` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/VideoPlayer/VideoPlayer.ts` |
| 样式 | `src/components/VideoPlayer/VideoPlayer.css` |
| 测试 | `src/components/VideoPlayer/VideoPlayer.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/core/videoplayer` ——（P1 填充具体步骤）
