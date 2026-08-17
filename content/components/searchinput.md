# SearchInput · components

## 概述

搜索输入框，带清除按钮

## 典型场景

- 页面模式：mobile、list-page（复制即用蓝本——examples/patterns/）
- 表单输入/搜索/筛选——查询区、编辑表单、设置页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `onInput` | `(e: Event) => void` | 否 |  |
| `onClear` | `() => void` | 否 |  |

## 用法示例

```tsx
<SearchInput value={query}
  onInput={e => query = e.target.value}
  onClear={() => query = ''} />
```

## 纪律/坑

> 受控输入纪律（§5.3）：输入期间 value 走内部态（useControlledInput）——依赖回流会重挂 input 丢焦点；IME composition 门控

## 关系

- ↑ 用于页面模式：[mobile](../patterns/mobile.md) · [list-page](../patterns/list-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/SearchInput/SearchInput.ts` |
| 样式 | `src/components/SearchInput/SearchInput.css` |
| 测试 | `src/components/SearchInput/SearchInput.test.ts` |
| demo | `apps/showcase/src/demos/DemoSearchInput.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/searchinput` ——（P1 填充具体步骤）
