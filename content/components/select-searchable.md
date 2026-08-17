# Select (searchable) · components

## 概述

搜索过滤下拉，输入即搜

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<Select label="角色" value={role}
  onChange={v => role = v}
  options={[
    {value:'admin',label:'管理员'},
  ]} />
{/* searchable 搜索过滤 */}
<Select searchable
  options={options}
  onChange={v => setVal(v)} />
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
| demo | `apps/showcase/src/demos/DemoSearchableSelect.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/select-searchable` ——（P1 填充具体步骤）
