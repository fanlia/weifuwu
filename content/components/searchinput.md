# SearchInput · components

## 概述

搜索输入框，带清除按钮

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

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
