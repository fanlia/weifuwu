# components CSS 标准化（2027-xx）

> 一句话目标：**weifuwu/components 样式从「token 化率高但残留手写」推进到
> 「宽走发丝 token · 间距走标尺 var() · 结构值登记制」**——对标 layout 面已建成的
> L14 同款防线，补齐组件面最后三宗手写。
>
> 动机（探针实证——/tmp/probe-comp*.mjs，不提交）：
> ① **发丝半 token 67 处/33 文件**：`border: 1px solid var(--wf-color-border)`——
>    色走 token、**宽仍是字面量**（`--wf-border-width: 1px` 早已存在且 layout 侧
>    `.wf-card-outline` 已 token 化——W4 前例）；半 token = 不完整标准化。
> ② **标尺档手写 52 处/22 文件**：`padding/gap: 4px/8px/12px/16px/24px`——space/gap
>    标尺档位值直接手写 → **compact 预设不缩放**（实证：Button 已 token 化——compact
>    下 pad 10px16px→6px12px · h 36→32 · fs 13→12——而手写组件静止；_presets.css
>    头注释「紧凑密度——控件/间距/字号缩一档」的设计意图对手写组件落空）。
> ③ **结构值 ~300 处**（gap 2px×21 · padding 2px×12 · z-index:1×11 · 44px 命中区 ·
>    999px 胶囊 · 尺寸族 height/width/min-* 各组件自定义值）——组件域结构尺寸，
>    非主题标尺 → 不 token 化（标尺爆炸），**登记制**（新增必须登记理由）。
> ④ **零散违规已无**：硬编码色 0（audit-theme 锁）· !important 0 · @keyframes 37 个
>    全 wf- 前缀 · 断点字面量 L10 已锁（组件 4 处 639.98/767.98）——基础面干净。

## 现状探针（2027-xx 读数）

| 面 | 读数 | 判定 |
| --- | --- | --- |
| 组件 CSS | 133 文件 · var(--wf-*) 引用 **3343 次** · 硬编码色 **0** · !important **0** | token 化基础已高 |
| 发丝半 token | `border[N]: 1px solid/dashed var(` **67 处** / 33 文件（Editor 7 · FilePreview 5 · SlideCanvas 5 · SheetGrid 4 · DiffView 3 · Divider 3 · PromptTemplate 3） | 缺 `var(--wf-border-width)` |
| 标尺档手写 | padding/margin/gap ∈ {4,8,12,16,24,32} **52 处** / 22 文件（DiffView 7 · SlideCanvas 6 · Kanban 5 · Tour 5 · DatePicker 3 · SheetGrid 3 · TabBar 3） | 缺标尺 var()——compact 不缩放 |
| 结构值 | gap 2px×21 · padding 2px×12 · margin-top 2px×9 · gap 1px×6 · z-index:1×11 · 44px 命中区 ×39 · 999px/9999px 胶囊 · 尺寸族 height 90 / width 75 / min-height 59 / min-width 38 | 组件域魔数——登记制 |
| var 回退 | `var(--wf-x, 4px)` 形态 ~38 处（padding@mixed 等） | **豁免**（钩子默认面——L9 同款） |
| 字体 | font-size 手写 12 处（11px×3 16px×3 24px×2…）——S6 已 warn 白名单登记 | 已有机制（不动） |
| 预设影响面 | data-preset 消费 = 仅 ThemeSwitch（用户手动切换）；apps 无默认预设 | compact 修复视觉面 = 用户主动开启场域 |

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| **W0** | **防线先行（C1 组件 px 分类哨兵 + 登记制基线——不改 CSS）**：新契约 `src/test/contract/components-px.test.ts`：① 发丝检测（border 族宽为字面量且值含 var）② 标尺档检测（padding/margin/gap 纯字面量 ∈ 标尺）③ 结构值检测（其余纯 px——长白名单）④ var 回退豁免（剥 var() 技术同 L14）——三桶计数 == `scripts/components-px-whitelist.json`（迁移中登记表 + 结构值白名单——每项理由）；新违规（未登记）即红 | `test:client` 新文件绿（基线锚：发丝 67 · 标尺 52）· 负控验三桶各红（新增一处 = 红）· 现有测试零回归 |
| **W1** | **发丝 token 化**：67 处 `1px solid/dashed var(` → `var(--wf-border-width) solid/dashed var(`（33 文件——机械等价替换：token=1px 恒等）· 同步移出 C1 发丝登记 67 项 | 发丝桶 67 → **0**（C1 绿）· dist 产物含 `var(--wf-border-width)` · showcase 328 全绿（零视觉变更——1px=1px）· 契约全绿 |
| **W2** | **标尺档 token 化**：52 处 → var()（4→space-xs/gap-xs · 8→space-sm/gap-sm · 12→space/gap-md · 16→space-md/gap-lg · 24→space-lg/gap-xl · 32→space-xl/gap-2xl——base 值恒等）· 同步移出 C1 标尺登记 · **compact 缩放实证**（刷新预设探针：改造前手写组件在 compact 下静止 → 改造后跟随 | 标尺桶 52 → **0**（C1 绿）· **预设缩放探针（fresh）**：改造组件在 compact 下 padding 跟随（4px→3px 定量断言——场景或探针脚本实证）· showcase 328 全绿（base 零视觉变更——token=值）· 平台 UI 155 全绿 |
| **W3** | **结构值定案**：z-index:1 ×11 → 登记（「提升一层」惯用）· 44px 命中区/999px 胶囊/2px 发丝间距/gap 1px → 白名单登记（理由入档）· 尺寸族（height/width/min-* 262 处）→ **判负 token 化**（组件域结构尺寸——逐组件语义不同，标尺爆炸 > 收益；登记制锁新增）· `1px` 非 border 语义（outline-offset/text-underline 等）逐个甄别 | C1 结构值登记完备（每项理由）· 判负记录入档（尺寸族——推翻条件：某值跨 ≥3 组件同义且属主题标尺）· 契约绿 |
| **W4** | **收尾**：负控三连复验（新增标尺档/新增手写发丝/未登记结构值 → 红）· 全量回归门（契约/场景/showcase/server/shared/平台 UI/audit:all/tsc）· docs/client.md §5.4 **组件 CSS 纪律**更新（四纪律：宽走 --wf-border-width · 间距走标尺 var() · 结构值登记 · 半 token 禁止——C1 哨兵强制）· snapshot 更新 · 计划归档 | 五域 + 平台全绿 · audit 七线 exit 0 · tsc 0 · 纪律成文 · 计划按 plan.md §5 归档 |

## 判负记录（可被新论证推翻）

- **组件结构尺寸 token 化**（height/width/min-* 262 处）：不做——各组件结构尺寸语义不同（步进器行高/缩略图边长/卡片内距），统一标尺 = 标尺爆炸 + 视觉突变；现用登记制锁新增；推翻：某值跨 ≥3 组件同义且属主题标尺（届时补 token + 接线）
- **font-size 手写 12 处**：不做——S6 已 warn 白名单登记（图标字形/徽标面）；推翻：正文类字号出现手写（S6 红档）
- **组件 CSS 合并/压缩**（同文件多组件、CSS 文件数收敛）：不做——每组件一文件是「每组件一契约测试」的配套结构（audit-component-coverage 哨兵依赖）；推翻：文件数成构建瓶颈实测

## 执行实录（边做边记）

| 波次 | commit | 结果 |
| --- | --- | --- |
| W0 | | **防线先行（C1 组件 px 分类哨兵 + 登记制基线——未改任何组件 CSS）**：新契约 `src/test/contract/components-px.test.ts`（4 桶：发丝半 token 59 · 标尺档手写 42 · 结构值 492 · z-index 字面量 8）+ `scripts/components-px-whitelist.json` 登记表（每项理由——迁移中登记与结构白名单同表）。**探针修正三点**：① 发丝计数 67 次出现 → 59 形态（同文件同属性同值去重——置换按形态）② 标尺计数 52 次 → **42 形态**（多值缩写 `padding: 8/12px` 修正归桶——初版生成器只匹配单值导致双值落结构桶）③ **px 哨兵盲区：z-index: 1 无 px 单位**——扩第四桶（「同层 DOM 顺序裁决」惯用——非 z 标尺档，判负理由入档）。**负控四桶全验**（发丝 3px · 标尺 16px · 结构 margin-top 3px · z-index 9 → 各红）· 登记表 ghost/空理由检测（反向哨兵内置——已处理未移出 = 红）。**回归**：契约 450→**451**（C1）· tsc:test 0 · 现有测试零回归。 |
| W1 | | **发丝 token 化（43 形态 · 33 文件）**：`border[N]: 1px solid/dashed var(…)` → `var(--wf-border-width)`——**预设零覆写实证**（`--wf-border-width` 仅 _tokens.css 一次声明——compact/rounded/暗色均不改 → 全主题恒等替换 1px=1px，零视觉风险）。**口径修正**：发丝桶原 59 形态含非 1px 宽（3px×6 · 2px×9 · 5px×1 = 16 形态）——**非 1px = 强调边框（无 token 面）判负**，迁结构桶（理由入档）——等价面 = 43 形态。**回归**：C1 发丝 **59→0** · 替换后组件面 `var(--wf-border-width)` 声明 **163 处** · test:client **451** · showcase **328** · 场景 **129** · dist style.css +1273B（gzip **-13B**——var() 重复串压缩——基线显式上调 + 理由）· 残留 1px 字面量发丝 **0**。 |
