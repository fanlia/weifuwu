# 组件设计变量（可覆盖 token）— 2026-08 重构补充
> **状态（2026-12 确认）**：📄 文档——组件设计变量记录——已收敛（供消费方覆盖 token 参考）

> 全量扫描组件 CSS 引用 `var(--wf-*)` 与 layout 定义对照后的结论文档。
> **审计防线**（style-audit 第 24 条）：组件 CSS 的 `var(--wf-*)` 必须可解析
> （layout 定义、组件自身定义、或带 fallback）——假 token = 测试红。

## 两类引用

### 1. 全局语义 token（layout 定义——暗色自动适配）

组件应**只引用** `src/layout/_tokens.css` 定义的语义 token：
`--wf-color-*`（text/bg/fill/border/success/error/info/primary…）、
`--wf-shadow-*`、`--wf-z-*`、`--wf-dur-*`、`--wf-ease-*`、`--wf-space-*` 等。
**禁止裸色值**（`#fff`/`rgba(...)`/`#1668dc`）——暗色下失效。

### 2. 组件设计变量（组件级可覆盖——fallback 提供默认）

以下变量是**用户可覆盖的组件外观 API**（`:root` 或组件类上覆盖即定制外观），
fallback 提供默认值（引用全局 token 或合理字面量）。**不要删除 fallback**——

| 变量 | 组件 | fallback 默认 |
|------|------|--------------|
| `--wf-btn-radius` / `--wf-btn-pad-x` / `--wf-btn-pad-y` | Button | radius / space 系 |
| `--wf-card-radius` / `--wf-card-shadow` | Card | surface 系 |
| `--wf-modal-width` / `--wf-modal-radius` / `--wf-modal-shadow` | Modal | 400px / radius / shadow-lg |
| `--wf-drawer-width` | Drawer | 360px |
| `--wf-popover-width` / `--wf-popover-radius` | Popover | 160px / radius-md |
| `--wf-dropdown-min-width` / `--wf-context-menu-min-width` / `--wf-menubar-min-width` / `--wf-mentions-min-width` | 弹层族 | 140-160px |
| `--wf-cascader-col-width` / `--wf-datepicker-width`（time/range） | Cascader/DatePicker | 120-260px |
| `--wf-calendar-min-width` | Calendar | 280px |
| `--wf-tooltip-radius` / `--wf-tag-radius` / `--wf-badge-radius` / `--wf-alert-radius` / `--wf-toast-radius` | 小元件 | radius 系 |
| `--wf-toast-width` | Toast | 260px |
| `--wf-popconfirm-min-width` | Popconfirm | 180px |
| `--wf-aspect-ratio` | AspectRatio | 16/9 |
| `--wf-slider-thumb-shadow` / `--wf-switch-knob-shadow` / `--wf-switch-radius` / `--wf-theme-switch-inset` | Slider/Switch/ThemeSwitch | 阴影/圆角字面量 |
| `--wf-event-color` | Calendar | primary-bg |

## 历史教训（假 token 根因）

- **假 token = 引用了未定义变量名** → fallback 总是生效（= 硬编码，暗色失效）
  → 已清零（Phase 1：49 个，含 20 个无 fallback 的解析失败 bug）
- **常见错误名**（已收敛）：`text-primary`→`text`、`text-muted`→`text-tertiary`、
  `danger*`→`error*`、`primary-600`→`primary`、`primary-light/lighter`→`primary-bg`、
  `ease-standard`/`dur-md`（已补 layout 定义）、`field-height/radius`（已补）
- **新增组件 CSS**：先查 `_tokens.css` 是否有对应 token；没有 → 加 layout token
  （全局语义）或组件根类定义（设计变量 + fallback）；**绝不引用未定义变量**

## 验证方法

```bash
# audit 防线（假 token 检测——无 fallback 无定义 = 红）
timeout 15 node --env-file=.env --test --test-timeout=8000 src/test/style-audit.test.ts

# 手动全量对照（引用 vs 定义）
node -e "..."  # 或用 audit 测试的断言信息
```

暗色验证：`agent-browser` 环境系统偏好 dark=true——
抽查组件 computedStyle 是否映射 `--wf-dark-*` 系列（如 NavMenu 链接 = 暗色品牌靛蓝）。
