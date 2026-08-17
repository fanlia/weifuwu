# PinInput · components

## 概述

验证码输入：自动聚焦/粘贴分派/Backspace 回退（shadcn InputOTP）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `length` | `number` | 否 | 位数，默认 6 |
| `value` | `string` | 否 | 受控完整值（如 '483920'） |
| `onChange` | `(value: string) => void` | 否 |  |
| `type` | `'number' \| 'text'` | 否 | number = 纯数字（默认）；text = 任意字符 |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `disabled` | `boolean` | 否 |  |

## 用法示例

```tsx
<PinInput length={6} value={code}
  onChange={setCode} />
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
| 源码 | `src/components/PinInput/PinInput.ts` |
| 样式 | `src/components/PinInput/PinInput.css` |
| 测试 | `src/components/PinInput/PinInput.test.ts` |
| demo | `apps/showcase/src/demos/DemoPinInput.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/pininput` ——（P1 填充具体步骤）
