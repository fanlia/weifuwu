# weifuwu/layout 优化方案(第二轮——2026-12)

> 前置:第一轮缺口补齐已归档(`design/layout-plan.md`——58→66 原语 / 136→156 工具类)。
> 本轮驱动:**机制审计**——已建的基础设施(清单/矩阵/审计)哪些没接线,
> 消费侧第二轮差异,文档与实现的漂移,交付体积。每条问题带实证位置。

## 0. 现状基线(实测)

```
66 布局原语 + 157 工具类 + 182 Token(src 46 文件 / 1534 行)
dist:layout 60KB / components style.css 308KB(未压缩——JS 已 minify,CSS 没有)
基础设施:
  scripts/layout-inventory.mjs   L0 清单(类/属性指纹/冲突矩阵/死类)
  scripts/style-audit.mjs        S1-S7(Token/色值/动效/字号——组件层红线)
  scripts/build.mjs LAYER_OF     @layer 映射 + 未登记报错防呆
  showcase /layout[/:id]         原语族演示页(消费 registry/primitives.ts)
```

## 1. 问题清单(每条有实证)

### A 类:防线缺失(机制已建未接线——本轮核心)

| # | 问题 | 实证 |
|---|------|------|
| A1 | **inventory 零契约消费**:`layout-inventory.mjs` 头部声称"消费方:`src/client/layout/style-audit.test.ts`(计数/组合防线)"——**该文件不存在**;`registry/primitives.ts` 声称"计数与 inventory 同源(style-audit 断言零漂移)"——**无此断言** | `grep -r layout-inventory src/` 只命中脚本自身 |
| A2 | **悬空文档引用**:inventory 自述"design/layout-optimize.md L0"——文件不存在(本文补上) | `ls design/layout-optimize.md` 报错 |
| A3 | **冲突矩阵无消费**:488 对同属性互斥基类(display 348/align-items 71/…)——同元素组合时 import 顺序定胜负,无文档矩阵、无测试基线 | `node scripts/layout-inventory.mjs` |
| A4 | **消费侧缺口无持续检测**:第一轮是手工差异审计——无"使用但未定义类"断言,缺口会再次无声累积 | 本轮手工审计又发现 10+ 个(见 B2) |

### B 类:实现缺陷(实际死代码/缺口)

| # | 问题 | 实证 |
|---|------|------|
| B1 | **无效选择器死规则**:`_flex.css` L12-13 `.wf-flex@sm` / `.wf-flex@md`(未转义 @——CSS 非法选择器,浏览器整条丢弃;转义版 `\@` 已存在) | `grep '\.wf-[a-z-]*@' src/client/layout/*.css` 仅这两条 |
| B2 | **消费侧第二轮缺口**(真实代码使用、全库未定义): | 审计脚本输出 |
| | ① `wf-text-on-brand`(Reports/Sandboxes)、`wf-text-on-warning`(MessageItem/Reports)——实心填充上的文字色,**真缺口**(`--wf-color-on-brand` token 已有,缺类) | agent-platform 4 处 |
| | ② `wf-min-w-0` `wf-overflow-auto` `wf-relative` `wf-no-bg` `wf-shadow`——常用小工具,真缺口 | Chat.tsx/AgentDetail.tsx 6 处 |
| | ③ `wf-wrap`(MessageItem——wf-row 已内建 wrap,多余) `wf-cursor`(Chat——已有 `wf-pointer`,误写) `wf-dot`(Chat——全内联样式,类名无意义)——**消费侧修正**,不补类 | 3 文件 |
| | ④ `wf-feed-in`/`wf-bump`/`wf-tour-layer`——agent-platform data/public 静态 HTML 残留(应用层自清) | 2 文件 |
| B3 | **showcase registry 错误类名**:`primitives.ts` align 族登记 `wf-align-self-start`(未定义)——实际类名 `wf-self-*`(第一轮 P1-1 定的名)——showcase /layout/align 页展示失效类 | `registry/primitives.ts:23` vs `_align-self.css` |

### C 类:文档漂移(用户照抄即无效)

| # | 问题 | 实证 |
|---|------|------|
| C1 | **style-guide 命名体系与实现不符**:`docs/style-guide.md` 14 处 `wf-layout-*`(wf-layout-stack/row/split/grid/hidden@sm)——实现是 `wf-*`(wf-stack…)。用户按"统一语法"章节照抄 → 零效果。**本轮最高优先级文档修复** | `grep -c 'wf-layout-' docs/style-guide.md` = 14,其余 25 个文档 0 处 |
| C2 | **content/layout 20 页全占位**:"验证"节全是"(P1 填充)",且 `align.md` 代表类列 `.wf-align-self-start`(未定义类——与 B3 同源漂移) | 20/20 文件命中 |
| C3 | **计数硬编码无机器校验**:`layout-guide.md` "66 原语 + 157 工具类 + 182 Token"、`primitives.ts` 头注"66 + 157"——与 inventory 的同步靠人记 | 2 文件 3 处 |

### D 类:交付体积

| # | 问题 | 实证 |
|---|------|------|
| D1 | **dist CSS 未压缩**:layout 50KB / components 289KB——build.mjs 对 JS minify,CSS 仅合并不压缩;esbuild 已在依赖内,零新增依赖。**实测**(esbuild minify):layout 51127→35599B(-30%)、components 295962→230579B(-22%);转义选择器 `\@`/`@media print`/@layer 序均保持 | `du -h dist/client/layout/*` |

### E 类:长期项(本轮不做——登记在案)

- **E1 断点变体扩容**(@xl、更多基类):消费侧零需求——裁剪纪律不扩
- **E2 运行时冲突 dev warn**(同 className 两类互斥 → 警告):需 vdom 解析类名字符串,成本/收益不匹配——冲突矩阵先走文档+测试
- **E3 Token 死引用审计**(定义未引用):inventory 扩展方向,非本轮

## 2. 实施方案(四阶段——按依赖排序)

### Phase 1 防线接线(先机制后内容——防回潮优先)

1. **新建 `src/test/contract/layout-inventory.test.ts`**(node:test 直跑、零浏览器——契约层纪律):
   - 计数基线登记制:原语 66 / 工具 157 / Token 182——允许随实施上调,断言防无声漂移
   - 断点变体类 ⊆ 登记清单(当前 8 个——新增 @变体必须有意)
   - 冲突对数量 ≤ 基线(488——新增互斥组合须解释)
   - 死类 = 0(当前实测 0——锁定)
   - **消费侧缺口归零断言**(A4 机制化):扫描 apps/examples 类名字符串 vs 定义集(含转义 `\@` 归一 + 组件类排除)——"使用未定义类" = 0(应用层自持类需登记白名单)
2. **补 `design/layout-optimize.md`**(本文——消 A2 悬空引用)
3. 挂入 `npm run test:client` 现有 glob(`src/test/contract/**` 自动纳入——零改动)

### Phase 2 第二轮缺口补齐(消费侧驱动——复刻第一轮方法论)

| 动作 | 文件 | 内容 |
|---|---|---|
| 补语义文字色 | `_text.css` | `wf-text-on-brand`(--wf-color-on-brand)、`wf-text-on-warning`(amber-700 系——与 `wf-text-danger` 同族) |
| 补小工具 | `_shrink.css` / `_scroll.css` / `_fixed.css` / `_surface.css` | `wf-min-w-0`(min-width:0)、`wf-overflow-auto`、`wf-relative`(position:relative)、`wf-no-bg`(background:transparent)、`wf-shadow-sm/md/lg`(token 已有,缺类面) |
| 删死规则 | `_flex.css` | 删 L12-13 未转义 @ 无效选择器 |
| 消费侧修正 | agent-platform | `wf-wrap`→删(已 wrap)、`wf-cursor`→`wf-pointer`、`wf-dot`→删类名(纯内联)、静态 HTML 残留类自清 |
| 修 registry | showcase | align 族 `wf-align-self-start` → `wf-self-start`(B3) |

- 补类后 `layout-inventory` 计数上调(基线随动)+ 缺口断言归零

### Phase 3 文档对齐(照抄即有效)

1. **docs/style-guide.md 命名修正**(C1):14 处 `wf-layout-*` → 实现类名;"统一语法"域表的 `layout` 域说明改写为实际形态(`wf-<原语名>` 无域前缀)——**不反向给实现加前缀**(破坏外部 API,诚实裁剪)
2. **content/layout 去占位**(C2):`align.md` 代表类先修(与 B3 同步);其余 19 页"验证"节改为指向 showcase `/layout/:id` 真实演示页(页面已存在——`app-router.ts:50`)+ 逐页 1-2 条最小可跑断言(复用 `puppeteer-smoke.mjs` 能力——批量走查一脚本出)
3. **计数机器同步**(C3):`layout-guide.md` 计数段由 inventory 生成(gen-content.mjs 扩展——或契约测试断言文档数字 == inventory,人工改一处测试逼另一处)——选后者(契约测试已有,零新脚本)

### Phase 4 交付压缩

1. `build.mjs`:layout/components CSS 合并后经 `esbuild.transform(css, { loader:'css', minify:true })` 输出——**源文件保持可读不变**(零侵入哲学),仅 dist 压缩
2. 契约测试加断言:dist layout 体积 ≤ 36KB(防无声膨胀——实测压缩后 35.6KB)
3. 风险点已实测排除:转义选择器 `\@` / `@media print` / @layer 声明序在 minify 后均保持——落地时以契约断言锁定(抽查断言:压缩产物含 `\\@` 与 `print`)

## 3. 验收

| 项 | 命令/标准 |
|---|---|
| 契约层全绿(含新测试) | `npm run test:client` |
| 审计全绿 | `npm run audit:all` |
| 场景/showcase 无回归 | `npm run test:scenario` + `test:showcase`(视觉面——smoke 零 console.error) |
| 消费侧缺口 = 0 | Phase 1 契约断言 |
| `_flex.css` 无非法选择器 | `grep '\.wf-[a-z-]*@' src/client/layout/*.css` 归零 |
| 文档无 `wf-layout-*` / 无"(P1 填充)" | `grep -r 'wf-layout-\|P1 填充' docs content` 归零 |
| dist 体积下降 | layout ≤36KB(实测 35.6)/ components ≤231KB(实测 230.6) |
| showcase /layout/:id 抽查 | agent-browser 走查 3 族页(stack/grid/align) |

## 4. 诚实裁剪(明确不做)

- **不做类名大改/加域前缀**(style-guide 向实现对齐,不是反向)——外部 API 稳定
- **不删任何现存类**(对外承诺——死类只报告,删除需主版本决策,当前死类 0)
- **不扩断点变体/不加任意值语法**(消费侧零需求——原语组合已覆盖)
- **不做运行时冲突 warn**(E2——冲突知识走文档矩阵 + 测试基线)
- **不做 Token 死引用清理**(E3——报告可以,删除风险高)
