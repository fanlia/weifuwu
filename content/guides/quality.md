# 人类质量标准（交付前验收清单）

> 用途：开发完成、交付给人类用户前，逐项自查。每一项失败都必须是**拒绝交付**的理由。
> 素材来源：AGENTS.md §8 设计系统纪律 + 组件走查记录（agent-browser 实测沉淀）。

## □ 1. 可访问性（键盘全程可达）

- [ ] Tab 顺序合理；role="button"/tabindex 元素有 Enter/Space 处理
- [ ] 方向键导航组件（Tabs/DatePicker/Menu）焦点跟随激活项
- [ ] 弹层（Modal/Drawer/Dropdown/Popover/Tooltip）Escape 关闭
- [ ] Modal 系焦点 trap + 关闭后焦点归还
- [ ] 危险操作（Confirm）默认 maskClosable=false（防误触）
- [ ] aria 语义：aria-expanded/aria-current/aria-label 正确

## □ 2. 响应式（三断点）

- [ ] 375 / 768 / 1280 三断点无横向溢出
- [ ] 导航正确降级（侧栏 → 顶部条）
- [ ] 表格窄屏横向滚动（Table minWidth）或卡片化
- [ ] 弹层视口夹紧（usePopup 自动）

## □ 3. 主题（亮/暗/自动）

- [ ] 全部颜色走 `--wf-color-*` token（无裸色值）
- [ ] 语义文字色用 `-text` 变体；实心填充文字用 `on-brand`
- [ ] 对比度 ≥ 4.5:1（文字）；focus-ring 含 primary 线（明暗均可见）

## □ 4. 动效

- [ ] 时长/缓动走 `--wf-dur-*` / `--wf-ease-*`（无硬编码）
- [ ] 退场类 `--exit` 成对（有 exit 类必须挂上）
- [ ] reduced-motion 降级（_base.css 自动——勿覆盖）

## □ 5. 状态矩阵

- [ ] loading / error / empty / disabled 四态全覆盖（无缺态渲染）
- [ ] 提交按钮 loading 防重复提交
- [ ] 受控组件有回调（无静默不可点）

## □ 6. 性能

- [ ] 首帧预算合理（大数据列表用 VirtualList/VirtualTable/InfiniteScroll）
- [ ] 无渲染循环（vdom3 防死循环守护不触发）
- [ ] 事件流无 error:caught（浏览器 console 零错误）

## □ 7. 框架纪律

- [ ] 无裸 `window.`/`document.`/`localStorage`（ctx.browser）
- [ ] 渲染只发生在 `ctx.ui.render()` 调用处（无隐式触发）
- [ ] 无 eval/new Function；无 npm 运行时依赖（前端）
- [ ] 请求路径无同步 I/O（后端）

## 验证手段（agent-browser 走查纪律）

1. 真实点击（CDP）验证交互——`eval click` 绕过命中测试会掩盖问题，两者都测
2. 查 outerHTML（结构）+ getAttribute('style')（定位/显隐）+ getBoundingClientRect（真实可见性）
3. `closest('#__wf_portal')` 验证浮层 portal
4. 每次验证前 reload 清状态（会话残留制造假 bug）
5. console --level error 抓加载期错误（hook 需在页面加载前）

