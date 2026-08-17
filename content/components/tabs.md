# Tabs · components

## 概述

标签页切换，支持 active/onChange

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `TabItem[]` | 否 |  |
| `active` | `string` | 否 |  |
| `onChange` | `(key: string) => void` | 否 |  |

## 用法示例

```tsx
<Tabs items={[
  {key:'a',label:'详情',
    content:<p>...</p>},
]} active="a" onChange={fn} />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[workspace](../patterns/workspace.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：[multi](../apps/multi.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Tabs/Tabs.ts` |
| 样式 | `src/components/Tabs/Tabs.css` |
| 测试 | `src/components/Tabs/Tabs.test.ts` |
| demo | `apps/showcase/src/demos/DemoTabs.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/tabs` ——（P1 填充具体步骤）
