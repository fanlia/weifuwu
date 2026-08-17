# AutoComplete 禁用态 · components

## 概述

disabled 时不可输入（状态矩阵覆盖）

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<AutoComplete options={[{value:'pay-admin',label:'支付平台管理'},{value:'order-center',label:'订单中心'}]}
  value="" disabled placeholder="禁用时不可输入" />
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
| demo | `apps/showcase/src/demos/DemoAutoCompleteDis.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/autocomplete-v2` ——（P1 填充具体步骤）
