# Accordion · components

## 概述

折叠面板，支持多个 items

## 典型场景

- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `AccordionItem[]` | 否 |  |
| `active` | `string[]` | 否 | 受控展开 keys |
| `onChange` | `(keys: string[]) => void` | 否 |  |
| `multiple` | `boolean` | 否 | true = 多开；默认 false 手风琴互斥（antd 对齐） |

## 用法示例

```tsx
<Accordion items={[
  {key:'a',title:'标题',
    content:<p>内容</p>},
]} />
```

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Accordion/Accordion.ts` |
| 样式 | `src/components/Accordion/Accordion.css` |
| 测试 | `src/components/Accordion/Accordion.test.ts` |
| demo | `apps/showcase/src/demos/DemoAccordion.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/accordion` ——（P1 填充具体步骤）
