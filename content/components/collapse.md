# Collapse · components

## 概述

行内折叠：异步 loading + extra 操作区（区别于 Accordion）

## 典型场景

- 页面导航——侧栏、页头、标签页、步骤、分页

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

- 受控纪律（§5.2）：受控 activeKeys 必须配回调——缺回调静默不可点（console.warn 防护）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Collapse/Collapse.ts` |
| 样式 | `src/client/components/Collapse/Collapse.css` |
| 测试 | `src/client/components/Collapse/Collapse.test.ts` |
| demo | `apps/showcase/src/demos/DemoCollapse.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/collapse` ——（P1 填充具体步骤）
