# SegmentedControl · components

## 概述

分段单选（模式切换/筛选/模板），支持 sm/block

## 典型场景

- 页面模式：dashboard（复制即用蓝本——examples/patterns/）
- 表单输入/搜索/筛选——查询区、编辑表单、设置页

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

> 受控输入纪律（§5.3）：输入期间 value 走内部态（useControlledInput）——依赖回流会重挂 input 丢焦点；IME composition 门控

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
