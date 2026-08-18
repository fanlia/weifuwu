# ColorPicker · components

## 概述

颜色选择：预设色板 + hex 输入（Popover 弹层）

## 典型场景

- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

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

> 弹窗纪律（§5.4）：浮层必须 createPortal 渲染（#__wf_portal）——禁 absolute 相对父容器（overflow/transform 裁剪）；统一走 ctx.ui.usePopup

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/ColorPicker/ColorPicker.ts` |
| 样式 | `src/client/components/ColorPicker/ColorPicker.css` |
| 测试 | `src/client/components/ColorPicker/ColorPicker.test.ts` |
| demo | `apps/showcase/src/demos/DemoColorPicker.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/colorpicker` ——（P1 填充具体步骤）
