# weifuwu/layout 统一命名规则(学习成本最小化——2026-12)

> ## ✅ 已实施(2026-12)——与 layout-cleanup.md 合批:一次迁移通过。
> 迁移 80 文件 / ~1400 处词边界替换(负向断言保护组件类前缀)·
> 契约测试锁定(词根登记/双名歼灭/方向词域隔离/零值形态)。
> 唯一定名例外登记:wf-min-width-0(数值属性值,非重置约定)。

> 前置:`layout-cleanup.md`(类面裁剪)——命名规则落在清理后的类面上,
> 与清理同一执行窗口(开发阶段最后的重命名机会)。
>
> 迁移总量实测:**~1416 处 / ~70 文件**——全部词边界机械替换(脚本化)。

## 1. 目标与原理

**学习成本 = 记忆成本 + 猜词成本。策略:不让用户学新词汇。**

两个零猜词来源(用户已有的知识):

1. **CSS 知识**——做布局的人都会 CSS:单属性工具类直接用 CSS 属性名,
   `wf-padding-md` / `wf-justify-between` / `wf-overflow-hidden` 零解释自明
2. **意图词汇**——组合原语用概念名:`wf-stack` / `wf-surface` / `wf-bubble`
   表达"要什么",不暴露"怎么实现"

与框架文化对齐:AGENTS.md **编码唯一性原则**——一名一义、双向可推导
(名→属性/值唯一;属性/值→名唯一)。现状违例全部消灭:
`wf-anchor`≡`wf-relative`(同属性双名)、`wf-text-danger`≡`wf-text-error`、
`wf-m-0` vs `wf-mt-none`(零值双形态)、`wf-text-*` 四义过载
(字号/字重/颜色/对齐混一根)。

## 2. 语法(用户唯一需要记的一张表)

```
wf-<词根>-<值>

后缀语法(三种,各管一事):
  -    值/子名       wf-padding-md · wf-border-bottom
  --   变体/状态     wf-bubble--own · wf-surface--flat(BEM 修饰)
  @    断点          wf-flex@lg · wf-hidden@lg
```

## 3. 词根三分类(判定规则——新类名从此推导,不再拍脑袋)

| 根类 | 判定 | 规则 | 例 |
|---|---|---|---|
| **概念原语** | 复合语义(≠单属性) | 意图词汇,一名一概念 | `wf-stack` `wf-row` `wf-grid` `wf-split` `wf-center` `wf-cluster` `wf-fill` `wf-shrink` `wf-cover` `wf-layer` `wf-surface` `wf-bubble` `wf-app-shell` `wf-container` `wf-prose` |
| **属性根** | 单一 CSS 属性 | **CSS 属性全名**——缩写仅登记制例外(当前唯一:`bg`←background) | `wf-padding-*` `wf-margin-*` `wf-gap-*` `wf-width-*` `wf-height-*` `wf-min-width-*` `wf-radius-*` `wf-border-*` `wf-shadow` `wf-overflow-*` `wf-bg-*` `wf-items-*` `wf-self-*` `wf-justify-*` |
| **裸值词** | 单值状态/行为 | 裸词,无属性前缀 | `wf-bold` `wf-semibold` `wf-uppercase` `wf-truncate` `wf-dim` `wf-pill` `wf-nums` `wf-pointer` `wf-hidden` `wf-block` `wf-flex` |

**特判链**(新类命名流程):是复合?→概念名;是单属性?→属性全名;
是单值?→裸词。三者必居其一——不存在第四种形态。

## 4. 值词汇(四张封闭表——新值必须出自此表)

| 表 | 值 | 适用 |
|---|---|---|
| **标尺** | `none · xs · sm · md · lg · xl` | 间距/圆角/字号……**`none` = 零/取消的唯一形态**(废 `-0`) |
| **对齐/分布** | `start · center · end · stretch · between` | items-/self-/justify-——CSS 值词,**方向词禁入对齐域** |
| **物理方向** | `top · bottom · left · right · x · y` | 仅 padding/margin/border/safe-area——**全词,禁缩写**(废 -t/-b/-l/-r) |
| **颜色语义** | `primary · secondary · tertiary · success · warning · error · info · on-brand` | 与 token 语义名一一对应(**用 `error` 不用 `danger`——token 即真理**) |

登记制例外(文档明示,不再新增):
- `wf-text-*` = **文本外观域**(颜色 + `text-align` + `white-space` 行为)——
  `color` 归文本外观是自然语言语义(`wf-text-secondary` = 文字次级色);
  字号归 `wf-font-*`(font-size 属性族)、字重归裸值词——**wf-text-* 过载消灭**
- `wf-tracking-*` = letter-spacing(排版学术语 tracking——业界标准)

## 5. 重命名表(清理类面 → 规则类面)

| 现状 | 改为 | 处数 | 依据 |
|---|---|---|---|
| `wf-text-{xs,sm,base,lg,xl,2xl,3xl,4xl,display}` | `wf-font-{…}` | 566 | font-size → font 属性族 |
| `wf-text-{medium,semibold,bold}` | `wf-medium` `wf-semibold` `wf-bold` | 128 | 字重 → 裸值词 |
| `wf-text-danger` | `wf-text-error` | 7 | 双名歼灭——随 token(`--wf-color-error-*`) |
| `wf-text-brand`(别名) | 删——用 `wf-text-primary` | 19 | 双名歼灭 |
| `wf-p-*` `wf-px/py/pt/pb-*` | `wf-padding-*` `wf-padding-{x,y,top,bottom}-*` | 224 | 属性全名 + 方向全词(与 `wf-gap-*` 对齐) |
| `wf-m-0` `wf-mt/mb/ml-*` `wf-mx-auto` | `wf-margin-none` `wf-margin-{top,bottom,left}-*` `wf-margin-x-auto` | 215 | 同上;零值归一 `none` |
| `wf-rounded(-sm/md/lg)` | `wf-radius(-sm/md/lg)` | 83 | 随 token `--wf-radius-*`(rounded/radius 错配歼灭) |
| `wf-border-{t,b,l,r}` | `wf-border-{top,bottom,left,right}` | 62 | 方向全词 |
| `wf-w-full` `wf-w-sm` `wf-h-full` `wf-min-w-0` | `wf-width-full` `wf-width-sm` `wf-height-full` `wf-min-width-0` | 91 | 属性全名 |
| `wf-scroll` | `wf-overflow-auto` | 18 | 单属性 → 属性名(与缺口新增类合并) |
| `wf-clip` | `wf-overflow-hidden` | 7 | 同上 |
| `wf-anchor` | `wf-relative` | 11 | position:relative 唯一名(隐喻歼灭) |
| `wf-pop` | `wf-absolute` | 13 | position:absolute → 属性名;`wf-relative + wf-absolute` 是 CSS 用户的零学习配对 |
| `wf-between` | `wf-justify-between` | 36 | 对齐域统一到 CSS 词根 |
| `wf-right` | `wf-justify-end` | 14 | 同上(`right` 方向词退出对齐域) |

**保留不改**(已合规):概念原语全部、`wf-text-{颜色}` 族(1200+ 引用——
最大族零迁移)、`wf-text-{left,center,right}`(text-align 自然读法)、
`wf-bg-*`(登记缩写)、`wf-tracking-*`(术语)、`wf-gap-*`、`wf-items-*`、
`wf-self-*`、`@`/`--` 后缀、裸值词族。

## 6. token 对应(类名 → token 机械推导)

```
wf-gap-sm        ↔ --wf-gap-sm              (同名)
wf-font-xs       ↔ --wf-font-size-xs        (font- ↔ font-size-*)
wf-radius-md     ↔ --wf-radius-md           (同名)
wf-text-secondary↔ --wf-color-text-secondary(text- ↔ color-text-*)
wf-shadow        ↔ --wf-shadow              (同名)
wf-padding-md    ↔ --wf-space-md            (间距标尺:文档登记的唯一映射转译)
```

除 `padding/margin ↔ space` 一处转译外全部同名/前缀推导——
**会读 token 就会写类,反之亦然**(秉持 token 方案的落地)。

## 7. 机制化(命名规则进契约测试)

`layout-inventory.test.ts`(cleanup §6)追加:

| 断言 | 语义 |
|---|---|
| 词根登记制 | 全部类名 ∈ 登记词根 × 值表 的合法组合——自造词即失败 |
| 同属性唯一名 | 属性指纹反查:同一 CSS 属性不得出现两个基类名(双名歼灭防线) |
| 方向词域隔离 | 对齐域类名不含 top/bottom/left/right |
| 零值形态唯一 | `-0` 后缀类数 = 0 |

## 8. 学习成本对比

| | 之前 | 之后 |
|---|---|---|
| 需要记忆 | ~40 个自造词映射(p=padding、mt=margin-top、rounded=radius、anchor=relative、pop=absolute、text- 四义查表、-0/-none 双形) | **1 张语法表**(3 后缀 + 3 根类判定 + 4 值表) |
| 猜词依据 | 无——靠文档 | **CSS 知识**(属性根)+ 意图词汇(概念根) |
| 新类可预测性 | 不可预测(补全家族/幽灵类史) | 完全推导(特判链唯一路径) |
| AI 生成友好度 | 缩写歧义多 | 全名无歧义——llms.txt 直接受益 |

## 9. 执行(与清理合批——一次迁移通过)

```
顺序:① cleanup 本体删除/新增(类面定型)
     ② 本表重命名(layout 源文件)
     ③ 消费侧统一迁移脚本(词边界替换——1416 处:
        apps/agent-platform · apps/showcase · examples ·
        src/client/components · docs · content · README)
     ④ 契约测试锁定(§7 四条断言 + cleanup §6 基线)
     ⑤ 全量回归
```

风险控制:替换脚本按类名单独跑 + 每类替换后 `npm run typecheck`;
类名字符串上下文验证用 grep 反查残留(旧名零命中 = 完成)。
