# Collapse · components

## 概述

行内折叠：异步 loading + extra 操作区（区别于 Accordion）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `CollapseItem[]` | 否 |  |
| `active` | `string[]` | 否 | 受控展开 keys |
| `onChange` | `(keys: string[]) => void` | 否 |  |
| `multiple` | `boolean` | 否 | false = 手风琴互斥（同一时间只开一个）；默认 true 多开 |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Collapse items={[{key:'1',title:'标题',content:'内容',loading}]}
  active={['1']} />
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
| 源码 | `src/components/Collapse/Collapse.ts` |
| 样式 | `src/components/Collapse/Collapse.css` |
| 测试 | `src/components/Collapse/Collapse.test.ts` |
| demo | `apps/showcase/src/demos/DemoCollapse.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/collapse` ——（P1 填充具体步骤）
