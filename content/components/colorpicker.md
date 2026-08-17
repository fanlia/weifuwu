# ColorPicker · components

## 概述

颜色选择：预设色板 + hex 输入（Popover 弹层）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 | 受控颜色值（hex，如 #4f6ef7） |
| `onChange` | `(value: string) => void` | 否 |  |
| `colors` | `string[]` | 否 | 预设色板（默认内置 10 色） |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `showInput` | `boolean` | 否 | 显示 hex 输入框（自由输入） |

## 用法示例

```tsx
<ColorPicker value={color} showInput
  onChange={setColor} />
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
| 源码 | `src/components/ColorPicker/ColorPicker.ts` |
| 样式 | `src/components/ColorPicker/ColorPicker.css` |
| 测试 | `src/components/ColorPicker/ColorPicker.test.ts` |
| demo | `apps/showcase/src/demos/DemoColorPicker.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/colorpicker` ——（P1 填充具体步骤）
