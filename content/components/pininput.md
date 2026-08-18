# PinInput · components

## 概述

验证码输入：自动聚焦/粘贴分派/Backspace 回退（shadcn InputOTP）

## 典型场景

- 表单输入/搜索/筛选——查询区、编辑表单、设置页

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

> 受控输入纪律（§5.3）：输入期间 value 走内部态（useControlledInput）——依赖回流会重挂 input 丢焦点；IME composition 门控

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/PinInput/PinInput.ts` |
| 样式 | `src/client/components/PinInput/PinInput.css` |
| 测试 | `src/client/components/PinInput/PinInput.test.ts` |
| demo | `apps/showcase/src/demos/DemoPinInput.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/pininput` ——（P1 填充具体步骤）
