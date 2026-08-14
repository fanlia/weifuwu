# weifuwu/components 组件样式优化计划（2026-12）

> ## ✅ 已归档（2026-12）——全部实施
> P1：wf-btn--sm/lg/md 固定 min/max-height + line-height:1（§5.6 纪律防撑高——
> 浏览器实测 28px 固定）；Checkbox/Switch/Radio hover 轻反馈（border → primary）。
> P2：AlertGroup/ProgressBar/Scrollbar 裸 4px → var(--wf-radius-sm)。
> 验证：style-audit 45 + Button/Checkbox 19 + 浏览器实测（sm-btn 28px 固定）

> 目标：117 组件样式一致性——尺寸纪律/交互反馈/token 化。
> 审计基线：色值 100% var()（暗色安全）/ 动效时长 100% token（--wf-dur-*）/
> 全局 button focus-visible（_base.css）/ style-audit 45 绿。

## 确认缺口（审计发现）

| # | 优先级 | 缺口 | 现状 |
|---|---|---|---|
| 1 | P1 | **wf-btn--sm/lg 未固定 max-height**（§5.6 纪律：min/max 必须成对） | `min-height: 28px` 无 max——line-height 撑高风险（Tree checkbox/Carousel 圆点同款事故模式） |
| 2 | P1 | **Checkbox/Radio/Switch 无 hover 视觉反馈** | `cursor: pointer` 已有——无样式变化（可交互组件可感知性） |
| 3 | P2 | **裸圆角 4px**（AlertGroup） | `border-radius: 4px` 应引用 `--wf-radius-sm` |
| 4 | P3 | 裸字号（Avatar sm 11px 等） | 尺寸变体白名单内（audit 已放行）——不强制 token 化 |

## 实施

1. Button.css：`wf-btn--sm/lg` 加 `max-height`（与 min 相等——防内容撑高）+ `line-height: 1`
2. Checkbox/RadioGroup/Switch：label hover 轻反馈（`--wf-color-primary-bg` 背景或 border 变色——暗色安全）
3. AlertGroup.css：`4px` → `var(--wf-radius-sm)`
4. 复查：其他组件裸 4px 圆角 → token

## 验收

- style-audit 45 绿（新增样式合规）
- 组件 DOM 测试不破（Button/Checkbox 有测试）
- 浏览器抽查：小按钮高度固定 / checkbox hover 可见
