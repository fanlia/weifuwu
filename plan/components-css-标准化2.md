# components CSS 标准化 §2——token 消费矩阵 + 弹层钩子接线（2027-xx）

> 一句话目标：组件样式**token 全覆盖的最后两宗**（C1 后探针揭示）——**近值未接线**
> （值=token 却手写）与**钩子失效**（--wf-popup-max 基类被手写覆盖）——外加
> **token 消费矩阵零消费定案**（86/208 零消费——删/留逐项）。
>
> 动机（探针实证——/tmp/probe-c2/c3.mjs，不提交）：
> ① **TSX inline style 面完全干净**（px 0 · 色 0——双面锁定达成）
> ② **行高近值未接线**：手写 62 处——**1.5 ×6 = `--wf-line-height` 恒等**（近值）·
>    **1.25 ×2 = `--wf-line-height-tight` 恒等**；其余 1.6×10（代码排版——CodeBlock/
>    DiffView 同义——2 消费者 <3 升档门）· 1.3×5/1.4×4/1.2×2（档位空洞——紧凑正文）
>    · 1×20/0×8/px×2（重置/图标——结构豁免）· 已有 var 15 处
> ③ **弹层钩子失效**：Popover `max-width: 320px` · Tooltip `max-width: 240px` 手写
>    **覆盖 .wf-popup 基类钩子**（`min(var(--wf-popup-max, 480px), calc(100vw - 32px))`
>    ——_popup.css:7）——--wf-popup-max 调不动这两个组件（钩子名存实亡）；Popover
>    已有私有钩子先例（`min-width: var(--wf-popover-width, 160px)`）
> ④ **token 零消费 86/208**：色板深档（amber/brand/green/red/sky/slate 50-900 + dark-*）
>    保留（设计色板——layout/_dark.css 映射层消费）· 布局档（sider/sidebar-width·
>    cols/align/justify/offset/max/w-sm）保留（Layout 面——组件域不消费合理）·
>    bp-* 消费形态是媒体查询字面量推导（非 var()）不算死 · **真死候选**（--wf-letter-spacing-wide
>    0 · --wf-gap-lg/xl/2xl 0 · --wf-line-height-relaxed 0 · --wf-z/--wf-pop-z/--wf-cover-z 0
>    ——z 档：layout 弹层基类消费（.wf-popover/.wf-modal）组件 0 合理）

## 现状探针（2027-xx 读数）

| 面 | 读数 | 判定 |
| --- | --- | --- |
| TSX inline style | px 0 · 硬编码色 0 | **干净**（CSS+JS 双面锁定） |
| line-height | 手写 62 处（1.5×6 恒等 token · 1.25×2 恒等 tight · 1.6×10 代码 · 1.3/1.4/1.2 空洞 · 1×20 重置 · 0×8 · px×2）· var 15 处 | 近值接线面 + 登记面 |
| letter-spacing | 手写 0 处 · token --wf-letter-spacing-wide 0 消费 | 死档候选 |
| 弹层宽 | Popover 320px · Tooltip 240px 手写覆盖基类钩子 · Command 520px（面板语义判负）· SheetGrid 320px（工作区结构判负） | 钩子接线面（2 处）+ 判负 2 处 |
| popup-max 钩子 | _popup.css:7 基类消费 ✓ · Editor 私有钩子先例（--wf-editor-popup-max）✓ | 机制健康——组件面漏接 |
| z 档（pop-z/cover-z/z） | 组件 0 消费——layout 弹层基类消费（.wf-modal/.wf-popover） | 合理零消费（层叠在布局面） |
| token 消费矩阵 | 组件 var(--wf-*) 引用 3343+（W1 后 +49 · W3 后 +163 发丝——TBD 重数）· 零消费 86/208 | 登记制定案 |

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| **W0** | **防线先行（C2 哨兵——不改 CSS）**：新契约 `src/test/contract/components-token.test.ts`：① **line-height 桶**（组件手写 line-height——豁免面 {1,0,px 值} 白名单·近值接线登记·空洞登记）② **弹层宽桶**（usePopup 系组件面板 max-width 手写 → 钩子接线登记）③ **token 消费矩阵**（零消费登记制——对齐 L11 组件版：{保留类, 真死候选} 双分类——新增死档/接线面登记）· 登记表 `scripts/components-token-whitelist.json` · 负控三桶各红 | `test:client` 新文件绿（基线：line-height 手写 62 · 弹层宽 2 · 零消费 86）· 负控全验 · 现有测试零回归 |
| **W1** | **line-height 接线**：1.5 ×6 → `var(--wf-line-height)` · 1.25 ×2 → `var(--wf-line-height-tight)`（预设/暗色零覆写实证 → 全主题恒等 1.5=1.5——零视觉变更）· 豁免面登记（1 重置 ×20 · 0 ×8 · px 图标 ×2）· 空洞登记（1.3×5/1.4×4/1.2×2——档位空洞）· **代码档判负**（1.6×10——2 消费者 <3 升档门；推翻：第三消费者出现即升 --wf-line-height-code） | C2 line-height 桶手写 62 → **接线+豁免登记完备**（近值 0）· showcase 328 全绿 · test:client 全绿 |
| **W2** | **弹层钩子接线**：Popover `max-width: 320px` → `min(var(--wf-popup-max, 320px), calc(100vw - 32px))` · Tooltip 240px 同款（回退=原值——**视觉零变** + --wf-popup-max 钩子恢复生效）· Command 520px / SheetGrid 320px **判负**（面板语义/工作区结构——单消费者——私有钩子候选待第二消费者）· 弹层滚动高（max-height 280/240px 等）**判负**（内容密度组件域） | C2 弹层宽桶 2 → **0**（钩子接线）· 钩子实证（Playwright：设置 --wf-popup-max: 400px → Popover max-width 变 400（原来 320 不动））· showcase 328 全绿 |
| **W3** | **零消费 86 项定案**：逐项分类 → **保留登记**（设计色板/暗色档/布局档/bp/z 档——消费形态非 var()（媒体查询/映射层）·「有用但组件 0 消费」——判负删除：token 公共 API（npm 导出——删除=breaking）；**真死候选审计**（--wf-letter-spacing-wide · --wf-gap-lg/xl/2xl · --wf-line-height-relaxed——4 巨头同 W3 先例流程：注释核伪（假死）→ 删/留） | 零消费表逐项定案（保留理由/死档判决+推翻条件）· 删除需契约同步（L11 数字/文档）· audit:theme/docs 绿 |
| **W4** | **收尾**：负控复验 · docs/client.md §5.4 补（line-height 纪律：文本标尺值走 --wf-line-height-*——1.5/1.25 恒等档 · 弹层宽纪律：usePopup 系禁止手写 max-width——基类钩子唯一入口——要默认宽改私有钩子回退）· 全量回归门 · 计划归档 | 五域+平台全绿 · audit 七线 exit 0 · tsc 0 · 纪律成文 · 计划归档 |

## 判负记录（可被新论证推翻）

- **1.6 代码行高升档**：不做（CodeBlock/DiffView 2 消费者——<3 升档门；推翻：第三代码排版消费者出现）
- **1.3/1.4/1.2 接线**：不做（档位空洞——tight 1.25/base 1.5 之间——接线=视觉变化 5-10%；推翻：正文排印统一档提案）
- **Command 520px / SheetGrid 320px 接线 --wf-popup-max**：不做（命令面板宽/工作区面板——非通用浮层语义——单消费者；推翻：组件改用 usePopup 或出现第二弹层面板消费者）
- **弹层 max-height 接线**：不做（内容密度组件域——下拉列表/item 高度各异；推翻：跨组件统一滚动高提案）
- **删除零消费 token**：需满足「代码注释核伪 + 零引用 + 非公共 API 承诺」（公共 API 删除=next-major；推翻：next-major 版本发布窗口）

| W0 | | **防线先行（C2 三桶哨兵——未改组件 CSS）**：新契约 `src/test/contract/components-token.test.ts` + `scripts/components-token-whitelist.json`：① **line-height 桶 27**（手写非豁免——豁免面 {1 重置×20 · 0×8 · px×2} 内联）——近值登记（1.5·×6 恒等 `--wf-line-height` / 1.25·×2 恒等 tight）+ 代码档 1.6×10（2 消费者）+ 空洞 1.3/1.4/1.2；② **弹层面板宽桶 12**（max-width/width 含 px ≥100——var()/calc() 豁免（钩子已接/派生）· %/vw/em 豁免（自适应）· 14-28px 结构值归 C1）——Popover 320 · Tooltip 240（钩子失效面）· Command 520（min() 形态）· EmptyState/HoverCard/Notification/Pipeline/Result/SheetGrid/SlideCanvas/Toast/Tour；③ **零消费 86/208**（占位——W3 定案）。**探针修正四次**：TSX inline 全干净（px 0 · 色 0——双面锁定）· 弹层宽桶重构三次（图标宽 32px 混入 → 值域≥100 · 相对值 100%/90vw 混入 → 含 px 限制 · Editor 私有钩子 var() 混入 → var 豁免——最后 26→12）。**负控三桶全验**（line-height 1.5 · max-width 640px · 新 token 定义 各红）。**回归**：契约 451→**452**（C2）· 现有测试零回归。 |
| W1 | | **line-height 接线（8 处近值清零）**：`line-height: 1.5` ×6（WordCloud/Mentions/Tag/Popconfirm/ChatInput/Kanban）→ `var(--wf-line-height)` · `1.25` ×2（Markdown/Typography）→ `var(--wf-line-height-tight)`——**预设/暗色零覆写实证**（line-height 全表无覆写——全主题恒等 1.5=1.5 零视觉变更）。**登记面留档**：1.6 代码档 ×10（CodeBlock/DiffView——2 消费者 <3 升档门）· 1.3×5/1.4×4（档位空洞——判负接线）· 豁免面 {1 重置 ×20 · 0 ×8 · px 图标 ×2} 内联白名单。**回归**：C2 line-height 27→**19** · showcase 328 · 场景 129 · dist +154B（gzip 平）· 契约 452。 |
| W2 | | **弹层钩子接线（Popover/Tooltip——钩子恢复生效）**：`max-width: 320px/240px` → `min(var(--wf-popup-max, 320/240px), calc(100vw - 32px))`——**钩子实证（Playwright）**：回退 320px（视觉零变）· popup-max=400→400px · 280→280px（框架钩子恢复可调——原手写覆盖 = 钩子名存实亡）。**判负 10 项**（Command 520 命令面板 · HoverCard/Tour 自定义浮层 · Toast/Notification 通知条宽度语义 · EmptyState/Result 内容区 · Pipeline/SheetGrid/SlideCanvas 工作区结构——均非 usePopup 面板）。弹层滚动高（max-height 240-320px）**判负**（内容密度组件域）。**交叉影响**：C1 结构桶 Popover/Tooltip max-width 登记随接线移出（479→477）· C2 零消费 --wf-popup-max 出桶（86→85——钩子被组件消费）。**回归**：C2 弹层宽 12→**10**（判负面留档）· showcase 328 · 场景 129 · 契约 452 · dist +90B。 |
| W3 | | **零消费定案（83 项全保留——0 删除）**：五类保留理由入档——① 暗色/语义色家族 **44**（--wf-dark-* 由 _dark.css 映射层消费——组件走 --wf-color-* 间接面——映射层消费=非死）② 布局档 9（Layout utilities 消费——组件域不消费合理）③ 断点档 4（L10 机制——媒体查询字面量推导形态≠var() 引用）④ gap 大档 3（派生对称档——L11 gap-2xl keep 先例）⑤ z 档 3·文本档 2·阴影/转场裸档 3·语义接线钩子 4（兼容保留——tokens.css 注释明文「不建议新引用」）。**伪 token 根修**：`--wf-dur-`/`--wf-dark-slate-50` 是**注释残名**（W3 layout 删除留注释）——C2 定义解析**剥注释**（与 L14 剥 var 同源）——86→83。**删除 0**（公共 API——理由：档位完整性 + 消费形态非 var() + 无破坏收益）。 |