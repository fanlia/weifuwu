# weifuwu 设计语言与主题体系优化计划（Design Language & Theming Plan）

> **状态**：🔄 实施中（2026-12）——P0-P3 已完成（见 §7 勾选）；P4-P5 待做
> **目标**：① 开发者配置主题**简单**（一个值换肤、预设主题开箱即用）；
> ② 用户（终端使用者）体验**专业**（状态反馈完整、层级清晰、动效克制）；
> ③ 参考著名开源前端框架设计语言，沉淀 **weifuwu 自己的设计语言**。

---

## 1. 现状盘点（2026-12 实测基线）

| 资产 | 现状 | 缺口 |
|------|------|------|
| Token | 167 个双层（原始层 + 语义层 + `--wf-dark-*` 暗色间接层），`_tokens.css` 单文件 | **品牌换色要覆盖 6 个变量**（`--wf-brand-500/600/700/50` + dark 三档）——不简单 |
| 主题激活 | `data-theme="dark"` + `@media (prefers-color-scheme)` 双段；ThemeSwitch auto/light/dark + localStorage | **无预设主题**（minimal/compact/rounded 等变量组）、无密度体系 |
| 组件钩子 | 29 个组件设计变量（`--wf-btn-*`/`--wf-modal-*`…，design-variables.md 登记） | 浮层底色无语义 token（`--wf-surface-bg` = bg，暗色浮层不抬升） |
| 状态反馈 | `--wf-color-bg-hover` 已用；`_base.css` 有 `button:active` | **无 pressed/selected 状态层 token**——列表项/菜单项按压无反馈 |
| 动效 | `--wf-dur-fast/base/slow`(120/200/300ms) + 5 条 ease + motion 3 档；`--enter/--exit` 退场模式 | 无微交互统一清单；关键帧命名未成规范 |
| 图标 | 90 个（Icon 组件，stroke SVG/currentColor/1em） | 视觉参数（stroke-width/端点）需统一校准 |
| 防线 | style-audit 45 绿（z-index/字号 token 化、focus、暗色零硬编码、对比度、假 token…） | 新增规则见 §7 |

## 2. 参考框架对标（设计语言借鉴矩阵）

| 框架 | 设计语言核心 | 主题机制 | 借鉴点 | 裁剪原因 |
|------|-------------|---------|--------|---------|
| **Ant Design 5** | 自然/确定性/意义感/成长性；seed→map→alias 三层 token | 一个 seed 色 + 算法生成 10 阶色板；dark/compact 预设算法 | **单值换肤思想**；语义/别名分层 | 色阶算法是 JS（CSS 零构建做不了）→ 用 `color-mix()` 派生替代 |
| **Arco / Semi** | 确定/自然；Design Lab 可视化主题编辑器 | 品牌色/圆角/字号滑动调节 → 导出主题包 | 预设主题包形态 | 在线编辑器工程量大，与零构建定位冲突 → 文档 + 预设 CSS 覆盖 90% |
| **shadcn/ui** | 主题 = 一组 CSS 变量；themes.css 多套预设按 class 切换 | OKLCH 变量组 + 复制进项目 | **预设主题 = 变量组切换**（`data-preset`） | OKLCH 不做（hex 体系稳定、兼容优先） |
| **Material 3** | 状态层（hover 8%/focus 10%/pressed 12% 叠加）；色调层级（tonal elevation）；形状系统 | 动态色彩（系统壁纸取色） | **状态层 token**；浮层抬升底色（暗色提亮而非只靠阴影） | 动态色彩不可控 → 裁剪 |
| **IBM Carbon** | Design Tokens 一等公民；2x 网格；运动速度曲线分入场/出场/生产 | token 全覆盖 + 主题包 | 动效语义分层；token 驱动一切 | — |
| **Vercel Geist** | 极简：黑白灰、几何、克制阴影、"好的设计是无声的" | 变量覆盖 | **克制美学**：中性色主导、品牌色点睛 | — |
| **Element Plus** | — | 直接 CSS 变量覆盖（`--el-color-primary`） | 最简覆盖路径（weifuwu 现状同款，保留） | — |
| **Salesforce Lightning** | Design Tokens 最早大规模实践 | token 表驱动品牌化 | 品牌化 = 只动 token 层 | — |

**结论**：weifuwu 的主题机制取「Ant 的单值换肤 + shadcn 的预设变量组 + Material 的状态层/色调层级 + Geist 的克制美学」，全部用**纯 CSS** 实现（零 JS、零构建——守住"一条 link 即得设计系统"的定位）。

## 3. 设计语言定稿（weifuwu Design Language · 微设计）

> 与框架哲学同源：vdom 的「可推导性 by construction」→ 视觉上**状态反馈可推导**；
> 「诚实裁剪」→ 视觉上**不做炫技**；「render-only」→ 视觉上**无隐式魔法样式**。

**命名**：`WUI Design Language`（微设计，WUI = weifuwu UI）——"微"取三义：微服务的微、
克制之微（subtlety）、细节之微（craft）。

### 3.1 五条核心理念（每条对应可审计的机制）

| # | 理念 | 含义 | 落地机制（audit 可查） |
|---|------|------|------------------------|
| 1 | **确定性** Deterministic | 每个可交互元素必有完整状态链：hover → focus-visible → active(pressed) → disabled；同 token 同视觉，无魔法 | 状态层 token 全组件引用；`cursor:pointer` 元素必须有 hover+pressed（audit） |
| 2 | **清晰** Clear | 三层表面层级 + 三档文字层级 + 语义色只表达语义；信息密度可调 | `--wf-surface-*` 层级 token；text 三阶；语义色 `-text` 变体（已有） |
| 3 | **克制** Restrained | 中性色主导、品牌色点睛；动效短促（120-300ms）有目的；阴影轻、不抢内容 | 动效时长 token 上限；预设 minimal 主题；focus-ring 双层（已有） |
| 4 | **专业** Instrumental | 面向 AI 应用/管理后台/数据工具：键盘可达、数据密度、加载/空/错误三态完整 | 键盘焦点全局（已有）；三态组件组合规范（§5.4）；compact 预设 |
| 5 | **中文原生** CJK-Native | 字阶/行高/断行针对中文优化；表头不做 uppercase；数字 tabular-nums | `--wf-heading-case: none`（已有）；`wf-nums`（已有）；行高校准（Phase 5） |

### 3.2 设计语言在代码中的体现（文档映射）

- 设计理念全文 → `docs/style-guide.md` 新增「设计理念」节 + README「设计理念」段落引用（用户可见）
- token 体系 → `_tokens.css`（唯一事实源）+ `docs/styling.md`「主题配置」重构（§4）
- 本文件 → `design/`（内部计划，实施完归档）

## 4. 主题配置简化（开发者体验——核心目标一）

### 4.1 现状痛点

```css
/* 现在：换品牌色要改 6 个变量（亮 3 + 暗 3），容易漏，暗色还容易配错对比度 */
:root {
  --wf-brand-500: #7c3aed;  --wf-brand-600: #6d28d9;  --wf-brand-700: #5b21b6;
  --wf-dark-brand-500: #a78bfa;  --wf-dark-brand-600: #c4b5fd;  --wf-dark-brand-50: #2e1065;
}
```

### 4.2 目标形态：三档主题配置

```
第一档  1 个值换肤   :root { --wf-brand-seed: #7c3aed }        ← 90% 开发者止步于此
第二档  预设主题      <html data-preset="minimal|compact|rounded">  ← 开箱即用
第三档  深度定制      组件设计变量钩子 + @layer 覆盖             ← 现状能力，补齐缺口
```

### 4.3 任务清单

| # | 任务 | 方案 | 验收 |
|---|------|------|------|
| T1 | **seed 单值换肤** | 新增 `--wf-brand-seed`（默认 `#4f6ef7`）；`--wf-brand-50/500/600/700` 默认值改为 `color-mix(in srgb, var(--wf-brand-seed) N%, white/black)` 派生（配方：50=seed 12%+白、500=seed 100%、600=seed 混合 8% 黑、700=seed 混合 25% 黑）；暗色阶同理派生自 `--wf-dark-brand-seed`（50=seed 20%+暗底 `#0f172a`、500=seed 65%+白 35% 提亮、600 更亮） | 只改 seed 一个值，亮/暗全站色板跟随；对比度测试（-text 对 -50 底 ≥4.5:1）对派生色板成立 |
| T2 | **旧浏览器回退** | 定义处用 `color-mix()`，**引用处保持 hex fallback**（`var(--wf-brand-50, #eef1ff)`）——不支持 color-mix 的浏览器声明无效 → 自动回退默认色板（渐进增强，零 JS） | 删除 color-mix 声明模拟旧浏览器 → audit 仍绿（fallback 全在） |
| T3 | **预设主题** | 新增 `src/layout/_presets.css`：`[data-preset]` 三套变量组——`minimal`（品牌弱化：primary 改中性蓝灰、去品牌 bg）、`compact`（`--wf-control-height: 32px`、`--wf-control-pad-y: 6px`、`--wf-space-*` 缩一档、表格行高密）、`rounded`（`--wf-radius-*` 全升一档 + `--wf-btn-radius: 999px` 可选） | 每组覆盖同一 token 清单（audit 强制变量组完整性）；切换 data-preset 全站生效 |
| T4 | **主题文档重构** | `docs/styling.md` 升级为「主题配置」单页：三档路径 + 每档一张可抄走的 `<style>` 代码卡 + 预设主题预览（components-demo 增加主题切换演示） | 一个页面解决 90% 主题问题；README 文档导航同步 |
| T5 | **ThemeSwitch 扩展** | 保留 auto/light/dark（不动）；可选 `preset` prop（'default'\|'minimal'\|'compact'\|'rounded'）→ 设置 `data-preset`（纯属性操作，与现有模式机制同构）；localStorage 持久化同 key 体系 | 组件测试 + agent-browser 实测切换生效、刷新保持 |
| T6 | **浮层抬升底色** | 新增 `--wf-color-bg-elevated`（亮 = bg，暗 = `--wf-dark-slate-100` 亮一级——Material tonal elevation 思想：暗色浮层提亮而非只靠阴影）；Modal/Drawer/Popover/Dropdown/Tooltip/Select 面板统一引用 | 暗色下浮层与页面底可区分（无需仅靠阴影）；audit 强制浮层族引用 |
| T7 | **密度 token 收敛** | compact 预设直接覆盖现有 token（`--wf-control-*`/`--wf-space-*`/`--wf-field-height`）——**不新增通用 density 变量**（诚实：预设覆盖已够，calc 体系徒增复杂度） | compact 预设下表单/表格/弹层密度一致 |
| T8 | **组件钩子补齐审计** | 按 design-variables.md 对照 115 组件：关键视觉（radius/shadow/width/height）未变量化的补钩子（候选：`--wf-table-*` 行高密度、`--wf-tabs-*`、`--wf-input-*` 已有 field 系） | 新增钩子登记 design-variables.md + style-audit 假 token 防线 |

## 5. 视觉体系精修（用户体验专业——核心目标二）

### 5.1 状态层 token（Material 3 状态层落地）

新增 `_tokens.css` 语义 token（亮色默认 + `--wf-dark-*` 映射）：

```
--wf-state-hover:    rgba(0,0,0,0.04)     /* = 现有 --wf-color-bg-hover 别名收敛 */
--wf-state-pressed:  rgba(0,0,0,0.08)     /* 新增：按压反馈 */
--wf-state-selected: var(--wf-color-primary-bg)  /* 选中态 */
--wf-dark-state-hover:   rgba(255,255,255,0.06)
--wf-dark-state-pressed: rgba(255,255,255,0.10)
```

**应用**：可交互列表项/菜单项/表格行/下拉项统一 `hover → state-hover`、`:active → state-pressed`、选中 → `state-selected`。替代各组件零散的 `--wf-color-bg-hover` 直用（保留兼容别名）。

### 5.2 表面层级（elevation 体系）

```
surface-1  卡片/面板      --wf-surface-bg + --wf-surface-shadow（现有）
surface-2  浮层          --wf-color-bg-elevated + --wf-shadow-md（T6 新增）
surface-3  模态          --wf-color-bg-elevated + --wf-shadow-lg
```

语义映射文档化（design/style-system.md 更新），组件引用按表统一。

### 5.3 高频组件视觉/交互清单（P0 先行——实施时逐项审计确认后修）

| 优先级 | 组件 | 精修项 |
|--------|------|--------|
| P0 | Button | `:active` 按压反馈（scale 0.98 或 state-pressed 叠加）；loading 态已有；danger-ghost hover 已好 |
| P0 | Input/Textarea/Select | 错误态（`aria-invalid` → error 边框 + `--wf-color-error-text` 提示——若缺失则补）；hover 已好 |
| P0 | Table/VirtualTable | 行 hover 反馈；表头排序态（sort-asc/desc 图标 + 色）；斑马纹可选；compact 密度（T3 联动） |
| P0 | 弹层族（Dropdown/Select/Menu/Cascader/TreeSelect） | 菜单项状态层（hover/pressed/selected，§5.1）；分组标题 `-text-tertiary`；面板底色 bg-elevated |
| P0 | Tabs | 指示条动画（`--wf-ease-snap` 弹跳/滑动）；focus 可见 |
| P0 | Skeleton | shimmer 动效 token 化（`--wf-dur-*`/`--wf-ease-*` 引用，禁硬编码） |
| P1 | Modal/Drawer/Confirm | 内容底色 bg-elevated；尺寸 token 已有；退场已有（--exit + animateOut） |
| P1 | DatePicker/Calendar | 选中/今日/悬停状态层统一；键盘焦点跟随（已有基线） |
| P1 | Tag/Alert/Badge | 语义色 50 底 + 700 文字已达标——只做一致性抽查 |
| P1 | Card | hover 抬升（wf-elevate 已有）→ 组件内 `hover` prop 接入；active 态已好 |
| P2 | Progress/StatCard/Steps/Descriptions 等长尾 | 状态层抽查 + token 合规复查 |

### 5.4 三态规范（加载/空/错误——专业工具感的关键）

文档化「三态组合模式」到 `docs/components.md`：

```
加载中 → Skeleton（组件级）/ loading Button / Table loading 遮罩
无数据 → EmptyState（组件级，icon 可自定义）
出错   → Alert / Result（含重试按钮模式）
```

验收：components-demo 每个高频页面（表单/表格/列表）演示三态组合。

### 5.5 动效完善

- **保留**：现有 `--wf-dur-fast/base/slow`(120/200/300ms) + 5 条 ease + motion 3 档——已符合 Material 200-300ms 短促标准，不动
- **补齐**：① 微交互统一清单（见 §6.2 表）；② 关键帧命名规范 `wf-<组件>-<in|out|spin|pulse>`（audit 命名检查）；③ `--enter/--exit` 成对纪律已有（audit 强制）——扩展审计到所有浮层
- **禁止**：新增动画硬编码时长/缓动（audit 已有，保持）

### 5.6 排版校准（CJK 原生）

- 字号阶已有 9 档（xs 12px → 5xl 36px + display 30px）——补充 `docs/style-guide.md` 排版速查表（用途 → 档位）
- 行高：正文 1.5（中文可读性抽查，若不足 1.6 则调 `--wf-line-height`——**诚实：需浏览器实测后定**，不拍脑袋）
- 数字：`wf-nums` 覆盖统计/表格场景（StatCard 已默认，Table 数值列文档引导）

### 5.7 图标校准

- 现有 90 个已覆盖常用场景——统一视觉参数：`stroke-width: 1.5`（小尺寸 16px 内 1.75）、`stroke-linecap/linejoin: round`、24 viewBox（抽查现有 SVG 路径，不一致者收敛）
- 缺口按消费侧需求补（布局蓝本暴露即补——§8 布局蓝本纪律）

## 6. 交互精修（专业体验）

### 6.1 键盘与无障碍（P1 红线——大部分已有基线）

| 项 | 现状 | 行动 |
|----|------|------|
| 焦点可见 | `button/[tabindex]:focus-visible` 全局 + focus-ring 双层（已有） | 全组件 `:focus-visible` 抽查（audit 已有规则，保持） |
| Escape 关闭 | 弹层纪律（已有） | 抽查 Modal/Drawer/Dropdown/Popover 均生效 |
| 焦点归还 | Modal 系 trap + 归还（已有） | 抽查关闭后焦点回触发元素 |
| 方向键 | Tabs/DatePicker 已有 | 列表类（Select/Menu）键盘导航抽查 |
| reduced-motion | 全局降级（已有） | 新动画自动继承（audit 强制） |

### 6.2 微交互统一清单（落地为逐组件验收表）

| 交互 | 视觉反馈 | 时长/缓动 |
|------|---------|----------|
| 按钮按压 | scale(0.98) 或 state-pressed | 120ms ease-out |
| 列表项 hover/按压 | state-hover / state-pressed | 120ms |
| 浮层出现 | opacity + translateY(4px)（--wf-motion-sm） | 200ms ease-out |
| 浮层退场 | 反向 + forwards（--exit 已有） | 200ms ease-in |
| Tabs 指示条滑动 | left/width 过渡 | 200ms ease-out（选中 snap 可选） |
| 选中态切换 | state-selected 背景过渡 | 120ms |
| Toast 滑入 | translateY + fade（--wf-motion-md） | 200ms ease-out |
| 开关/滑块 | knob 过渡（已有 snap） | 200ms ease-snap |

### 6.3 密度/触屏

- 触屏 44px 提升已有（_base.css coarse pointer）——compact 预设与触屏规则不冲突（预设是桌面场景）
- 表格/表单密度随 compact 预设（T3）

## 7. 实施阶段（Phase 划分与验收）

| Phase | 内容 | 验收标准 | 状态 |
|-------|------|---------|------|
| **P0** | 设计语言定稿：本文档定稿 → `docs/style-guide.md` 设计理念节 + README 设计理念引用；style-system.md 层级/状态层文档更新 | 文档三处同步；README 门面不超行数预算 | ✅ |
| **P1** | 主题简化：T1（seed 单值换肤）+ T2（fallback）+ T3（presets.css）+ T7（密度）+ T8（钩子审计） | 改 1 个变量全站换肤（亮+暗）；预设三套切换生效；对比度测试覆盖派生色板；audit 新增 3 条全绿 | ✅ T1/T2/T3/T7；T5（ThemeSwitch preset）✅；T8 钩子审计剩余缺口少（见 §8 防线） |
| **P2** | 状态层 + 表面层级：T6（bg-elevated）+ §5.1 状态层 token + 浮层族/列表族统一引用 | 暗色浮层底色区分可实测；菜单项 hover/pressed/selected 三态齐；audit 新规则生效 | ✅ |
| **P3** | P0 组件精修（Button/Input/Table/弹层族/Tabs/Skeleton）+ §5.4 三态规范 | 每组件 agent-browser 实测（§A 方法）；组件测试全绿；demo 三态演示 | ✅ Skeleton 动效 token 化；Input 错误态/Table hover/Button 按压（base brightness）/Tabs 指示条过渡/Tab 等经审计已有——缺口为零；三态规范文档 ✅（style-guide） |
| **P4** | 动效与微交互：§6.2 清单落地 + 关键帧命名规范 + audit 扩展 | 微交互验收表逐项勾完；reduced-motion 下全部降级 | ✅ 关键帧命名 audit；菜单族 transition token 化（Dropdown/Select/ContextMenu/Menubar/Cascader/Tree/NavMenu——修掉 Select 硬编码 0.1s）；Command/Menu/NavMenu 位移统一 motion-sm；浮层 fade-only 经审计确认是定位 transform 冲突下的**正确设计**（Dropdown 居中 translateX(-50%) 等） |
| **P5** | 排版/图标/长尾：§5.6 行高校准（实测定）+ §5.7 图标参数统一 + P1/P2 组件抽查 + T4/T5 文档与 ThemeSwitch | 文档/计数同步（177 token）；全量测试 ≤15s；发布前全绿 | 🔄 T4 文档 ✅ + 计数同步 ✅；行高校准结论：正文 1.5 与主流同档（Ant 1.57）保持，prose 长文 1.75 已宽松——文档化；图标参数确认已统一（24/1.8/round/currentColor 单一模板）并文档化；Calendar/StatCard/Card 抽查达标；剩余：行高视觉实测定稿 + demo 服务重启后新 ThemeSwitch 演示可见 |

## 8. 防线（回归保护）

### 8.1 style-audit 新增规则（45 → 50，已全部实施 ✅）

1. ✅ **浮层底色**：浮层族 CSS 必须引用 `--wf-color-bg-elevated`（面板类清单登记，新增浮层组件加入清单）
2. ✅ **状态层**：菜单项类清单必须 `:hover` + `:active` 双态（`--wf-state-pressed` 按压反馈）
3. ✅ **预设变量组完整性**：data-preset 三套存在 + 各自 token 覆盖齐全（minimal 双 seed / compact 控件+间距 / rounded 半径全档）
4. ✅ **color-mix 回退**：对比度测试解析 color-mix 派生链（hex / var() / color-mix 三级解析器）——不支持 color-mix 时 @supports 回退默认色板
5. ✅ **派生色板对比度**：-text 对 -50 底 ≥ 4.5:1 亮暗双验证扩展到派生色板 + seed 恒等式（brand-500 = seed）
6. ✅ **关键帧命名**：`@keyframes` 必须 `wf-` 前缀 + 语义动作后缀（in/out/fadein/pop/spin/pulse/shimmer/blink/slidein…）

### 8.2 测试与实测

- 组件 DOM 测试：T5（ThemeSwitch preset）、状态层改动组件回归
- **agent-browser 实测**（§A.1-A.5 方法论）：每次 Phase 验收——换肤后截图对比、预设切换、暗色浮层底色、微交互（hover/pressed 逐项）
- 全量测试发布前跑（§7.1 预算 ≤15s）；token 计数变更同步 README/docs（audit L0 强制）

## 9. 诚实裁剪（不做清单——CS-05 精神）

| 不做 | 原因 | 替代 |
|------|------|------|
| 色阶生成算法（Ant colorPalette 式 JS） | 零构建定位：主题必须纯 CSS 可完成 | `color-mix()` 派生 + hex fallback（T1/T2） |
| 在线主题编辑器（Arco/Semi Design Lab） | 工程量大、与纯 link 定位冲突 | 三档文档 + 预设主题覆盖 90% 场景 |
| Material 动态色彩（系统壁纸取色） | 不可控、与品牌一致性冲突 | 固定 seed 体系 |
| OKLCH 色彩空间迁移（shadcn 式） | 现有 hex 体系稳定，兼容优先 | 保留 hex + color-mix |
| 通用 density calc 变量体系 | 预设覆盖已够，calc 徒增复杂度 | compact 预设直接覆盖现有 token |
| EmptyState 插画资产 | 已在 components-plan 裁剪登记 | icon 自定义 VNode |
| 动效加长（>300ms 花哨动画） | 克制理念 + Material 标准 | 保持 120-300ms 阶梯 |

## 10. 相关文档联动

- 实施完成 → 本文件归档（git 历史可追溯），要点沉淀：`docs/style-guide.md`（设计理念 + 排版速查）、`docs/styling.md`（主题三档配置）、`design/design-variables.md`（新钩子登记）、`design/style-system.md`（层级/状态层更新）、README（token 计数/设计理念）
- 用户可见内容一律不进 `design/`（§10 文档目录纪律）
