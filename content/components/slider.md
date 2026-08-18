# Slider · components

## 概述

范围滑块，支持 min/max/step/label

## 典型场景

- 表单输入/搜索/筛选——查询区、编辑表单、设置页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 |  |
| `value` | `number \| string \| [number, number]` | 否 | 单值模式 value；range 模式 [lo, hi]（传反自动纠正） |
| `min` | `number` | 否 |  |
| `max` | `number` | 否 |  |
| `step` | `number` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `range` | `boolean` | 否 | range 模式：双滑块区间（价格/日期/年龄筛选——三库标配） |
| `marks` | `SliderMark[]` | 否 | 刻度标记（轨道下方刻度线 + 可选文字标签） |
| `onChangeEnd` | `(value: number) => void` | 否 | 单值拖拽结束回调（pointerup） |
| `onChange` | `(value: number) => void` | 否 | 单值实时回调 |
| `onRangeChange` | `(value: [number, number]) => void` | 否 | range 实时回调（range 模式专用——类型独立防单值误用） |
| `onRangeChangeEnd` | `(value: [number, number]) => void` | 否 | range 拖拽结束回调 |

## 用法示例

```tsx
<Slider label="音量" value={volume}
  onChange={v => setVolume(v)} />  // 拖拽/hover/focus 显示当前值气泡

<Slider label="价格" value={800} min={0} max={2000} step={50}
  marks={[{ value: 0, label: '0' }, { value: 500 },
          { value: 1000 }, { value: 2000, label: '2000' }]}
  onChangeEnd={v => console.log('拖拽结束:', v)} />
```

## 纪律/坑

- 浏览器表单状态恢复（刷新/后退）覆盖受控 value——autocomplete=off + 内部 0-100 归一化刻度（2000 slider 刷新跳动事故）
- 拖拽中气泡位置冻结——usePopup 锚点恒定需 popup.refresh() 跟随 thumb

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Slider/Slider.ts` |
| 样式 | `src/client/components/Slider/Slider.css` |
| 测试 | `src/client/components/Slider/Slider.test.ts` |
| demo | `apps/showcase/src/demos/DemoSlider.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/slider` ——（P1 填充具体步骤）
