# 2026-09 WordCloud 词云组件（weifuwu/components）

> 一句话目标：components 库新增**词云组件**（零依赖自绘 SVG——与 Chart 同族），
> 展示词频权重（字号映射）+ 点击/悬停交互。
> 动机：用户明确点名补齐（组件库消费面——词频仪表盘/热门词/评论分析等
> 场景共同缺件）。**诚实登记**：当前无在库消费方——缺口由 showcase 演示驱动
> （与既有组件库扩充同型——不定制只通用）。

## 现状探针（先读数——2026-09-03）

- 组件库：`src/client/components/` 135 组件目录（PascalCase）——`index.ts` 导出面
- 全库 `grep -ri wordcloud/词云` = **0 命中**——缺口确认（无半成品/别名）
- 先例 Chart：零依赖自绘 SVG（Chart.ts 330 行 + chart-utils.ts scaleLinear/
  linePath/pieArcs/getDefaultColor）——**SVG 声明式 = 命令流可 diff + SSR 可吸收**
  ——词云沿用（不引 ECharts/wordcloud 插件——判负见下）
- Chart 色板：JS 内 8 色数组（`#3b82f6…`）——**S1 style-audit 只扫 CSS 文件**
  （JS 色值合法先例）；更优：SVG fill 走 `var(--wf-*)` token（DOM 生效——SSR 同效）
- 注册/审计全自动：`audit-component-coverage.mjs` 三层矩阵**自动发现**
  （组件目录 × contract .test.ts × showcase comp-*.test.ts × 场景）——无手工基线；
  `style-audit S1-S7` 自动扫（CSS 零硬编码色/字号/token 化）
- registry：`apps/showcase/src/registry/components.ts` **追加不替换**
  （id/name/desc/sourceFile/cssFile/testFile + gotchas）
- demo 机制：`src/demos/new-batch.tsx` `DEMOS[name]` 代码示例字符串
  （chart 先例）→ `demos/index.ts` 汇总（自动生成文件——勿手改）
- 契约模板：`mount/createTable`（AuthPage.test.ts 先例——组件目录内 test.ts）
- showcase 模板：`comp-videoplayer.test.ts`（startShowcaseServer/openShowcase/
  COMP_PATH——真实 DOM）
- **欠账登记**：VideoPlayer 仅 2 件套（无契约 test.ts）——新组件必须三件套
  （契约 + CSS + showcase），不追旧欠账（判负：收益不明）

## 核心设计决策（探针定调——波次不回头）

**布局算法**：确定性**行式装箱**（large-first 降序 → 逐行填充 → 行满换行）：
- 同输入同输出（SSR ≡ SPA 首帧，零吸收差异）
- **SVG `textLength` + `lengthAdjust="spacingAndGlyphs"`**→ 渲染宽度精确等于
  估算宽（估算 = 字号 × 字符数 × 0.6——等宽化保证）——**词矩形零重叠**
  （textLength 消解字体度量不确定性）
- ~40 行实现（spiral/collision 免谈——见判负）

**canvas 测宽**：不用（服务端无 canvas——测量只能在 mount 后——破坏 SSR 一致性
+ 首帧空白）。textLength 方案下无需测宽。

**API 形状**（§5.3 纪律）：

```ts
interface WordCloudData { word: string; weight: number; color?: string }
interface WordCloudProps {
  words: WordCloudData[]        // 输入（权重≥0——0 权重不渲染）
  width?: number                // 默认 480
  height?: number               // 默认 260
  maxFontSize?: number          // 默认 32（px）
  minFontSize?: number          // 默认 12
  padding?: number              // 词间距（px 默认 4）
  colors?: string[]             // 色板（默认 token 色阶——覆盖时逐词取模）
  onWordClick?: (word: string, weight: number) => void
  className?: string
}
```

- 词 <text> 元素：`fill=color` · `textLength`（宽度定）· 字号 = 线性映射
  weight [min,max] → [minFontSize,maxFontSize]
- 交互：hover 高亮（CSS 类 + transition）· 点击 → `onWordClick`（事件经事件表）
- **可交互 div 三件套纪律**：SVG text 加 `role="button" tabindex=0` +
  onKeyDown（Enter/Space）——焦点管理场景断言（Trap 类先例）

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | 骨架三件套（WordCloud.ts/.css/.test.ts）+ index.ts 导出 + registry 追加 + demo 键——**渲染 SVG 容器 + 空态**（布局算法 W2） | 契约：挂载零错/字数=输入数/空 words 渲染空态；style-audit 绿；tsc 0 错 |
| W2 | **行式装箱布局**（降序/装箱/textLength/字号映射/colors） | 契约：字号单调（weight 高→大）· **零重叠**（textLength 已知 → 矩形相交零对——测试内置断言器）· SSR 吸收零差异（uiSsr 与 SPA 首帧命令一致） |
| W3 | 交互面（hover 高亮/onWordClick/键盘可达））+ 动态 props 更新（words 变化重排——命令流 diff） | 契约：click 事件触发回调（mount+dispatch）· 键盘 Enter 等同 click · words 变更后位置重排（diff 断言）· 场景断言（showcase 真实 DOM） |
| W4 | 回归门：audit:all 七线 + 契约 428+ / showcase 324+ 全绿——demo/文档同步（gotchas 登记 textLength 依赖） | audit 七线 exit 0 · 三层测试全绿（零回归） |

## 判负记录

- **不做 Canvas Wordle 螺旋碰撞**：canvas 绘制在渲染周期外（afterRender）——
  服务端无 canvas → SSR 首帧空白/不一致；螺旋碰撞 O(n²·steps) 表观密度收益
  对消费场景无实证——推翻条件：出现「空间最密/倾斜任意角度」消费证据，或
  canvas 渲染进核心周期（with SSR fallback 方案）
- **不引 ECharts wordcloud 插件**：新增依赖违反零依赖库传统（Chart/Math 先例）
  —推翻条件：布局精度成为消费硬需求（当前行式装箱覆盖词频展示语义）
- **不追 VideoPlayer 契约欠账**：收益不明（非本计划范围）——推翻条件：
  覆盖哨兵对契约层提升缺口收敛要求

## 执行实录（边做边记）

### W1（2026-09-03）——骨架 + 布局核心（W1/W2 合并：
「字数=输入数」验收迫使最小布局先行——textLength 定宽方案一次成型）

- **探针重定位**：① 早期「colorOf 冗余 + colors prop 失效」已修（布局函数不赋色——
  render 层取板）；② **CSS 文件数基线 132→133 需登记**（style-audit 契约断言）——
  §5.7 落实；③ 浮点尾差（~1e-15）致零重叠误报——测试几何判定加 EPS=1e-6
  （标准做法——布局幂等不变）。
- **实现**：WordCloud.ts（行式装箱 + textLength + 高度自适应 viewBox）+ CSS（token 化
  零硬编码）+ 契约测试 6。
- **注册**：index.ts 导出（仅组件+类型——layoutWords 不上公共面 YAGNI）·
  registry components.ts 追加（4 字段 + gotchas 3 条）· new-batch demo 活体 +
  代码示例串（DEMOS 键=组件名直达——无需改 demos/index.ts 自动展开）。
- **结果数字**：契约 6/6 · showcase comp 2/2 · 覆盖哨兵 wordcloud H C 双层
  零缺口（组件 135/零覆盖 0）· style-audit S1-S7 零错误（基线 133）·
  audit:api 0 违例 · build ✓（dist style.css 含 wf-wordcloud ×4）· tsc 0 错。

### W3（2026-09-03）——交互面 + 动态 props（onWordClick/键盘/重排）

- **探针重定位**：① 契约 4 红线——事件**不进 attrs**（断言 attrs.onClick ===
  undefined——交互真实触发移交 showcase）；② **SVG text 命中区 bug 实证**：
  `pointer-events: visiblePainted` 默认=字形笔画命中——字母间隙漏到 svg 根——
  playwright 坐标点击不触发——**修复 `pointer-events: bounding-box`**（SVG2
  命中整个文本 bbox——一行 CSS）；③ **key: word 稳定**（含索引时排序变化
  触发 remove+create——weight 交换即重建）；④ 全等权重陷阱：单词 weight=1
  = 自身 max —— 动态测试误报 font-size 未 diff（测试数据两词化）。
- **实现**：onWordClick（role=button/tabindex=0/onKeyDown Enter·Space/aria-label）·
  CSS --clickable（hover/focus-visible opacity）· demo 活体加点击回显（data-testid）。
- **欠账清偿**：L3 缺口 5 类（wf-cursor-pointer/wf-video-*——上次视频任务
  未定义类）——wf-pointer 复用 · 删死类/死函数（inlineVideo 无消费）——
  全契约 428 → 428（L3 归零）。
- **结果数字**：词云契约 9/9 · showcase 3/3（WC3 坐标点击 + Enter 键盘真实链）·
  全契约 428/428 · tsc 双端 0 错 · style-audit 3/3。

## 验收标准

```
□ 契约三件套齐（WordCloud.test.ts——命令流断言）
□ W2 零重叠断言器（textLength 已知矩形相交——cov 全对）
□ SSR 吸收零差异（uiSsr vs SPA 首帧）
□ 交互：click/键盘/动态重排均有契约断言
□ showcase comp-wordcloud.test.ts（真实 DOM——交互断言）
□ registry 四字段+gotchas 追加 · demos 键 · index.ts 导出
□ audit:all 七线 exit 0 · 全量回归门绿（契约+场景+showcase+server+shared）
```
