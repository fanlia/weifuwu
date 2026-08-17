# Slider · components

## 概述

范围滑块，支持 min/max/step/label

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 |  |
| `value` | `number \| string` | 否 |  |
| `min` | `number` | 否 |  |
| `max` | `number` | 否 |  |
| `step` | `number` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `marks` | `SliderMark[]` | 否 | 刻度标记（轨道下方刻度线 + 可选文字标签） |
| `onChangeEnd` | `(value: number) => void` | 否 | 拖拽结束回调（pointerup） |
| `onChange` | `(value: number) => void` | 否 |  |

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Slider/Slider.ts` |
| 样式 | `src/components/Slider/Slider.css` |
| 测试 | `src/components/Slider/Slider.test.ts` |
| demo | `apps/showcase/src/demos/DemoSlider.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/slider` ——（P1 填充具体步骤）
