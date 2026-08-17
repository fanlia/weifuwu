# 页面组装方法论（从零搭一个页面）

> 解决"我会组件、会原语，但打开编辑器不知道第一行写什么"。
> 与 [布局选型](layout-choice.md) 配合：选型决定"用什么"，本页决定"怎么搭"。
> 前提：先查 patterns（`content/patterns/*.md`）——有现成蓝本直接复制，
> 本方法论用于"没有蓝本时从零搭"。

## 1. 页面解剖学（页面 = 五层）

```
骨架层     页面的大形状：wf-app-shell（壳）/ wf-container（定宽）/ wf-stack（纵列）
分区层     区域划分：header / content / footer / sider（用 row/stack 组合）
内容层     组件就位：Table/Form/Card…（组件文档查 API）
间距层     呼吸感：wf-gap-* / wf-p-*（间距工具）
响应式层   多设备：wf-hidden@lg / 断点变体（布局降级）
```

## 2. 组装 5 步套路（固定流程，不是自由发挥）

```
① 定骨架：这个页面是"壳内页面"（有侧栏/顶栏 → app-shell 已存在）还是
   "独立页面"（→ wf-container + wf-stack）？
② 划分区：从上到下/从左到右画出区域（header 标题区 / 主体区 / 底部操作区）
③ 填内容：每个区域放什么组件（标题 → PageHeader；列表 → Table；表单 → Form）
④ 调间距：区域间 wf-gap-lg、卡片内 wf-gap-sm、标题下 wf-mb-*
⑤ 响应式：窄屏时哪些隐藏（wf-hidden@lg）、哪些堆叠（grid 列数自适应）
```

## 3. 完整示例：从零搭"订单详情页"（逐步）

### 第 1 步：定骨架（独立页面——container + stack）

```tsx
return (
  <div class="wf-container wf-stack" style="--wf-max:960px;--wf-gap:16px;padding:24px 16px">
    {/* 分区占位 */}
  </div>
)
```

### 第 2 步：划分区 + 第 3 步：填内容

```tsx
// ① 标题区：PageHeader（标题 + 状态 Tag + 操作按钮）
<PageHeader title={`订单 ${id}`} sub="客户：张伟">
  <Button variant="primary">导出</Button>
</PageHeader>

// ② 主体区：Descriptions（详情字段栅格）
<Descriptions items={[{ label: '订单号', value: id }, { label: '金额', value: '¥3,200' }]} bordered />

// ③ 历史区：Timeline（执行流）
<Timeline items={[{ key: '1', title: '已支付', time: '08-12 09:15' }]} />
```

### 第 4 步：调间距（gap 阶梯）

```tsx
// 区域间 gap-lg（16px）已有（骨架 --wf-gap:16px）
// 卡片内紧凑 gap-sm、标题下留白 wf-mb-sm
<Card>
  <div class="wf-text-bold wf-mb-sm">补充信息</div>
  <div class="wf-stack wf-gap-xs">…</div>
</Card>
```

### 第 5 步：响应式降级

```tsx
// 双栏 → 窄屏单栏（grid auto-fit）
<div class="wf-grid" style="--wf-cols:repeat(auto-fit,minmax(min(100%,300px),1fr))">
  <Card>补充信息</Card><Card>执行历史</Card>
</div>
```

**完整成品**：`examples/patterns/DetailPage.tsx`（本示例的落地版——5 步的每一步都可在源码中对应）。

## 4. 常见页面的搭法速查

| 页面类型 | 骨架 | 分区 | 核心组件 |
|---------|------|------|---------|
| 列表页 | container+stack | 标题区/表格区/分页区 | PageHeader + SearchInput + Table + Pagination |
| 详情页 | container+stack | 标题区/详情区/历史区 | PageHeader + Descriptions + Timeline |
| 设置页 | container+stack | 标题区/分区 Tabs | PageHeader + Tabs + Form + Switch |
| 表单页 | container+stack | 标题区/表单区/操作区 | PageHeader + Form + Field + Button |
| 仪表盘 | container+stack | KPI 行/图表区/表格区 | StatCard + Chart + Table |

（每种都有对应 patterns 蓝本——`content/patterns/*.md`）

## 5. 纪律（搭页面时的红线）

```
□ 布局结构只用 wf-* 原语（不手写 CSS/内联 style 自定义）
□ 内容元素用组件（不裸 div/span 手搓结构）
□ 间距走 wf-gap-*/wf-p-*（不用魔数 px）
□ 图标用 Icon 组件（禁 emoji 装饰）
□ 先查 patterns——重复造轮子是最常见的浪费
```
