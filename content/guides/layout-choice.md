# 布局选型指南（什么时候用哪个原语）

> 解决"会用原语但不会选"——布局决策树：骨架/分区/间距/定位/响应式。
> 与 [页面组装](page-building.md) 配合：本页决定"用什么"，组装决定"怎么搭"。

## 1. 能力光谱（选型总原则）

```
从组合层往下找——Table 能解决不自己拼：
  组合层    Table / Form / Descriptions / StatCard    （开箱即用——优先）
  命名层    Grid / Space / Typography / Card          （有 API 有语义）
  裸原语    wf-grid / wf-gap-* / wf-text-*            （自由但无约定——兜底）
```

## 2. 决策树

```
页面骨架？
├─ 有侧栏+顶栏 → wf-app-shell（patterns/app-shell 蓝本）或 Layout 组件
├─ 独立定宽页 → wf-container（--wf-max 控制宽度）
└─ 全屏/无壳 → 直接 wf-stack / wf-fill

内容分区？
├─ 纵向堆叠 → wf-stack（页面默认）
├─ 横向排列 → wf-row（按钮组/表单行）
├─ 响应式网格 → wf-grid（--wf-cols: repeat(auto-fit, minmax(...))）
├─ 两栏固定比例 → wf-split（--wf-split-ratio）
└─ 居中专区 → wf-center（hero/空态/认证）

间距？
├─ 区域间 → wf-gap-lg / wf-gap-md（stack/row 的 --wf-gap）
├─ 元素内 → wf-p-*（卡片内边距）
└─ 标题留白 → wf-mb-*（仅 margin-bottom 用 m-，其余用 gap）

定位/层级？
├─ 吸顶 → wf-sticky（页面级）或 Affix 组件（滚动跟随）
├─ 悬浮按钮 → FloatButton 组件
├─ 角标覆盖 → wf-layer + wf-pop（容器内定位）
└─ 弹层 → 组件（openPopup 命令式——禁手写定位）

响应式？
├─ 隐藏/显示 → wf-hidden / wf-hidden@lg / wf-flex@lg
├─ 网格列数 → --wf-cols 的 auto-fit/auto-fill（窄屏自动收）
└─ 表格 → Table minWidth + 横向滚动
```

## 3. 组件 vs 原语的边界（5 个重叠组件的分工）

| 场景 | 用原语 | 用组件 |
|------|--------|--------|
| 简单响应式网格 | wf-grid | Grid（24 栅格/列偏移——antd 迁移心智） |
| 简单间距 | wf-gap-* | Space（split 分隔符/方向控制） |
| 纯分隔线 | wf-border-t | Divider（带文字/vertical） |
| 简单字号 | wf-text-* | Typography（语义标签/mark/code） |
| 普通滚动容器 | wf-scroll | Scrollbar（自定义滚动条外观） |

## 4. 布局纪律（红线）

```
□ 布局结构只用 wf-* 原语（零手写 CSS）
□ 先查框架再动手（layout 原语 + 组件 + patterns——三层都查过再自研）
□ 间距走 token 阶梯（--wf-space-* 派生类——不用魔数）
□ 新功能先查 wf-* 是否已覆盖（如吸顶：页面级 wf-sticky / 嵌套容器 Affix）
```
