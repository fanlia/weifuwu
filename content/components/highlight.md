# Highlight · components

## 概述

搜索词高亮：分词渲染 mark，大小写不敏感

## 典型场景

- 数据展示——列表页、详情页、信息呈现

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 |  |
| `query` | `string \| string[]` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Highlight text="搜索 张三 的订单" query={['张三']} />
```

## 纪律/坑

> 三层一致（§6.3）：条件渲染 false 是空洞占位——数组项 key 由业务声明

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Highlight/Highlight.ts` |
| 样式 | `src/components/Highlight/Highlight.css` |
| 测试 | `src/components/Highlight/Highlight.test.ts` |
| demo | `apps/showcase/src/demos/DemoHighlight.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/highlight` ——（P1 填充具体步骤）
