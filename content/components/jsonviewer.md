# JSONViewer · components

## 概述

结构化 JSON：递归折叠 + 类型色 + 路径复制 + 懒展开

## 典型场景

- 数据展示——列表页、详情页、信息呈现

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `data` | `unknown` | 是 |  |
| `defaultExpandDepth` | `number` | 否 | 默认展开深度（默认 2）——更深折叠为摘要 |
| `maxKeys` | `number` | 否 | 对象键数超过该值时懒展开（只渲染前 N 个 + "+N 项"，默认 100） |
| `rootName` | `string` | 否 | 根键名（默认 'root'）——复制路径前缀 |
| `onCopy` | `(path: string, value: unknown) => void` | 否 | 复制路径回调（默认 navigator.clipboard 写入 JSON 路径） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<JSONViewer data={payload} defaultExpandDepth={2} maxKeys={100} />
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
| 源码 | `src/client/components/JSONViewer/JSONViewer.ts` |
| 样式 | `src/client/components/JSONViewer/JSONViewer.css` |
| 测试 | `src/client/components/JSONViewer/JSONViewer.test.ts` |
| demo | `apps/showcase/src/demos/DemoJSONViewer.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/jsonviewer` ——（P1 填充具体步骤）
