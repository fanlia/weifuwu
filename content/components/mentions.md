# Mentions · components

## 概述

@提及：composition 抑制 + 过滤插入（antd Mentions）

## 典型场景

- 复杂数据交互——穿梭、树、级联、看板、流水线

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 |  |
| `onChange` | `(value: string) => void` | 否 |  |
| `options` | `MentionsOption[]` | 否 |  |
| `prefix` | `string` | 否 | 触发字符，默认 '@' |
| `placeholder` | `string` | 否 |  |
| `rows` | `number` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |

## 用法示例

```tsx
<Mentions options={[{value:'alice',label:'Alice'}]}
  value={text} onChange={setText} />
```

## 纪律/坑

> （该分类暂无通用纪律——组件级事故见源码注释）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Mentions/Mentions.ts` |
| 样式 | `src/components/Mentions/Mentions.css` |
| 测试 | `src/components/Mentions/Mentions.test.ts` |
| demo | `apps/showcase/src/demos/DemoMentions.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/mentions` ——（P1 填充具体步骤）
