# Cascader · components

## 概述

级联选择：多列面板逐级推进（antd/EP Cascader）

## 典型场景

- 复杂数据交互——穿梭、树、级联、看板、流水线

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options` | `CascaderOption[]` | 否 |  |
| `value` | `string[]` | 否 | 选中路径（数组，如 ['zj','hz','xh']） |
| `onChange` | `(value: string[]) => void` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `error` | `string` | 否 |  |
| `label` | `string` | 否 |  |
| `showSearch` | `boolean` | 否 | 显示搜索框（面板内，关键词时扁平过滤结果列表） |
| `searchPlaceholder` | `string` | 否 | 搜索占位符 |

## 用法示例

```tsx
<Cascader options={regions}
  value={['zj','hz']} onChange={setPath} />
```

## 纪律/坑

- 受控纪律：受控 value 必须配回调——缺回调静默不可点
- 多选（multiple）已裁剪（低频——单选+搜索已够，见 components-cuts.md）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Cascader/Cascader.ts` |
| 样式 | `src/components/Cascader/Cascader.css` |
| 测试 | `src/components/Cascader/Cascader.test.ts` |
| demo | `apps/showcase/src/demos/DemoCascader.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/cascader` ——（P1 填充具体步骤）
