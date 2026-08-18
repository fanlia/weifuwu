# Tabs · components

## 概述

标签页切换，支持 active/onChange

## 典型场景

- 页面模式：workspace、settings-page（复制即用蓝本——examples/patterns/）
- 应用模板：multi（examples/apps/ 完整可跑）
- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `TabItem[]` | 否 |  |
| `active` | `string` | 否 |  |
| `onChange` | `(key: string) => void` | 否 |  |
| `closable` | `boolean` | 否 | 可关闭 tab（浏览器标签类应用——关闭中间 tab 自动激活邻居） |
| `onClose` | `(key: string) => void` | 否 | 关闭回调（父负责从 items 移除；受控纪律：closable 必须配 onClose） |
| `addable` | `boolean` | 否 | 显示新增 + 按钮 |
| `onAdd` | `() => void` | 否 | 新增回调（父负责追加 items） |

## 用法示例

```tsx
<Tabs items={[
  {key:'a',label:'详情',
    content:<p>...</p>},
]} active="a" onChange={fn} />
```

## 纪律/坑

- 混合数组稳定 key：tabList+addBtn+ink 全 keyed——无 key 项退 unkeyed 位置配对（新增 tab 错位事故）
- closable 必须配 onClose / addable 必须配 onAdd（受控纪律——console.warn）

## 关系

- ↑ 用于页面模式：[workspace](../patterns/workspace.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：[multi](../apps/multi.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Tabs/Tabs.ts` |
| 样式 | `src/client/components/Tabs/Tabs.css` |
| 测试 | `src/client/components/Tabs/Tabs.test.ts` |
| demo | `apps/showcase/src/demos/DemoTabs.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/tabs` ——（P1 填充具体步骤）
