# ThemeSwitch · components

## 概述

主题切换：auto/light/dark，localStorage 持久化

## 典型场景

- 应用模板：admin、agent-platform（examples/apps/ 完整可跑）
- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | `ThemeMode` | 否 | 初始模式（默认从 localStorage 读取，无记录时为 auto） |
| `onChange` | `(mode: ThemeMode) => void` | 否 | 切换回调 |
| `storageKey` | `string` | 否 | localStorage 存储 key |
| `preset` | `PresetName` | 否 | 预设主题（可选——传了才渲染预设行；对应 layout `data-preset`） |
| `onPresetChange` | `(preset: PresetName) => void` | 否 | 预设切换回调 |

## 用法示例

```tsx
<ThemeSwitch />

<ThemeSwitch onChange={mode =>
  console.log(mode)} />  // auto | light | dark

{/* 预设主题行（可选）：minimal/compact/rounded，与暗色正交 */}
<ThemeSwitch preset="compact"
  onPresetChange={p =>
    console.log(p)} />

// 单值换肤：改 seed 一个值，色阶自动派生
:root {
  --wf-brand-seed: #7c3aed;
  --wf-dark-brand-seed: #a78bfa;  /* 暗色品牌（可选） */
}

// 命令式
import { applyTheme, getTheme } from 'weifuwu/components'
applyTheme('dark')
getTheme()  // 'auto' | 'light' | 'dark'

```

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[admin](../apps/admin.md) · [agent-platform](../apps/agent-platform.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/ThemeSwitch/ThemeSwitch.ts` |
| 样式 | `src/components/ThemeSwitch/ThemeSwitch.css` |
| 测试 | `src/components/ThemeSwitch/ThemeSwitch.test.ts` |
| demo | `apps/showcase/src/demos/DemoThemeSwitch.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/themeswitch` ——（P1 填充具体步骤）
