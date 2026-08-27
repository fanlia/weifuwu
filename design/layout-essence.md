# weifuwu/layout 本质分析(数据驱动——2026-12)

> 问题:layout 想减少用户写 CSS 的复杂度,但现在有 223 个类——本质是什么?
> 哪些是需要的,哪些是多余的?本文用全库消费审计回答,不凭感觉。

## 1. 消费审计(实证基础)

扫描 `apps/` + `examples/` 全部 `.tsx/.ts/.html`(真实代码消费,不含文档提及):

```
218 基类中仅 133 被消费——总引用 3581 处
帕累托:47 个类覆盖 90% 引用(21% 的类)
```

### 按能力域分解(引用次数 = 真实需求强度)

| 域 | 引用 | 占比 | 类数(用/总) | 结论 |
|---|---|---|---|---|
| **文字层级** `_text` | 1323 | **37%** | 30/42 | 最大消费域——不是"布局"是排版 |
| **排列** `_stack/_row/_grid` | 571 | 16% | 6/9 | 骨架核心 |
| **间距** `_spacing` | 1005 | 28% | **36/90** | 高频但 54 类零消费——笛卡尔积过度 |
| **表面** `_surface/_border` | 280 | 8% | 19/22 | 卡片管线 |
| **填充尺寸** `_fill/w-full/shrink` | 185 | 5% | 3/4 | flex 坑的补丁 |
| **分布对齐** `_between/center/top/…` | ~130 | 4% | 12/16 | 半冗余(见 §3) |
| 其余(壳/定位/显隐/滚动) | ~190 | 5% | — | 低频但各有专属场景 |

### TOP 15(热集核心)

```
284 wf-stack        242 wf-row         208 wf-gap-sm     124 wf-gap-xs
253 wf-text-xs      220 wf-text-secondary  218 wf-text-sm  158 wf-text-tertiary
 99 wf-fill          94 wf-text-semibold   78 wf-w-full     75 wf-gap-md
 58 wf-p-md          52 wf-gap-lg           47 wf-grid       46 wf-surface
```

## 2. 本质判定

**本质一句话:页面组装的最小词汇表——把任意内容排列出来,不写一行 CSS。**

五个不可约能力(= 热集 ~45 类):

1. **排列**——`wf-stack` / `wf-row` / `wf-grid`(方向 + 换行 + 断点变体)
2. **间距**——`wf-gap-*`(排列内)+ `wf-p-*` / `wf-m-*`(元素上)
3. **文字层级**——`wf-text-{xs,sm,base,2xl}` + `{secondary,tertiary,semibold}`
4. **表面**——`wf-surface` / `wf-border(-b)` / `wf-rounded-*`
5. **填充尺寸**——`wf-fill` / `wf-w-full` / `wf-min-w-0`(flex 收缩坑)

三个本质属性(决定了"不该做什么"):

- **零 JS 纯 CSS**——可脱离框架单独使用(文档明示卖点)。→ **不该组件化**
  (`<Stack>` 组件会绑定 vdom,毁掉独立价值)
- **框架内部样式语言**——组件 style.css = layout + 组件层;`popup-manager`
  内部消费 `wf-popup*`。→ layout 同时是内部基建,不纯是用户面
- **名字窄于实际**——叫 "layout",实际 37% 消费是文字层级。真实身份是
  **页面样式底座**(token + 排列词汇 + 排版/表面工具)

### showcase 自证(最强证据)

showcase 自己的壳页面代码(`domains.tsx` 工厂)用的恰好就是热集:

```
wf-container wf-stack · wf-grid · wf-surface wf-surface--flat wf-border
wf-rounded-md wf-p-md · wf-cluster · wf-row wf-between · wf-text-{2xl,base,xs,secondary}
```

框架作者自己写页面时用 ~15 个类——这就是本质的样子。而当前 /layout/:id
20 个详情页是 **content/layout/*.md 渲染的"类字典"**(验证节全是占位符),
展示的是"我们有什么",不是"你需要什么"。

## 3. 多余判定(四类——全部有消费证据)

### A 语义冗余:同意图多机制

| 意图 | 并存机制 | 数据裁决 |
|---|---|---|
| 交叉轴对齐 | ① `wf-top/bottom/stretch`(独立容器,4/5/4 次)② `wf-items-*`(设 --wf-align 变量,**35 次**)③ `wf-self-*`(子项,5 次 2 死) | 三套机制——数据选了 `wf-items-*` |
| 不伸缩 | `wf-flex-none` + 别名 `wf-fixed`(与 position:fixed 撞名——注释自认混淆)+ `wf-pin` 才是 fixed | 命名混乱——文档需单一推荐 |

### B 标尺笛卡尔积(完备性收藏,零消费)

- **间距 90 类中 54 零消费**(60%)——`my-*`/`px-*`/`pt-*` 近乎全军,
  `-2xl` 档全部 0 次。标尺被"补全"成数学完备集,而非消费驱动
- **display 族 6 类 3 死**:`wf-inline` / `wf-inline-block` / `wf-contents` 0 消费
- **分布**: `wf-around`(1 次)`wf-evenly`(1 次)——真实 UI 几乎不用
  space-around/evenly;`wf-auto`(0)

### C 内部实现类混入公共清单

- `wf-popup` / `wf-popup-mask`——仅 `popup-manager.ts` 消费(框架内部),
  却在 inventory 登记为"原语"、出现在公共文档——应标注 **internal**

### D 双轨重叠(合法但需选型指引)

- Layout 组件(JS 交互壳)vs `wf-app-shell`(CSS 静态壳)——组件注释已承认
  双轨,但文档没有决策表——用户不知道选哪个

## 4. 结论:需要的 vs 多余的

```
需要(本质——~45 类热集):
  排列 stack/row/grid(+断点)· 间距 gap/p/m 常用档 · 文字层级 text-* 主档
  表面 surface/border/rounded · 填充 fill/w-full · 壳 app-shell ·
  显隐 hidden(+@lg)· 滚动 scroll · 定位 sticky/pin

多余(四类——85 个零消费类 + 机制重叠):
  ① 标尺尾部:间距 54 死类 / display 3 死类 / -2xl 档 / around / evenly / auto
  ② 重叠机制:top/bottom/stretch(被 items-* 取代)· self-*(低频——保留但降级)
  ③ 内部类公有化:wf-popup*(标注 internal——非删除)
  ④ 命名混乱:wf-fixed 别名只留兼容位——文档推 wf-flex-none / wf-pin
```

## 5. 行动方向(并入 layout-optimize.md)

1. **API 分层(文档+showcase)**:核心层 45 热集 = 教学主线(style-guide
   三档学习的第二档改为数据驱动);完整层降级为"参考清单"
2. **showcase /layout 转向**:从类字典 → 场景组装示范(用热集拼真实片段
   ——卡片列表/表单行/响应式壳)——"你需要什么"而非"我们有什么"
3. **冻结标尺扩张**(契约化):新类必须有消费侧证据(缺口审计机制化
   ——layout-optimize Phase 1);"零消费"只报告不删除(对外 API 承诺——
   删除是主版本决策)
4. **内部类标注**:inventory/文档把 `wf-popup*` 标 internal
5. **不做**:不删类、不组件化 layout、不加任意值语法、不再补全标尺
