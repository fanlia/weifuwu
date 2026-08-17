# 微交互统一清单（Micro-Interaction Spec）

> 状态：定稿（2026-08，plans/04-design-quality P1）
> 目的：交互反馈一致性——"每个可交互元素都有可预测的反馈"（微流明·可解释表面）。
> 原则：反馈 = 语义的可见表达（不做装饰性动画）；时长走 --wf-dur-*；reduced-motion 自动降级。

## 1. 状态链（所有可交互元素）

```
hover → focus-visible → active(pressed) → disabled
每态必须有可见反馈（audit 已强制 hover/键盘；pressed 由 --wf-state-pressed 层）
```

## 2. 元素级反馈规范

| 元素 | hover | pressed | focus | 备注 |
|------|-------|---------|-------|------|
| Button | 背景加深（--wf-color-bg-hover） | 背景再深 + translateY(0.5px) | focus-ring 双层 | 小按钮固定 min/max-height |
| 列表项（Menu/Tree/Table 行可点） | 背景 --wf-color-bg-hover | --wf-state-pressed | focus-ring | 点击反馈必须可见 |
| 卡片可点（clickable/hover） | 边框品牌色 + 阴影微抬升 | 压回 | focus-ring | hover 抬升 2px 以内 |
| 开关/复选框/单选 | 边框/背景加深 | 状态层 | focus-ring | 选中态切换有过渡（--wf-dur-fast） |
| 输入类 | 边框加深 | — | focus-ring + 边框品牌色 | 禁 hover 改变布局 |
| 标签（Tag/Badge 可点） | 背景加深 | pressed | focus-ring | — |
| 图标按钮 | 背景圆角块 --wf-color-bg-hover | pressed | focus-ring | 44px 命中区（移动端） |
| 导航项（Tabs/Menu/NavMenu） | 背景/下划线 | pressed | focus-ring | 激活态持续可见（--active） |

## 3. 过渡时长

| 场景 | 时长 | 曲线 |
|------|------|------|
| hover 背景/边框 | --wf-dur-fast（120ms） | --wf-ease-out |
| pressed 按压 | 无过渡（瞬时）或 80ms | — |
| 开关切换 | --wf-dur-fast | --wf-ease-out |
| 浮层进出 | --wf-dur-base（200ms） | enter: ease-out / exit: ease-in |
| 内容渐显（流式） | --wf-dur-base | --wf-ease-out |

## 4. 反馈缺失 = 缺陷（审查清单）

```
□ 可点击元素有 hover 反馈（无 hover 的登记豁免——P11-R38）
□ 可点击元素有 pressed 反馈（列表项/按钮/卡片）
□ 键盘可达元素有 focus 反馈（focus-ring 双层）
□ 切换类有状态过渡（非突变）
□ 禁用态视觉明确（opacity + 禁 cursor）
```

## 5. 落地

- audit 已强制：hover 完备 / focus-ring / 状态层 token / 动效 token
- 待补 audit：pressed 反馈抽查（P11-R38 扩展——列表项 pressed）
- 新组件：scaffold 设计语言检查清单含本节

## 6. 流式动效家族（微流明·进行态语言）

| 动效 | 用途 | 实现 |
|------|------|------|
| stream-in | AI 回复/流式列表逐段进入 | opacity 0→1 + translateY(4px→0) |
| thinking-pulse | 思考中呼吸（已有 ReasoningBlock） | opacity 0.5↔1 循环 |
| streaming-cursor | AI 输出 ▍ 闪烁 | 已有（ChatInput/AiChat） |
| progress-transparent | 进度可见（不转圈） | 进度条/百分比 |
