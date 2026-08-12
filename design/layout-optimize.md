# weifuwu/layout 优化计划（P8）
> **状态（2026-12 确认）**：✅ 已完成——P8 布局原语——组合结果不依赖 import 顺序（L1 audit 防线）

> 目标：让布局原语从**够用**到**可预期**——组合结果不依赖 import 顺序、
> 命名不误导、文档/计数单一事实源、冲突有自动化防线。
> 前置：P0–P5（token-layout-optimize）已完成可定制性（双层 token/@layer/变量钩子）；
> 本阶段不做功能扩张，只治理**正确性、一致性、可预期性**。
>
> 触发：layouts-demo 蓝本审查（2026-08）连续踩中原语层陷阱——
> `wf-nav wf-row` 类冲突静默失效（窄屏切换条垂直堆叠）、`wf-pin`(fixed) 与
> 容器内角标语义混淆（DataScreen 覆盖壳）、计数漂移（README 141 vs 164、demo 189）。

## 现状盘点（实测）

| 维度 | 事实 | 问题 |
|---|---|---|
| 规模 | 41 个 CSS 文件、201 个选择器（含态/变体）、dist 43.7KB | 无权威清单，计数靠手数 |
| 计数漂移 | README 同文 141（L28）与 164（L308/350）并存；style-system 说 141；layouts-demo 说"189 原语"；实际 token 164 | style-audit 只校验单一处，其余裸奔 |
| 类冲突 | `wf-nav`(column) × `wf-row`、`wf-center`(column) × `wf-row`、`wf-grid` × `wf-stack`——同属性同优先级，**import 顺序定胜负，组合静默失效** | 无防线（事故 1 起）；style-audit 21 条只防组件↔原语同名，不防原语↔原语 |
| 命名陷阱 | `wf-fixed` = `flex:none`（**不是** position:fixed）；`wf-pin` = position:fixed；`wf-layer` 强制 `z-index:1`（要纯定位上下文也被迫抬层） | 语义误导，文档未标注 |
| 响应式双轨 | `wf-stack@md`（→row）与 `wf-row@md` 并存，同一效果两种写法 | 无推荐路径，蓝本写法不一 |
| gap 协作 | 原语默认 `gap: var(--wf-gap, fallback)` × `wf-gap-*` 直接 gap 属性——后者靠前导入顺序获胜（5e6313f 修复变量污染后的折衷） | 顺序依赖无防线，新增原语文件插错位置即回归 |
| 文档漂移 | P5 承诺的"文档与实现脚本比对"未落地（scripts/ 无此物） | docs/layout.md 与 src/layout 靠人工同步 |

## 阶段总览

| 阶段 | 内容 | 工作量 | 风险 | 依赖 | 状态 |
|---|---|---|---|---|---|
| L0 | 原语清单脚本 + 计数单一事实源 | S | 低 | — | ✅ |
| L1 | 冲突矩阵 + 组合防线（audit/文档） | M | 低 | L0 | ✅ |
| L2 | 命名陷阱治理（别名 + 文档标注，非 breaking） | S | 低 | L0 | ✅ |
| L3 | 原语默认值 `:where()` 零优先级化（去顺序依赖） | M | **中**（视觉回归面） | L1 | ✅ |
| L4 | 死类/重复规则检测报告 | S | 低 | L0 | ✅ |

## 验收记录（2026-08）

- **权威计数**：57 布局原语 + 136 工具类 + 164 主题 Token（`scripts/layout-inventory.mjs`，
  显式文件分类登记）；README/docs/design/apps 全部对齐，audit 强制同步（改计数即红）
- **L1 防线**（audit 25→29 条）：① 组合冲突扫描（属性指纹同属性不同值，ALLOW 白名单 6 组）
  ② 幽灵类防线（class 引用必须存在）③ 非法选择器防线（注释被 `*/` 截断的解析级检测）
- **L1 抓出的真实 bug**：`wf-block@lg` 覆盖 `wf-stack` 的 display:flex（侧栏 mt-auto 失效）
  → 新增 `wf-flex@bp` 显隐恢复原语；`wf-mt-auto`/`wf-pt-*`/`wf-pb-*` 幽灵类 → 补全间距家族；
  components-demo 7 类 tailwind 式幻影（wf-flex-1/wf-pad-md/wf-btn-primary…）全部修正
- **L2**：`wf-flex-none` 别名（wf-fixed 保留兼容）；docs 增补 wf-pin/wf-flex/尺寸族/wf-dim/
  wf-elevate/wf-panel-in 缺失条目 + 「组合规则」章节 + 响应式双轨收敛（推荐 wf-stack wf-stack@md）
- **L3**：12 个容器原语的 gap/align/justify var 回退默认迁 `:where()`——覆盖语义从
  import 顺序解耦为优先级（浏览器实测 rowTop/gridGapSm/clusterRight 等组合全对）
- **L3 过程事故**：① 注释内 `wf-gap-*/wf-top` 的 `*/` 截断注释 → `.wf-row{display:flex}`
  被 Chrome 静默丢规则（curl 源码正常，只有解析暴露）→ 非法选择器防线落地；
  ② 新文件 `_flex.css` 未登记 build.mjs LAYER_OF → 默认 layout 层被 utilities 层压 →
  构建防呆（未登记即报错，顺带抓出 _between 未登记）
- **L4**：死类报告入 CLI（`--dead`）——仓库零引用类 0 个
- 门禁：全量 1791 pass / 0 fail；layouts-demo 亮/暗 × 1280/768/375 截图矩阵回归通过

## L0 — 原语清单脚本 + 计数单一事实源

- 新增 `scripts/layout-inventory.mjs`：解析 `src/layout/*.css` → 输出
  ① 类清单（含断点变体/状态变体归类）
  ② **属性指纹**（每个类设置的 CSS 属性集合——L1 冲突矩阵的输入）
  ③ 权威计数（原语/工具类/token 三个数）
- README（含 L28 的 141）、docs/layout.md、design/style-system.md、
  layouts-demo（"189 个布局原语"）全部对齐到脚本输出值
- style-audit 扩展：现有"token 数量与 README 同步"规则 → 覆盖**所有**文档出现处
  （grep 全部 `\d+ 个.*(原语|Token)` 断言与脚本输出一致）

**验证**：改一个 token/原语计数 → audit 红；脚本输出纳入仓库（或测试内联生成）。

## L1 — 冲突矩阵 + 组合防线

- 由 L0 属性指纹自动生成**冲突矩阵**：设置同一属性（display/flex-direction/
  position/justify/align/gap）的原语对全量列出，人工标注三档——
  `合法协作`（stack+between）/ `顺序敏感`（nav+row）/ `逻辑互斥`（hidden+block）
- style-audit 新规则：扫描 `apps/*/src/**/*.tsx` 与 `src/components/**/*.ts` 的
  class 属性，命中`顺序敏感/逻辑互斥`对 → 报错（wf-nav+wf-row 事故的防线）
- docs/layout.md 新增「组合规则」章节：冲突矩阵的合法协作档 + 推荐写法
  （如窄屏切换条：`wf-row wf-nowrap wf-scroll`，不套 `wf-nav`）

**验证**：在 demo 源码故意写 `wf-nav wf-row` → audit 红；矩阵表随脚本再生。

## L2 — 命名陷阱治理（非 breaking）

- `wf-fixed`（flex:none）：新增别名 `wf-flex-none`，文档主用新名；`wf-fixed` 标注
  "易与 position:fixed 混淆，推荐 wf-flex-none"（不删——breaking）
- `wf-layer`：文档明示"relative + z-index:1"；评估新增 `wf-relative`（纯定位上下文，
  无 z-index——DataScreen 角标场景的精确表达），若加则同步蓝本
- 响应式双轨收敛：文档定唯一推荐——`wf-stack wf-stack@md`（移动优先纵向→断点横向），
  `wf-row@md` 标注为等价别名；蓝本统一改写

**验证**：audit 计数规则适配新增别名；蓝本 agent-browser 复查无视觉回归。

## L3 — 原语默认值 `:where()` 零优先级化

- 核心：原语的默认 gap/align 等用 `:where(.wf-stack)` 包裹（零优先级），
  `wf-gap-*` 等工具类保持常规优先级 → **组合结果与 import 顺序解耦**
  （5e6313f 折衷方案的根治；新增原语文件插错位置不再回归）
- 范围：stack/row/split/cluster/grid/between/around/evenly 的默认 gap/align
- ⚠️ 风险：`:where()` 后用户未分层自定义 CSS 覆盖关系变化——需亮/暗 × 1280/768/375
  layouts-demo 截图矩阵全量比对（附录 A 纪律：outerHTML + getComputedStyle）

**验证**：调换 weifuwu-layout.css 的 @import 顺序 → 视觉零差异（构造测试页断言
getComputedStyle）；截图矩阵逐像素比对。

## L4 — 死类/重复规则检测报告

- 死类检测：L0 类清单 × apps/docs/src 引用扫描 → 零引用类报告
  （只报告不删——原语是对外 API，删除需主版本决策）
- 重复声明合并：`_between.css` 等的 @bp 变体整段重复全属性 → 精简为只写差异属性
- dist 体积基线记录（layout 43.7KB），纳入 release 检查

**验证**：报告随构建产出；精简后截图矩阵回归。

## 诚实裁剪（不做）

- RTL 逻辑属性 / container query / OKLCH：无需求（延续 token-layout-optimize 裁剪）
- 按需生成 / tree-shake：与"零构建纯 link"冲突（延续既有决策）
- `wf-fixed` 等误导命名**删除**：breaking，仅别名 + 文档引导
- 原语组合的运行时告警（dev 期 DOM 扫描）：先静态 audit，运行时成本高暂缓

## 执行顺序

```
L0 事实源 → L1 冲突防线 → L2 命名治理 → L3 :where()（独立发布，可单独回滚） → L4 报告
```

每期门禁：全量 `npm test` + style-audit 扩展 + layouts-demo 截图矩阵（亮/暗 ×
1280/768/375）+ `node scripts/build.mjs` 验证。L3 风险最高，单独成提交便于回滚。
