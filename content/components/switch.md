# Switch · components

## 概述

开关切换，视觉替代 checkbox

## 典型场景

- 页面模式：dashboard、settings-page（复制即用蓝本——examples/patterns/）
- 表单输入/搜索/筛选——查询区、编辑表单、设置页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 |  |
| `checked` | `boolean` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `onChange` | `(checked: boolean) => void` | 否 |  |

## 用法示例

```tsx
<Switch label="启用"
  checked={notify}
  onChange={v => notify = v} />
```

## 纪律/坑

> 受控输入纪律（§5.3）：输入期间 value 走内部态（useControlledInput）——依赖回流会重挂 input 丢焦点；IME composition 门控

## 关系

- ↑ 用于页面模式：[dashboard](../patterns/dashboard.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Switch/Switch.ts` |
| 样式 | `src/client/components/Switch/Switch.css` |
| 测试 | `src/client/components/Switch/Switch.test.ts` |
| demo | `apps/showcase/src/demos/DemoSwitch.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/switch` ——（P1 填充具体步骤）
