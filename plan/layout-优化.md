# layout 优化（2027-xx）

> 一句话目标：**weifuwu/layout 从「类面已清理」推进到「装配单源 + 层叠语义确定 +
> 可发现 + 载荷有哨兵」**——四轴优化，不动类面减法（04ff3e57 已做 223→144）。
>
> 动机（探针实证 + 消费证据——非臆想）：
> ① **同一样式源存在四条装配管线、三种层序语义**（build.mjs 五层 LAYER_OF /
> showcase server 全塞 `@layer layout` / scenario server 同 / `ctx.ui.css(src 入口)`
> 零层 + Lightning 改写）——**测试环境验证的层序 ≠ 发布产物层序**；
> ② **层叠覆盖失效已被登记为 hack**：`_hidden.css` 注释原文「@layer 顺序下
> utilities 永远输给 components——!important 是唯一出路」（dist 产物实证三组：
> `.wf-card--pad-lg + .wf-padding-xs` → **24px**（应 4px）· `.wf-card--pad-sm +
> .wf-padding-lg` → **8px**（应 24px）· `.wf-btn + .wf-padding-lg` → **10px 16px**
> （btn 胜）——双向均被吞，而工具类单独用正常）；
> ③ **gap 继承污染是活体面**：实证外层 `style="--wf-gap:20px"` → 内层 `.wf-stack`
> gap = 20px（应 12px），而内联钩子消费 **49 处**（apps + 组件），`_spacing.css`
> 却明令 `wf-gap-*` 不设该变量（自相矛盾——无官方替代面）；
> ④ **载荷无哨兵**：style.css 311.6K（br 41.7K）无 minify（注释 29.5K = 10.2%），
> minify 后 br 23.7K（**-43%**），而 audit:bundle 只管 app.js；
> ⑤ **可发现性塌陷**：docs/README 仅提及 15 个 `wf-*` 名（vs 144 类），
> `design/layout-naming.md` 被 5 处引用但**文件不存在**，词根表源
> `apps/showcase/src/demos/layout.tsx` **不存在**，变量钩子零文档。

## 现状探针（2027-xx 读数——一次性脚本 /tmp/probe*.mjs，不提交）

| 面 | 读数 | 判定 |
| --- | --- | --- |
| 规模 | layout **32 文件 50.4K** 源（_tokens 13.4K · _base 6.9K · _dark 5.0K · _app-shell 4.5K）· **149 类**（50 原语 / 97 工具 / 2 内部 · 基类 144）· **183 token** | 类面已减法过——本轮不做类面裁剪为主 |
| 载荷 | dist layout **49.7K**（gzip 14.5K · br 12.1K）→ minify **27.7K**（br **4.9K = -59%**）· components/style.css **311.6K**（gzip 55.7K · br 41.7K）→ minify **220.6K**（br **23.7K = -43%**）· 注释 29.5K（10.2%）未剥离 · **audit:bundle 只管 app.js（CSS 零基线）** | 缺口：无 minify + 无 CSS 体积哨兵 |
| 首屏相关性 | showcase `/components` 首页 DOM 用 **43 / 1427** 类 · **1959 / 2021** 规则无关（278K / 290K = **96%**） | 按需子集 = 判负候选（W6 登记） |
| **装配管线** | **四条三种语义**：① `scripts/build.mjs` LAYER_OF 五层（tokens 不包裹/base/layout/utilities/components）② `apps/showcase/server.ts:128` 全部文件塞 `@layer layout` ③ `src/test/scenario/server.ts:50` 同 ② ④ `ctx.ui.css('src/client/layout/weifuwu-layout.css')` → **零 @layer** + tailwind banner + color-mix 被 Lightning 改写为 `@supports` 回退（31.8K） | **单源违规**——②③④ 层序 ≠ ① 发布语义 |
| css() 新鲜度键 | `compile('css', absPath)` 的 inputs **只 stat 入口文件**——@import 依赖不进键（src 入口 + 改 `_tokens.css` = 陈旧缓存） | 缺陷（W1 修） |
| css() 缓存头 | dist 路径：ETag + `no-cache` ✓ · showcase/scenario 自建路由：`new Response(css)` **零缓存头** + 每请求读 ~170 文件 | 缺陷（W1 修） |
| **层叠覆盖** | 实证（dist 产物 · `getComputedStyle`）：`.wf-card--pad-lg + .wf-padding-xs` → **24px**（工具类 4px 被吞）· `.wf-card--pad-sm + .wf-padding-lg` → **8px**（24px 被吞）· `.wf-btn + .wf-padding-lg` → **10px 16px**（btn 胜）· 对照组：`.wf-padding-xs` 单独 = **4px** 正常（确认是层序而非类缺失）· 全库属性重叠的「组件类 × 工具类」同串组合仅 **1 种 4 处**（`wf-stat-value × wf-nums`——同值冗余，非 bug）· `_hidden.css:4-7` 已用 `!important` 变通并登记根因 · apps 侧 `app.css` `!important`×2（作者注释「对抗框架类」） | 潜伏 + 已有 hack（W2 根治） |
| **零值档位缺口** | `wf-margin-none` / `wf-gap-none` **已定义** · `wf-padding-none` / `wf-radius-none` **未定义**（dist 产物字符串确认）——L5a「零值形态唯一 none」只约束**已有类**，不保证**每个属性域有 none 档** → 消费侧「取消组件内边距/圆角」无工具类面（只能 app.css `!important`） | 缺口（W2 补齐——L1 计数登记） |
| **gap 继承污染** | 实证外层 `style="--wf-gap:20px"` → 内层 `.wf-stack` gap **20px**（应 12px）· 内联变量钩子消费 **49 处**（`--wf-gap`/`--wf-cols`/`--wf-max`/`--wf-align`）· `@property{inherits:false}` 实证修复（内层 **12px**）· Lightning 管线**保留 @property 并自动补 Safari<16.4 polyfill**（`@layer properties` + `@supports`）· dist 管线纯文本拼接保留 | 活体缺陷面（W2 根治） |
| **断点** | token `--wf-bp-sm/md/lg/xl = 640/768/1024/1280` **零 var() 引用**（@media 不能用 var → inert）· 实际 @media 值：layout `640 / 767.98 / 1024` · 组件 `639×3`（DatePicker/Drawer/Modal）+ `767×1`（Transfer）· `apps/agent-platform/ui/app.css` `767.98 / 1023.98 / 1024`（注释「断点对齐框架」= 手抄无机制）· 断点变体规则仅 **3 条**（`wf-flex@sm` / `wf-flex@lg` / `wf-hidden@lg`）消费 **6 处** · `@container` **0** | 碎片化 + inert token（W3） |
| token 面 | 183 声明 · **10 零 var() 引用**（`--wf-gap-2xl` `--wf-motion-lg` `--wf-state-selected` `--wf-opacity-overlay` `--wf-letter-spacing-wider` `--wf-dark-slate-50` `--wf-bp-*`×4）· **67 冷**（1-2 次）· **14 组同值多名**（`--wf-dark-bg-hover ≡ --wf-dark-state-hover` · `--wf-dark-surface-shadow ≡ --wf-dark-shadow` · 240px 三胞胎 · 200px 三胞胎）· **双标尺同名不同值**：`gap-md 12 / space-md 16` · `lg 16/24` · `xl 24/32` · `2xl 32/40`（爆炸半径 `gap-md` 91 + `gap-lg` 50 + `gap-xl` 1 = **142 处**；`gap-xs/sm` 两标尺同值——226+304 处零风险）· 幽灵 token `--wf-w-sm`（`.wf-width-sm` 回退 480px——无声明）· layout 类文件 px 字面量 **25 处**（style-audit S1/S6 只扫组件 CSS） | 不透明面 + DX 陷阱（W4） |
| 冲突矩阵 | `conflictMatrix()` 导出 **169 对**（同属性不同值 = 顺序敏感）· 同元素共用 **7 对**（`wf-center×wf-stack` `wf-row×wf-stack` `wf-nowrap×wf-row` `wf-app-shell×wf-hidden` `wf-app-shell×wf-sidebar` `wf-flex×wf-hidden` `wf-hidden×wf-sidebar`）· **零测试消费（防线休眠）** · 实证 `wf-row wf-stack` → `flex-direction: column`（静默） | 休眠防线（W0 激活） |
| **可发现性** | docs/README 仅提及 **15** 个 `wf-*` 名（vs 144 类）· **`design/` 目录整体不存在但被 8 处引用**：`layout-naming.md` **5 处**（`weifuwu-layout.css:2` / `_spacing.css:3` / `_text.css:1` / `layout-inventory.test.ts:2,84`）+ `design-language.md`（`_base.css:250`）+ `style-professional-plan.md`（`FileTree.css:2`）+ `CONTRIBUTING.md:80`「design/ 计划」+ `layout-inventory.mjs:132` 扫描 design/ · docs/client.md §4 计数 **49/92**（实际 **50/97**）· §3 引用不存在的 `src/client/layout/style.css` · 词根表源 `apps/showcase/src/demos/layout.tsx` **不存在** · 变量钩子（`--wf-gap`/`--wf-cols`/`--wf-max`）零文档 · L6 计数哨兵**只查 README** · AGENTS.md/docs 称 layout-inventory「8 断言」实际 **9** | 消费者只能读 CSS 源码（W5） |
| 豁免债 | L2 死类 0 靠豁免 **14 项**（QUARTET 2 + LIB_SURFACE 8 + SHOWCASE_PRIVATE 4）· 代码语料零使用类 **10 个**（`wf-absolute` `wf-layer` `wf-nav` `wf-nav-group` `wf-radius-lg` `wf-safe-bottom` `wf-safe-top` `wf-self-start` `wf-popup`×2） | 公共面无示例 = 不可发现（W5 定案） |
| 响应式手搓 | `apps/agent-platform/ui/app.css` **131 行**手搓移动壳（`@media` 覆盖 `.wf-app-shell .wf-sidebar` · `display:flex /* 对抗 wf-hidden */` · `!important`×2）· `useBreakpoint` 消费 5 · `matchMedia` 3 | 单消费者 → 平台层（判负登记） |
| 干净面（保持） | layout 死类 0（仓库语料）· L4 非法选择器 0 · L5a/b/c 0 · style-audit S1-S7 **0 错误 / 78 警告基线** · `!important` 声明：layout **5**（`_base.css` 4 = `prefers-reduced-motion` 合法 · `_hidden.css` 1 = 层序 hack）· 组件 CSS **0** · apps `app.css` 2（对抗框架类）· 契约 **433 全绿**（3.3s）· 暗色双激活（`data-theme` + `prefers-color-scheme`） | 不回潮 |

## 波次

> 纪律：每波次闭环（实现 → 契约 → 回归门 → commit）· 回归门 = `npm run test:client`
> （≤10s）+ 涉浏览器面加 `test:scenario` / `test:showcase` + `npm run audit:all` + `tsc --noEmit`。
> **W0 防线先行**——行为改动（W2/W4/W6）全部在对账/语义契约保护下动手术。

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| **W0** | **防线先行（探针固化——不改行为）**：① 新增浏览器语义契约 `src/test/scenario/e2e-layout-semantics.test.ts`（+ registry 场景 `layout-semantics`）——`getComputedStyle` 断言**当前行为**为基线：内层 gap = **20px**（污染）/ `.wf-card--pad-lg + .wf-padding-xs` = **24px**（压制）/ `.wf-btn + .wf-padding-lg` = **10px 16px** / `wf-flex wf-hidden@lg`@1280 = **none** / `wf-row wf-stack` = **column**② `layout-inventory.test.ts` 激活 `conflictMatrix`（169 对基线 + 7 共用对显式登记清单）+ **L5d 零值档位矩阵**（当前 `{margin,gap}` 有 none · `{padding,radius}` 无——基线锁定，W2 补齐后翻转）③ `scripts/bundle-baseline.json` 增 CSS 双指标（style.css raw/gzip 锚 = 311.6K/55.7K）+ `audit-bundle.mjs` 增 CSS 行 ④ 探针脚本读数写入本计划（本表） | `test:client` **433 → ≥434**（conflictMatrix 断言）绿 · 场景层 **123 → +1 文件**（**5 断言** = 现状基线，红即读数错）· `audit:bundle` 打印 CSS 两行 exit 0 · conflictMatrix 断言「共用对 ⊆ 登记清单」绿 |
| **W1** | **CSS 装配单源（四管线 → 一函数）**：① 抽 `scripts/css-bundle.mjs` 导出 `bundleLayout(opts)` / `bundleComponents(opts)`（`@import` 顺序单源 = `weifuwu-layout.css` · 层归属单源 = `LAYER_OF`（迁入本模块）· 未登记文件报错防呆保留 · opts: `{ minify, layerOf }`）② 三处内联实现改调用（`build.mjs` / `apps/showcase/server.ts:128-148` / `src/test/scenario/server.ts:50-71`）③ `ctx.ui.css` 修复：新鲜度键含 `@import` 闭包（递归 stat）+ weifuwu 包入口走 `bundleLayout` 而非 postcss（不再依赖 tailwind 是否安装/是否改写层序）④ showcase/scenario CSS 路由加 ETag + `Cache-Control: no-cache`（或直接用 `ctx.ui.css`） | 新契约「**层归属全等**」：dist 产物 vs showcase server vs scenario server vs `ctx.ui.css` 四路的 (类 → @layer) 映射逐类全等（`Map` deepEqual）· showcase **328** + 场景 **123** 全绿（②③ 从降级层序恢复发布语义——**视觉差异必须逐条甄别并记入执行实录**）· `ctx.ui.css` 依赖变更失效契约（改 `_tokens.css` → etag 变）· 自建 CSS 路由缓存头断言 |
| **W2** | **层叠语义确定性（根治两 hack）**：① `@property --wf-gap / --wf-align / --wf-cols / --wf-max { syntax; inherits: false; initial-value }`——污染根治（探针实证内层 20px → 12px；Lightning 自动补 Safari<16.4 polyfill，dist 纯拼接保留）② 层序修正 `@layer tokens, base, layout, components, utilities`（工具类提到 components 之后 = Tailwind 惯例）→ 实证 `.wf-card--pad-lg.wf-padding-none` 24px → **0** ③ 删 `_hidden.css` 的 `!important` 变通（根因已消——注释同步改写）④ 变量钩子官方化：4 个钩子进文档 + 幽灵 token `--wf-w-sm` 定案（补声明或改字面量）⑤ 冲突面：7 对共用组合逐对定案（`wf-row wf-stack` 类无意义组合 → 契约登记「禁止共用」或合成类）⑥ **零值档位补齐**：`wf-padding-none` / `wf-radius-none`（取消面完备——L5d 矩阵翻转 + L1 计数登记） | W0 语义契约 **①②③⑤ 翻转·④ 不变**（污染 12px / 覆盖生效 4px / 零值档 0px / 无 `!important` 仍 `display:none` / 组合行为显式）· layout `!important` 声明 **5 → 4**（仅剩 reduced-motion 合法面）· 契约全绿（≥434）· showcase 328 + 场景 123 全绿 · 人工抽查（agent-platform 三页 + showcase 首页截图前后对比存实录）· `@property` 在两管线均存在的断言（dist + dev） |
| **W3** | **断点单源 + inert token 转机制源**：① 断点白名单审计（`style-audit` 增 **S8** 或 inventory 增 **L9**——L8 已被 W0 冲突矩阵占用）：全部 `@media` 宽度值必须 ∈ 由 `--wf-bp-*` 派生的白名单（`min-width: <bp>` / `max-width: <bp - 0.02px>` 唯一 complement 形态）——**token 从装饰变事实源（有行为）** ② 现存违规 4 处修正（`639px`×3 DatePicker/Drawer/Modal · `767px`×1 Transfer → 统一 complement 形态）③ `app.css` 手抄断点对齐机制化（消费侧可用同一白名单校验脚本 or 文档明示）④ 断点变体扩面**按消费证据逐类登记**（L1 白名单 `{wf-flex, wf-hidden}` 扩面需附消费者；无证据 → 判负） | 新审计断言 **0 违规**（layout + 组件 + apps CSS 全域扫描）· `--wf-bp-*` 零引用 token 消除（被审计消费 → W4 计数联动）· 契约「@media 值形态唯一」绿 · showcase/场景全绿（4 处断点归一后移动面行为不变——390px/768px 双视口断言） |
| **W4** | **token 面收敛（不透明 → 定案）**：① 10 零引用 token 逐个定案（实现或移除——AGENTS.md §3.5「声明了但无行为 = 不透明」；`--wf-bp-*` 已由 W3 转机制源）② 14 组同值多名 → **语义名保留、值改 `var()` 单源引用**（`--wf-dark-state-hover: var(--wf-dark-bg-hover)` 等——公共面不删名）③ **双标尺归一定案**（先探针后决策，不预设）：方案 A 归一值（`gap-md` 12→16 等——爆炸半径 142 处 + 截图对比）/ 方案 B 改名去歧义（`gap-*` 档位换词根）/ 方案 C 判负（文档化 + 审计冻结新档位）④ layout 类文件 25 处 px 字面量按 S6 同款登记制收口（图标/命中区白名单，其余 token 化） | token 计数变更**三处同步**（L1 断言 + README 计数行 + docs/client.md §3——W5 哨兵扩围后自动）· 零引用 token **10 → 0** · 同值多 token 组 **14 → 0**（或全部 var 单源）· 双标尺定案记录写实录（含判负理由/推翻条件）· 截图对比（showcase 首页 + agent-platform 三页 + 6 个高消费组件页）人工甄别记录 · 全量回归门绿 |
| **W5** | **可发现性（生成式参考 + 悬空引用清零 + 哨兵扩围）**：① `scripts/layout-reference.mjs`——从 `inventory()` 生成/校验 `docs/layout.md`（144 类全清单：名 / 域 / 声明摘要 / 示例 + 4 变量钩子 + 断点表 + token 分组表 + 层序与覆盖规则）② 契约断言「**文档类集 == inventory 类集**」（覆盖率 100%——新类无文档即红）③ 悬空引用清零：`design/layout-naming.md`（5 处）→ 命名规则并入 `docs/layout.md`（design/ 不复活——单源在 docs）· 连带 `design-language.md`（`_base.css:250`）/ `style-professional-plan.md`（`FileTree.css:2`）/ `CONTRIBUTING.md:80` / `layout-inventory.mjs:132` 扫描面——共 **8 处**改指现有文档 · docs/client.md §3 `style.css` 路径修正 · §4 计数 49/92 → 50/97 · 词根表指向 `docs/layout.md`（不再指不存在的 demos/layout.tsx）④ **L6 计数哨兵扩围**到 docs/client.md（当前只查 README）+ AGENTS.md「8 断言」→ 实际数 ⑤ 零消费 10 类 + 豁免 14 项定案：文档化（示例 = 可发现）或裁剪（库公共面 → 判负登记） | 文档类覆盖率 **100%**（契约断言）· 悬空引用 **8 → 0**（`grep -rn "design/" src scripts CONTRIBUTING.md` 零命中——断言可入 audit:docs）· docs 计数与 inventory 全等（L6 扩围）· 豁免清单 14 项每项有「文档化 or 判负」归属 · audit:docs 绿 |
| **W6** | **载荷（minify + 基线兑现 + 按需面判负）**：① `build.mjs` CSS minify（esbuild——探针实证保留 `@layer` / `@property` / `@supports` / 转义 `\@`）· 同名产物（消费面零改动）② `audit:bundle` CSS 基线兑现下降（W0 锚 → 本波更新，只降不升）③ 文档化「无组件应用只引 `weifuwu/layout`」（27.7K/br 4.9K 独立面）④ **按需子集判负登记**（per-component CSS 子路径 / purge——96% 规则无关但改造成本 + 动态类名风险） | dist CSS 字节：layout **49.7K → 27.7K**（br 12.1K → **4.9K**）· style.css **311.6K → 220.6K**（br 41.7K → **23.7K**）· **L7 PostCSS 解析契约绿**（minify 产物）· W0 语义契约在 minify 产物上仍绿（**5 断言不变**——minify 不改语义）· audit:bundle CSS 行更新且 exit 0 · showcase/场景全绿 |
| **W7** | **收尾**：全量回归门（契约 + 场景 + showcase + server + shared + 平台 · `audit:all` 全线 · `tsc` 0）· 生效规则并入 docs/client.md §4 + AGENTS.md（CSS 装配单源 / 层序覆盖语义 / `@property` 钩子 / 断点白名单）· CHANGELOG 登记 · 本计划按 plan/plan.md §5 归档 git | 五域 + 平台全绿 · audit 全线 exit 0 · tsc 0 · 防线快照数字更新（契约/场景/showcase/token/类计数）· 计划文件删除（git log 承接） |

## 判负记录（可被新论证推翻）

- **容器查询 `@container`**：不做——全库消费 **0**（layout + 组件 CSS），断点变体
  + `useBreakpoint` 已覆盖现有需求；推翻：出现「组件需按**容器**宽度自适应且断点
  变体不足」的实例（≥2 消费者）
- **per-app CSS purge / 按需子集**：不做——首页 96% 规则无关（1959/2021）但
  ① 动态类名（数组 join / 条件类）静态扫描漏删风险 = 视觉破损 ② 消费侧改造成本
  （构建期挂钩）③ br 后 23.7K（W6 后）尚非瓶颈；推翻：真实应用首屏 CSS 成为
  LCP 阻塞的实测数据（或 style.css br > 60K）
- **RTL / 逻辑属性化**：不做——物理方向属性 37 处 vs 逻辑属性 1 处，但 RTL 需求
  证据 **0**；推翻：出现 RTL 语言消费者（届时 `padding-inline` 化 + `dir` 审计）
- **移除 8 个 LIB_SURFACE 零消费类**（`wf-absolute`/`wf-cover`/`wf-layer`/`wf-nav`/
  `wf-nav-group`/`wf-radius-lg`/`wf-safe-*`）：不做——原语是 npm 公共面，删除需
  主版本决策；改 W5 文档化（示例 = 可发现）；推翻：主版本裁剪窗口开启
- **断点变体全类面铺开**（144 类 × 4 断点）：不做——类面爆炸（+432 规则）而现有
  消费仅 6 处；按消费证据逐类登记（L1 白名单制）；推翻：某变体消费 ≥3 处
- **移动抽屉壳原语入库**（app.css 131 行手搓）：不做——单消费者（agent-platform）
  ——按复用纪律归平台层；推翻：第二消费者出现且结构同构
- **双标尺归一方案 A（改值）**：待 W4 探针定案——若截图对比显示视觉破损面 > 10 页
  则转方案 C（判负 + 审计冻结新档位）；推翻条件与判负理由随 W4 实录写入
- **Tailwind 兼容面 / 预设生成**：不做——零依赖自研纪律（tailwind 已是 optional
  peerDep，仅作 dev 管线意外参与者——W1 后 weifuwu 入口不再经它）

## 执行实录（边做边记）

（待 W0 起填——每波次：commit hash · 探针重定位 · 回归数字 · 甄别结论）

> **W0 前探针复验（重定位实录）**：初版动机 ② 的证据 `.wf-card--pad-lg + .wf-padding-none
> → 24px` **无效**——复验发现 `wf-padding-none` **根本未定义**（类缺失，非层序压制）。
> 改用有效样本重测（`.wf-padding-xs`/`.wf-padding-lg`/`.wf-btn + wf-padding-lg` 三组
> + 对照组 `.wf-padding-xs` 单独 = 4px）——层序压制结论成立且**双向**。
> 副产品：暴露「**零值档位不对称**」新缺口（`margin`/`gap`/`bg`/`border` 有 none 档，
> `padding`/`radius` 无）——已入探针表 + W0 L5d 基线 + W2 补齐项。
> 教训：浏览器探针的「失效」读数必须先排除「类未定义」（L3 缺口面）再归因层序。

| 波次 | commit | 结果 |
| --- | --- | --- |
| W0 | `f90186e7`（立项）· `23f0b080`（实现） | 契约 **433 → 435**（L5d 零值档位矩阵 + L8 冲突矩阵登记——layout-inventory 9 → 11 断言）· 场景 **123 → 128**（新文件 `e2e-layout-semantics.test.ts` 5 断言 + registry 场景 `layout-semantics`）· `audit:bundle` 增 CSS 双面（dist 口径——layout 50878/14831 · style.css 319052/57043）exit 0 · `audit:all` 全线 exit 0 · `tsc`/`tsc:test` 0 · **负控已验**（删登记项 → L8 红 · BASELINE 加 padding → L5d 红 · CSS 基线压低 → audit exit 1）· **5 断言在两条管线下读数一致**（场景 server 降级层序 vs dist 五层——②③ 结果同：utilities 在两管线均位于 components 之前）· 附带修正 docs/AGENTS 计数漂移（433/123/8 断言 + §4 49/92 → 50/97） |
| W1 | | |
| W2 | | |
| W3 | | |
| W4 | | |
| W5 | | |
| W6 | | |
| W7 | | |

## 验收标准

- [ ] **装配单源**：CSS 聚合实现 1 处（`scripts/css-bundle.mjs`）——四管线 (类 → @layer)
      映射全等契约绿；`ctx.ui.css` 新鲜度键含 `@import` 闭包；自建 CSS 路由零缓存头 = 0
- [ ] **层叠语义确定**：工具类可覆盖组件样式（`.wf-card--pad-lg + .wf-padding-xs` = 4px）·
      零值档位对称（padding/radius 有 none 档）· `--wf-gap` 继承污染 0
      （`@property inherits:false`）· layout `!important` 声明 5 → 4（仅 reduced-motion）·
      `_hidden.css` hack 注释消除
- [ ] **断点单源**：`@media` 宽度值 100% ∈ `--wf-bp-*` 派生白名单（审计 0 违规）·
      inert token 转机制事实源
- [ ] **token 面透明**：零引用 token 0 · 同值多名组 0（或 var 单源）· 双标尺定案有记录 ·
      计数三处同步（L1 / README / docs）
- [ ] **可发现性**：`docs/layout.md` 类覆盖率 100%（契约）· 悬空引用 **8 → 0**
      （`grep -rn "design/" src scripts CONTRIBUTING.md` 零命中——可入 audit:docs）·
      L6 哨兵扩围 docs/client.md · 豁免 14 项全有归属
- [ ] **载荷**：style.css br 41.7K → **≤24K** · layout br 12.1K → **≤5K** · CSS 体积进
      audit:bundle 基线（只降不升）
- [x] **防线不退**：conflictMatrix 激活（169 对基线 + 共用对登记）· 死类 0 · L4/L5 0 ·
      style-audit 0 错误（警告 ≤78 基线）——**W0 已兑现**（layout-inventory 9 → 11 断言）
- [ ] **全量回归门绿**：契约 + 场景 + showcase + server + shared + 平台 · `audit:all` 全线 ·
      `tsc --noEmit` 0
- [ ] 生效规则并入 docs/client.md §4 + AGENTS.md · CHANGELOG 登记 · 本计划归档 git
