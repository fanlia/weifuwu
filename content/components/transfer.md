# Transfer · components

## 概述

穿梭框：双列表 + 选中移动（antd/EP Transfer）

## 典型场景

- 复杂数据交互——穿梭、树、级联、看板、流水线

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `data` | `TransferItem[]` | 否 |  |
| `targetKeys` | `string[]` | 否 | 目标侧已选 keys |
| `onChange` | `(targetKeys: string[]) => void` | 否 |  |
| `titles` | `[string, string]` | 否 |  |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `showSearch` | `boolean` | 否 | 显示搜索框（每侧独立过滤，内部态） |
| `searchPlaceholder` | `string` | 否 | 搜索占位符 |

## 用法示例

```tsx
<Transfer data={members}
  targetKeys={selected} onChange={setSelected} />
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
| 源码 | `src/client/components/Transfer/Transfer.ts` |
| 样式 | `src/client/components/Transfer/Transfer.css` |
| 测试 | `src/client/components/Transfer/Transfer.test.ts` |
| demo | `apps/showcase/src/demos/DemoTransfer.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/transfer` ——（P1 填充具体步骤）
