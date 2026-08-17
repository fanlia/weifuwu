# Menu · components

## 概述

侧栏导航：分组 + 图标 + 选中态 + 方向键

## 典型场景

- 应用模板：admin、agent-platform（examples/apps/ 完整可跑）
- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `MenuItem[]` | 是 |  |
| `onSelect` | `(key: string) => void` | 否 |  |
| `activeKey` | `string` | 否 |  |
| `className` | `string` | 否 |  |
| `openKeys` | `string[]` | 否 | 受控展开 key 列表（子菜单） |
| `onOpenChange` | `(keys: string[]) => void` | 否 |  |
| `collapsible` | `boolean` | 否 | 可折叠侧栏（宽度收窄 + label 隐藏） |
| `collapsed` | `boolean` | 否 |  |
| `onCollapseChange` | `(collapsed: boolean) => void` | 否 |  |

## 用法示例

```tsx
<Menu items={[
  { key: 'agents', label: 'Agent 管理', icon: <Icon name="cpu" size={16} />, group: '工作台' },
  { key: 'settings', label: '设置', icon: <Icon name="settings" size={16} />, group: '系统' },
]} activeKey="agents" onSelect={k => setActive(k)} />
```

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[admin](../apps/admin.md) · [agent-platform](../apps/agent-platform.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Menu/Menu.ts` |
| 样式 | `src/components/Menu/Menu.css` |
| 测试 | `src/components/Menu/Menu.test.ts` |
| demo | `apps/showcase/src/demos/DemoMenu.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/menu` ——（P1 填充具体步骤）
