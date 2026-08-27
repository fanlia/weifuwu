# weifuwu/layout 清理方案(开发阶段减法——2026-12)

> ## ✅ 已实施(2026-12)——与 layout-naming.md 合批执行完毕。
> 成果:223 → 144 类(50 原语 + 92 工具 + 2 内部)· 46 → 33 文件 ·
> 断点变体 24 → 3 · 消费侧迁移 80 文件 · 契约测试 8 断言锁定 ·
> 全量回归绿(契约 207 / 场景 116 / showcase 200 / dev 审计 160 页零问题)。
> 实修新增踩坑:类名重命名与测试 `[class*="子串"]` 选择器碰撞
> (wf-padding-* 含 "add"——comp-tabs 定位器误点实证——定位器已修为精确类名)。
>
> **前提变更**:开发阶段,消费方仅 `weifuwu/components`(组件内部)、
> `apps/showcase`、`apps/agent-platform` 三处——全部仓库内。
> "不删类"的对外 API 约束解除,**可以做真减法**。
>
> **设计立场**(用户定调):简单好用,秉持 token 设计方案——
> 类 = token 的薄语义包装,定制走 token,类面只随消费证据生长。
>
> 依据:`design/layout-essence.md` 全库消费审计
> (218 基类仅 133 被消费;47 类覆盖 90% 引用)。

## 1. 三条清理原则

| # | 原则 | 含义 |
|---|------|------|
| P1 | **消费证据制** | 零消费的类删除——需要时由缺口审计机制化重新长出(一行/类) |
| P2 | **单机制** | 同意图只留一套机制(交叉轴对齐三套 → `wf-items-*` 一套 + `wf-self-*` 子项面) |
| P3 | **token 薄包装** | 保留的类全部单职责、引用 `--wf-*` token、无硬编码(style-audit S1 已强制) |

例外规则:**四件套语义完备**(items-*/self-* 对齐四态)在≥半数被消费或
作为迁移目标时整体保留——对齐是词汇不是标尺。标尺类(间距×方向×档位)
不适用此例外,严格按消费裁剪。

## 2. 删除清单(84 死类 + 21 死变体 + 10 文件)

### 2.1 整文件删除(10 个——全部类零消费)

| 文件 | 类 | 删除理由 |
|---|---|---|
| `_around.css` `_evenly.css` | wf-around(1 次) wf-evenly(1 次) | space-around/evenly 真实 UI 不用;2 处消费迁 `wf-between`/内联 |
| `_top.css` `_bottom.css` `_stretch.css` | wf-top(4) wf-bottom(5) wf-stretch(4) | 被 `wf-row/stack + wf-items-*` 完全取代(P2——13 处迁移见 §4) |
| `_auto.css` | wf-auto | flex:auto 是默认行为,0 消费 |
| `_inline.css` `_inline-block.css` `_contents.css` | wf-inline wf-inline-block wf-contents | 0 消费(display 族收敛到 hidden/block/flex) |
| `_fixed.css` | wf-flex-none wf-fixed wf-pin | 全零消费——浮层定位已由组件层承接(openPopup/FloatButton);`wf-cover`(fixed inset)保留 |

### 2.2 文件内裁剪

| 文件 | 删除内容 | 保留 |
|---|---|---|
| `_spacing.css` | **46 类**:`-2xl` 档全部(7)、`my-*` 全部(7)、`mr-*` 全部(8)、`ml-{md,lg,xl,2xl,auto,none}`(6)、`pt-{xs,md,lg,xl,2xl}`(5)、`pb-{lg,xl,2xl}`(3)、`px-{xs,lg,xl,2xl}`(4)、`py-{xl,2xl}`(2)、`p-{0,2xl}`(2)、`mt-{lg,xl,2xl,auto}`(4)、`mb-{xl,2xl,auto,none}`(4)、`mx-none`、`w-{xs,md,lg,xl,auto,max,md-auto}`(7) | 44 类:实际消费组合(p-{xs..xl}/px-{sm}/py-{xs..lg}/pt-sm/pb-{xs,sm,md}/m-0/mt-{xs,sm,md,none}/mb-{xs..lg}/ml-{xs,sm}/mx-auto/gap-{none..xl}/w-{full,sm}/h-full/mt-none) |
| `_text.css` | **12 类**:wf-capitalize wf-lowercase wf-line-clamp-2/3 wf-text-5xl/xl/disabled/info wf-tracking-normal wf-leading-base/relaxed/tight | 30 类(字号/字重/语义色/对齐/截断主档) |
| `_surface.css` | wf-bg-info wf-bg-success(0 消费) | 其余 15(含 bg-warning/error——有消费) |
| `_row.css` | wf-items-start wf-items-stretch **暂缓删**——是 §4 迁移目标,迁完仍 0 消费则按四件套规则保留(对齐词汇) | wf-row wf-row-reverse wf-items-* |
| `_hidden.css` | wf-not-allowed wf-print-hidden wf-print-block(0 消费) | wf-hidden/@lg wf-dim wf-pointer |
| `_popup.css` | 不删——**标注 internal**(popup-manager.ts 框架内部消费,非用户词汇):inventory/文档不再列为原语 | wf-popup wf-popup-mask |

### 2.3 断点变体大裁剪(24 → 3)

变体消费审计:24 个 `@sm/@md/@lg` 变体仅 3 个有消费。

| 删除(21 个) | 保留(3 个) |
|---|---|
| `stack/stack-reverse/row/row-reverse/between/block` 全部 @sm/@md/@lg(18)、`hidden@sm/@md`(2)、`flex@md`(1) | `wf-hidden@lg`(2 次)、`wf-flex@sm`(1)`wf-flex@lg`(5)——"窄隐宽显"唯一响应式模式 |

响应式策略诚实化:现存应用全部用 `wf-hidden + wf-flex@lg` 切换模式,
"断点转向"(`stack@md→横向`)零消费——不供养未使用的抽象。

**清理后规模:223 → ~143 类(-36%)·46 → 36 文件**

## 3. 新增清单(消费证据已在但类缺失——7 个)

| 类 | 定义 | 消费证据 |
|---|---|---|
| `wf-min-w-0` | `min-width: 0` | Chat.tsx(flex 收缩坑标配) |
| `wf-overflow-auto` | `overflow: auto` | AgentDetail.tsx |
| `wf-relative` | `position: relative` | Chat.tsx |
| `wf-no-bg` | `background: transparent` | Chat.tsx |
| `wf-shadow` | `box-shadow: var(--wf-shadow)` | Chat.tsx(token 已有——薄包装) |
| `wf-text-on-brand` | `color: var(--wf-color-on-brand)` | Reports/Sandboxes |
| `wf-text-on-warning` | `color: var(--wf-amber-700)` 语义映射 | MessageItem/Reports |

## 4. 消费侧迁移(全部仓库内——逐点清单)

### layout 类替换

| 位置 | 现状 | 改为 |
|---|---|---|
| showcase `demos/data-display.tsx:283` | `wf-row wf-gap-lg wf-top` | `wf-row wf-gap-lg wf-items-start` |
| showcase `demos/data-display.tsx:118` | `wf-row wf-gap-md wf-bottom` | `wf-row wf-gap-md wf-items-end` |
| agent-platform `MessageItem.tsx:93` | `wf-row wf-top wf-gap-sm` | `wf-row wf-items-start wf-gap-sm` |
| agent-platform `MessageItem.tsx:224` | `wf-row wf-gap-xs wf-top` | `wf-row wf-gap-xs wf-items-start` |
| agent-platform `MessageItem.tsx:95` | `wf-stack … wf-bottom` | `wf-stack … wf-items-end` |
| agent-platform `Dashboard.tsx:136` `Reports.tsx:125` | `wf-row wf-bottom wf-gap-md` | `wf-row wf-items-end wf-gap-md` |
| agent-platform `Dashboard.tsx:128` `Reports.tsx:122` | `wf-stretch wf-gap-md`(style flex-wrap) | `wf-row wf-items-stretch wf-gap-md` |
| examples `patterns/Docs.tsx:41` | `wf-row … wf-stretch wf-nowrap` | `wf-row … wf-items-stretch wf-nowrap` |

### 消费侧错误类修正(不补类——改消费)

| 位置 | 现状 | 改为 |
|---|---|---|
| Chat.tsx:575 | `wf-w-56`(未定义——Tailwind 式误写;同行已有 inline width) | 删类 |
| MessageItem.tsx:74,138 | `wf-wrap`(未定义——wf-row 已内建 wrap) | 删类 |
| Chat.tsx | `wf-cursor`(未定义) | `wf-pointer` |
| Chat.tsx:584 | `wf-dot`(空类——全内联样式) | 删类名 |
| agent-platform data/public 静态 HTML | `wf-feed-in/wf-bump/wf-tour-layer` | 应用层自决(定义局部样式或删除——不属 layout) |

## 5. 同步面(文档/showcase/构建)

1. **showcase `registry/primitives.ts`**:族表重写——删 position 族 wf-pin/fixed
   条目、align 族改 `wf-self-*` 实例、hidden 族只列 `wf-hidden/@lg + wf-flex@lg`、
   计数注释更新;`gen-content.mjs` 重生成 `content/layout/*.md`(20 页)
2. **`docs/style-guide.md`**:`wf-layout-*` 14 处 → 实际类名(本质分析 §5 的
   文档对齐项);第二档"10 核心原语"改为审计 TOP 10 实证清单
3. **`content/guides/layout-guide.md`**:66 原语表 → 清理后清单;
   `layout-choice.md` 决策树删 `wf-pin`/`stack@md` 条目,响应式节改写为
   `wf-hidden + wf-flex@lg` 模式
4. **`scripts/build.mjs`**:LAYER_OF 删除 10 个已删文件条目;
   `weifuwu-layout.css` 入口 @import 列表同步
5. **`scripts/layout-inventory.mjs`**:UTILITY_FILES/NON_CLASS_FILES 登记同步;
   `_popup.css` 增加 internal 分类(inventory 单列不计入原语/工具计数)
6. **README**:布局系统节计数与类表同步(若有)

## 6. 机制化锁定(清理成果防回潮——新契约测试)

新建 `src/test/contract/layout-inventory.test.ts`(node:test 零浏览器):

| 断言 | 语义 |
|---|---|
| 计数基线(登记制) | 原语/工具/变体数 = 清理后基线——变更必须有意 |
| **死类 = 0** | 每个类在 apps/examples/组件 有消费证据(internal 类豁免登记) |
| **缺口 = 0** | 消费侧"使用未定义类"归零(含转义 `\@` 归一) |
| 无非法选择器 | 未转义 `@` 的类选择器 = 0(本次 `_flex.css` 死规则根因) |
| 文档计数 == inventory | layout-guide.md/style-guide 数字机器校验 |
| dist 体积 ≤ 基线 | 防无声膨胀 |

## 7. 执行顺序(每步独立可验证)

```
① layout 本体:删 10 文件 + 裁剪 4 文件 + 删 21 变体 + 修 _flex.css 非法规则 + 新增 7 类
② 消费侧迁移:§4 逐点替换(8 处类替换 + 5 处错误类修正)
③ 构建同步:build.mjs LAYER_OF + 入口 @import + inventory 登记
④ 契约测试:layout-inventory.test.ts 落地(基线取清理后实测值)
⑤ 文档与 showcase:§5 六项同步
⑥ 回归验收
```

## 8. 验收

| 项 | 标准 |
|---|---|
| 契约层 | `npm run test:client` 全绿(含新测试) |
| 审计 | `npm run audit:all` 全绿 |
| 场景层 | `npm run test:scenario` 全绿(导航/SSR/弹窗无回归——popup CSS 保留验证) |
| showcase | `test:showcase` 全绿 + `/layout` 族页抽查(3 族) |
| agent-platform | 类型检查 + 冒烟(`scripts/puppeteer-smoke.mjs` 或 agent-browser 走查 Chat/Dashboard/Reports) |
| 规模 | 类数 ~143 / 文件 36 / dist layout 体积下降(压缩项并入可选) |
| 残留 | `grep -rn 'wf-top\|wf-around\|wf-auto\|wf-inline\|wf-fixed\|wf-stack-reverse' apps examples src docs content` 零命中(除迁移记录文档) |

## 9. 诚实裁剪(本轮不做)

- **不动 token 层**(182 个——组件 CSS 消费面未审计,风险不匹配;
  孤立 token 如 `--wf-w-xs` 下轮审计)
- **不组件化 layout**——零 JS 独立价值(essence §2)
- **不做 dist CSS 压缩**——独立改进项,不与语义清理混批
- **不重命名现存类**——只删不改名(迁移成本最低)
