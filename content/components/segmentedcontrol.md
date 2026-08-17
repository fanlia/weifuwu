# SegmentedControl · components

## 概述

分段单选（模式切换/筛选/模板），支持 sm/block

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options` | `SegmentedOption[]` | 是 | 选项列表（label 可为字符串或任意 VNode） |
| `value` | `string` | 否 | 当前选中值 |
| `onChange` | `(value: string) => void` | 否 |  |
| `size` | `'sm' \| 'md'` | 否 |  |
| `block` | `boolean` | 否 | 撑满父容器宽度（选项等分） |
| `ariaLabel` | `string` | 否 |  |

## 用法示例

```tsx
<SegmentedControl
  value={mode}
  onChange={v => mode = v}
  options={[
    {value:'ai', label:'🤖 AI 生成'},
    {value:'manual', label:'手动编写'},
    {value:'template', label:'模板'},
  ]} />
{/* size="sm" 小尺寸 / block 等分 */}
<SegmentedControl size="sm" block ... />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[dashboard](../patterns/dashboard.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/SegmentedControl/SegmentedControl.ts` |
| 样式 | `src/components/SegmentedControl/SegmentedControl.css` |
| 测试 | `src/components/SegmentedControl/SegmentedControl.test.ts` |
| demo | `apps/showcase/src/demos/DemoSegmented.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/segmentedcontrol` ——（P1 填充具体步骤）
