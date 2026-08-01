# weifuwu/layout + weifuwu/components 优化计划

> 目标：零 CSS 用户能产出**专业且无障碍合规**的界面。
> 验收维度：① 浮层层级正确 ② 无障碍达标（reduced-motion/focus-visible/自动暗色/触控尺寸）③ 视觉基调达行业标准。

## 阶段总览

| 阶段 | 内容 | 工作量 | 风险 | 状态 |
|---|---|---|---|---|
| P0 | z-index 层级体系 | S | 低 | ✅ 已完成 |
| P1 | 无障碍三件套（reduced-motion / focus-visible / 自动暗色） | S | 低 | ✅ 已完成 |
| P2 | 视觉基调上调（字号 + 触控尺寸） | S | 中 | ✅ 已完成 |
| P3 | 能力补全（排版原语 / 组件响应式） | M | 低 | ⬜ |
| P4 | 质量基建（样式审计测试） | M | 低 | ⬜ |

## P0 — z-index 层级体系

**问题**：仅 2 层 token（`--wf-pop-z:50` / `--wf-cover-z:100`），Modal/Toast/Drawer 同层；Popover 硬编码 998/999、Editor 硬编码 100。Modal 打开时 Toast 被盖住。

**方案**：`src/layout/_tokens.css` 引入 shadcn 式层级刻度，旧 token 保留为别名：

```css
--wf-z-dropdown: 30;
--wf-z-sticky:   40;
--wf-z-overlay:  50;
--wf-z-modal:    100;
--wf-z-popover:  110;
--wf-z-toast:    120;
--wf-z-tooltip:  130;
/* 兼容别名 */
--wf-pop-z: var(--wf-z-overlay);
--wf-cover-z: var(--wf-z-modal);
```

逐组件重映射：Modal→modal、Toast→toast、Drawer→modal、Popover→popover(+overlay)、Dropdown→dropdown、DatePicker 面板→popover、Chart tooltip→tooltip、Editor→tooltip、Select 面板→popover。

## P1 — 无障碍三件套

### P1.1 prefers-reduced-motion
`_base.css` 末尾加标准降级块（36 处动画/transition 统一降级）。

### P1.2 focus 策略统一
- 文本框/textarea/select 保留 `:focus`（输入时高亮合理）
- Button/Dropdown 触发钮/Tabs/可点击 Card/Table 排序表头/Tag close/Pagination 页码补 `:focus-visible`

### P1.3 自动暗色 + color-scheme
`_dark.css` 两段生效（`[data-theme="dark"]` + `@media (prefers-color-scheme: dark)` 下 `:root:not([data-theme="light"])`）；`_base.css` 加 `color-scheme: light dark`。

## P2 — 视觉基调上调

字号（单 token 级联）：xs 11→12、sm 12→13、base 13→14、lg 14→15、xl 15→16、2xl 20→21、4xl 28→30、5xl 32→36。
控件：Input/Textarea/Select 垂直 padding 8→10px（高 ~36px）；`btn--sm` min-height 28px；`@media (pointer: coarse)` 交互目标 44px。

## P3 — 能力补全

- `_text.css` 扩展：字号/色阶/字重/`wf-truncate`/`wf-line-clamp-2/-3`
- Table 加 `--wf-table-min-width`；StatCard `@media (max-width:768px)` 2 列

## P4 — 质量基建

新增 `src/test/style-audit.test.ts`（node --test 读 dist CSS 断言）：
1. z-index 值必须可映射到 `--wf-z-*` token 或别名（抓 998/999 回归）
2. 组件 CSS 的 font-size 不得裸 px
3. 交互组件类存在 focus 规则
4. token 计数与 README 同步（README 153 行）
5. reduced-motion 块存在

## 诚实裁剪（不做）

- CSS-in-JS / 运行时主题切换动画
- Style Dictionary 式多格式 token 流水线
- 视觉快照测试框架（视觉回归用 agent-browser 走查）
- 新增组件（保持 41 个）
- `data-density` compact 回退档

## 执行顺序

```
P0 z-index → P1.1 reduced-motion → P1.2 focus → P1.3 暗色 → P2 字号
→ P3.1 排版原语 → P3.2 响应式 → P4 审计测试
```

每阶段独立提交；提交后跑 `npm test` + agent-browser cheatsheet 走查。
