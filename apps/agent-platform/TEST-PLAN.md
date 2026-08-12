# Agent Platform — 分角色浏览器验收计划（agent-browser）

> 针对 `apps/agent-platform/` 全部功能的端到端浏览器验证清单。
> 按 8 个角色视角分组——每组只验证该角色关心的能力面，覆盖全部功能点。
> 每项含：验证路径（操作步骤） + 断言要点（agent-browser 命令）。

---

## 0. 前置准备（每轮验证前）

```bash
# 服务运行中（无则启动）
cd apps/agent-platform && nohup node --env-file=.env server.ts > /tmp/agent-platform.log 2>&1 &
ss -tlnp | grep 3000   # 确认端口

# agent-browser 基础
agent-browser open http://localhost:3000/login
```

| 项 | 值 |
|---|---|
| 演示管理员 | `admin@demo.com` / `admin123`（张明，演示科技有限公司，10 agents） |
| 演示同事 | `user@demo.com` / `user123`（李华，同租户） |
| 核心数据 | 演示租户含公司/部门/AI Agent/历史消息/待审批草稿 |
| 状态残留 | 每项验证前 `agent-browser reload` 清状态（open/expanded 残留） |
| 控制台错误 | 每页验证顺手跑 `agent-browser console --level error`（应无 error） |
| 真实 HTML 铁律 | 结构断言用 `outerHTML` + `getAttribute('style')` + `getBoundingClientRect()`，不只信 textContent（附录 A） |

**破坏性操作（删除/拒绝/改密码）**：放该分组最后执行，或使用临时注册的测试账号。

---

## 1. 👔 老板（CEO）视角 — 商业价值 / 健康度 / 成本

> 关心的不是功能细节，而是：平台是否被用起来、花了多少钱、转化链路通不通、商业模型成立。

### 1.1 激活漏斗 — 注册→建 Agent→首次对话
- **路径**：登录 demo → 概览页 → 激活漏斗卡片
- **断言**：卡片显示 3 步（注册/创建 Agent/首次对话），演示租户三步全 ✓ 已完成；全平台转化率百分比合理
- **命令**：`agent-browser eval "document.body.innerText.includes('激活漏斗')"`；查卡片文本含「✓ 已完成」
- **补充**：新注册用户（`/register` 用一次性邮箱）→ 注册后漏斗卡「注册 ✓ 已完成 / 创建 Agent 未完成」

### 1.2 埋点数据落库
- **路径**：新用户完成注册 → 检查 DB
- **命令**：`docker exec weifuwu-postgres-1 psql -U root -d demo -c "SELECT tenant_id, event FROM events WHERE event='register_complete' ORDER BY created_at DESC LIMIT 1"`
- **断言**：新租户有 `register_complete`；同一事件重复触发不重复入库（幂等）

### 1.3 Token 成本排行
- **路径**：概览页 → 成本排行卡片
- **断言**：按 token 用量排序的 Agent 列表可见（名称/模型/用量），数据非空；点击可进入对应 Agent
- **命令**：`agent-browser eval "[...document.querySelectorAll('.wf-surface')].find(x=>x.textContent.includes('成本'))?.innerText"`

### 1.4 平台使用概况（Dashboard 统计）
- **路径**：概览页统计卡
- **断言**：Agent 数 / 部门数 / 今日消息 / 待审批数 与库中一致（可 cross-check `SELECT count(*) FROM agents`）
- **命令**：`agent-browser eval "document.querySelector('#root').innerText"` 后与 DB 计数对比

### 1.5 多租户商业模型（隔离）
- **路径**：注册第二个独立租户账号（不同邮箱域名）→ 登录 → 各页面
- **断言**：新租户看不到演示租户的 Agent/部门/消息/待审批（空列表）；`/api/agents` 返回仅本租户数据
- **命令**：两个会话（或登出切换）对比列表内容

### 1.6 演示环境开箱即用
- **路径**：`admin@demo.com/admin123` 直接登录
- **断言**：无需配置即有 10 agents + 公司 + 部门 + 历史消息——演示/评审可直接讲

---

## 2. 🧑💼 用户（普通员工）视角 — 日常使用流程

> 用户不关心实现，只关心「我要开会/要答案/要人帮忙干活，能不能顺畅完成」。

### 2.1 注册 → 自动进入可用状态
- **路径**：`/register` → 填姓名/邮箱/密码 → 提交
- **断言**：注册成功自动登录并跳转概览页；无公司引导出现（有公司则提示选公司，无则引导创建）；自动创建了默认 user Agent
- **命令**：注册后 `document.body.innerText.includes('下午好')`；DB 确认 `_weifuwu_users` 新行 + `agents` 默认行

### 2.2 登录 / 登出 / 记住登录态
- **路径**：登出 → 回登录页 → 重新登录；刷新页面
- **断言**：登录后跳转概览；刷新不丢登录态（refresh token）；登出后访问工作台路由被弹回登录页
- **命令**：`agent-browser eval "localStorage.getItem('agent_platform_token')"` 非空；登出后 open `/agents` 应回 `/login`

### 2.3 错误凭据体验
- **路径**：错误密码登录
- **断言**：明确错误提示（非白屏），停留登录页
- **命令**：eval 断言页面含错误文本

### 2.4 创建 AI 同事（核心上手动作）
- **路径**：Agent 页 → ＋ 新建 → 模板步骤选「开发助手」→ 下一步 → 填名称/系统提示 → 创建
- **断言**：创建成功跳转 Agent 列表，新 Agent 出现在列表（类型徽章 AI + 模型名）；两步向导可「切换模板」返回
- **命令**：列表 `innerText.includes(新名称)`；`console --level error` 无错

### 2.5 和 AI 同事聊天（人机协作核心）
- **路径**：聊天页（或部门详情）→ 输入问题发送 → 等待流式回复
- **断言**：消息发出出现气泡；AI 流式回复逐字到达（非一次性）；回复引用 @ 的 AI 名称；token 用量标签可见
- **命令**：发送后立即查 `outerHTML` 消息节点数递增；2s 后再查文本变化（流式）

### 2.6 @ 定向发言
- **路径**：输入 `@` → 弹出成员浮层 → 选择成员 → 发送
- **断言**：浮层列出部门成员；选中后输入框显示 `@名 `；消息带上 @ 定向；被 @ 的 AI 回复、未 @ 的 AI 不回复
- **命令**：eval 触发 input 输入 `@` → `outerHTML` 含浮层；`closest('#__wf_portal')` 验证 portal

### 2.7 回复引用
- **路径**：悬停消息 → 回复 → 引用条出现 → 发送
- **断言**：输入区上方出现「回复 张明：xxx」引用条；发送后引用条在消息中可见；可取消引用
- **命令**：eval 断言引用条文本 + `wf-quote`/引用样式类

### 2.8 消息搜索
- **路径**：聊天页 → 搜索框输入关键词 → 搜索
- **断言**：结果列表出现「搜索：关键词 ✕ 清除」徽章；匹配消息高亮；清除恢复全量
- **命令**：eval 断言 Badge 文本；`innerText.includes('没有匹配的消息')` 空结果分支

### 2.9 修改个人资料 / 密码
- **路径**：设置页 → 改名保存 → 改密码（旧密码+新密码+确认）
- **断言**：名称更新后侧边栏/头像同步；改密码后旧密码失效新密码可登录；校验：两次不一致 / 少于 6 位 有提示
- **命令**：保存后 `agent-browser console` + eval 断言成功提示文本

---

## 3. 📐 产品经理视角 — 功能完整性 / 核心场景链路

> 对照 IDEA.md 与产品计划逐项验收：宣称的能力是否真实可用、链路是否闭环。

### 3.1 四种 Agent 类型齐全
- **路径**：Agent 列表 → 逐个验证类型徽章
- **断言**：AI（DeepSeek 模型）/ 真实用户（绑定账号）/ Webhook（收消息） / 知识库（文档语义检索）四种都可在列表展示并可操作
- **命令**：列表 `innerText` 含四类徽章文本（AI/用户/Webhook/知识库）

### 3.2 AI 工具调用（人机协作能力）
- **路径**：聊天中要求 AI「现在几点」/「搜索知识库：xxx」
- **断言**：消息中显示工具调用卡片（获取当前时间/搜索知识库）；AI 用工具结果回答
- **命令**：eval 断言消息含「🔧」或工具名文本；回复内容合理（如含当前时间）

### 3.3 多 AI 群聊分工（@ 定向 + 多角色）
- **路径**：部门含 2+ AI 成员 → 不 @ 发普通消息 → 观察谁回复；@ 特定成员 → 该成员回复
- **断言**：普通消息由默认/全部 AI 回复；@ 后仅定向 AI 回复——人机分工闭环
- **命令**：两次发送分别断言回复者名称

### 3.4 人工审批 HITL（AI 草稿 → 批准发布）
- **路径**：让 AI 生成需要审批的回复（HITL 开启的 Agent）→ 消息区出现「AI 草稿待审批」→ 审批页批准
- **断言**：草稿消息显示待审批徽章；审批待办页出现该条；批准后草稿变正式消息（全员可见）；拒绝则丢弃
- **命令**：审批页 `innerText.includes(草稿内容)`；批准后原聊天页消息状态变化

### 3.5 知识库 — 上传 / 检索 / 问答
- **路径**：Agent 详情 → 知识库 → 上传文档 → 搜索测试
- **断言**：上传成功列出文档；搜索返回相似度结果；AI 问答能引用知识库内容
- **命令**：上传后列表行出现；`POST /api/agents/:id/knowledge/search` 断言命中片段

### 3.6 Webhook 机器人 — 外部系统接入
- **路径**：创建 Webhook 类型 Agent → 记录 webhook URL → 用 curl 发消息 → 回聊天页
- **命令**：`curl -X POST http://localhost:3000/api/webhook/<agentId> -H 'Content-Type: application/json' -d '{"content":"来自外部系统"}'`
- **断言**：curl 返回 ok；聊天页出现该消息（真实用户→Webhook 单向链路）
- **注意**：webhook 路由是否鉴权——按实现验证（公开 or 密钥）

### 3.7 消息管理闭环
- **路径**：自己的消息 → 编辑 / 删除
- **断言**：编辑后内容更新（带「已编辑」标记）；删除后消息消失；他人消息不可编辑/删除
- **命令**：eval 断言编辑前后文本；删除后节点消失

### 3.8 角色模板 9 个 + 模板创建链路
- **路径**：新建 Agent 第一步模板列表 / `/api/role-templates`
- **断言**：9 个模板齐全（开发助手/智能客服/产品经理助手/数据分析师/HR 助手/运维机器人/销售助手/高管助理/通用助手）；选模板创建后系统提示/温度预设生效
- **命令**：`curl http://localhost:3000/api/role-templates | python3 -m json.tool` 断言 9 条

### 3.9 单聊（DM）与群聊
- **路径**：部门页 → 创建群聊（选多人）；与单个成员发单聊
- **断言**：群聊徽章「群聊」/ 单聊徽章「单聊」；各自入口可用（聊天页可切换）
- **命令**：部门列表 `innerText` 含单聊/群聊徽章

### 3.10 消息实时推送（WS）
- **路径**：两个浏览器会话（A=admin、B=user 同部门）→ A 发消息 → B 页面不刷新
- **断言**：B 会话消息实时出现（WS 推送非轮询）
- **命令**：agent-browser 开两个 session；B 页 eval 监听消息节点数变化

---

## 4. 📈 运营经理视角 — 模板运营 / 埋点 / 转化

> 关注增长与运营：模板怎么被使用、漏斗数据能不能指导运营决策。

### 4.1 模板运营位（使用计数 + 热门排序）
- **路径**：Agent 列表页或模板选择页 → 模板卡片
- **断言**：模板显示使用次数（来自 agents.template_slug 统计）；热门模板排序靠前；新模板有「新」标记（如有）
- **命令**：eval 断言模板卡文本含数字计数；顺序按使用数降序

### 4.2 从模板创建 → 使用计数 +1
- **路径**：用「智能客服」模板创建 Agent → 回模板列表
- **断言**：智能客服使用计数 +1（DB cross-check `SELECT template_slug, COUNT(*) FROM agents GROUP BY 1`）
- **命令**：创建前后各查一次计数

### 4.3 激活漏斗转化率（运营指标）
- **路径**：概览页漏斗卡
- **断言**：三步显示 平台转化率（注册→建 Agent→首次对话 逐级递减合理）；「未完成」步有引导入口（点击跳转）
- **命令**：eval 断言卡片含百分比；未完成步骤可点击导航

### 4.4 注册引导（新用户 onboarding）
- **路径**：全新邮箱注册 → 首屏
- **断言**：首屏引导清晰（无公司 → 引导创建公司；有公司 → 引导选公司/建 Agent）；空状态带操作按钮（EmptyState 文案 + CTA）
- **命令**：eval 断言 EmptyState hint 文本 + 按钮存在

### 4.5 待审批运营（AI 草稿管理）
- **路径**：审批待办页
- **断言**：列出租户内全部待批草稿（发送者/时间/内容）；批准/拒绝操作即时反馈（Toast）
- **命令**：eval 断言列表非空 + 操作后 Toast 文本

---

## 5. 🎨 视觉设计师视角 — 设计一致性 / 层次 / 亮暗

> 只看「好不好看、一不一致」——基于 weifuwu 设计系统 token 验收。

### 5.1 设计 token 一致性
- **路径**：全局扫样式
- **断言**：颜色全部走 CSS 变量（`var(--wf-color-*)`）无裸值；间距/圆角/字号走 `wf-*` 原语；组件样式来自 `weifuwu/components/style.css`
- **命令**：`agent-browser eval "getComputedStyle(document.body).backgroundColor"` 与 token 一致；抽查按钮/卡片 computed style

### 5.2 图标统一性
- **路径**：全局扫图标
- **断言**：全部使用 `Icon` 组件（stroke SVG/currentColor/1em），无裸文本字形（✕✓⚠▲▼）、无 emoji 装饰
- **命令**：`agent-browser eval "[...document.querySelectorAll('svg')].length"` > 0；grep 源码无裸字形

### 5.3 空状态 / 加载态 / 错误态
- **路径**：空数据页（新租户各页）+ 慢网络（DevTools throttling 或 mock）
- **断言**：空列表显示 EmptyState（图标+文案+hint）；加载中不闪白（骨架/loading 态）；错误有兜底 UI 非白屏
- **命令**：新租户 eval 断言 `.wf-empty`/EmptyState 文本

### 5.4 暗色 / 亮色适配（如有）
- **路径**：`prefers-color-scheme: dark` 模拟
- **断言**：文本/背景对比度 ≥ 4.5:1（重点 `-text` 变体）；focus-ring 双色可见
- **命令**：`agent-browser eval "matchMedia('(prefers-color-scheme: dark)').matches"` + 抽查关键色对比

### 5.5 响应式布局
- **路径**：窄视口（390×640 手机模拟）
- **断言**：侧边栏可折叠/隐藏；卡片单列堆叠；无横向滚动溢出（`scrollWidth <= clientWidth`）
- **命令**：`agent-browser eval "document.documentElement.scrollWidth > window.innerWidth ? 'OVERFLOW' : 'OK'"`

### 5.6 数字排版
- **路径**：Dashboard 统计 / 成本排行
- **断言**：数字用 tabular-nums（`wf-nums`）不抖动；长数字（token 用量）格式化可读
- **命令**：eval 断言数字容器 class 含 `wf-nums`（如有）

### 5.7 消息气泡 / 引用条 / 工具卡片视觉
- **路径**：聊天页
- **断言**：我的消息/他人消息左右分列配色区分；引用条有缩进+左侧色条；工具调用卡片有边框/底色区分；AI 流式光标
- **命令**：`agent-browser eval "document.querySelector('.wf-chat-msg')?.outerHTML"` 结构审查

---

## 6. 🖱️ 交互设计师视角 — 交互流程 / 可达性 / 反馈

> 关心操作顺不顺、有没有反馈、键盘能不能用、浮层对不对。

### 6.1 表单校验与反馈
- **路径**：注册/新建 Agent/新部门/设置改密码 各表单
- **断言**：必填缺失/格式错误/密码过短 → 明确错误文案；提交中按钮「提交中...」禁用；成功 Toast
- **命令**：提交空表单 → eval 断言错误文本；按钮 disabled 属性

### 6.2 删除确认（危险操作）
- **路径**：删除 Agent / 部门 / 公司 / 知识库文档
- **断言**：均弹确认框（`ctx.confirm`）；取消不删、确认才删；确认框 Escape/外部点击可关
- **命令**：eval 断言 confirm 浮层 `outerHTML`；`agent-browser click` 取消按钮

### 6.3 多步向导（新建 Agent）
- **路径**：新建 Agent → 模板步 → 配置步
- **断言**：步骤切换流畅；「切换模板」返回不丢已填配置；最后创建成功跳列表
- **命令**：eval 断言步骤 1/2 内容切换 + 返回后温度等配置保留

### 6.4 浮层全部走 portal（弹窗纪律）
- **路径**：触发所有浮层：@ 补全、成员选择器、确认框、Toast、Dropdown
- **断言**：浮层 DOM 在 `#__wf_portal`（非页面内 absolute）；定位 fixed+JS 坐标；z-index 用 token；Escape 关闭
- **命令**：`agent-browser eval "document.querySelector('#__wf_portal')?.outerHTML.slice(0,200)"` + `closest('#__wf_portal')`

### 6.5 键盘可达性（可达红线）
- **路径**：Tab 遍历 + Enter/Space 操作
- **断言**：可聚焦元素（按钮/输入）Tab 可达；`role="button"`/tabindex 元素有 Enter/Space 处理；Modal/浮层 Escape 关闭；焦点归还
- **命令**：`agent-browser eval "document.activeElement.tagName"` 逐步 Tab 断言

### 6.6 @ 补全交互细节
- **路径**：输入 `@` → 浮层 → 键盘上下选择 → Enter 选中 → 继续输入
- **断言**：浮层跟随输入过滤（`@张` → 过滤张）；键盘导航高亮；选中插入完整 `@名 `；中文输入法（IME）组合不打断
- **命令**：`agent-browser type` 输入 + eval 断言浮层项过滤

### 6.7 消息编辑 / 引用 / 重新生成交互
- **路径**：悬停消息 → 操作按钮出现 → 编辑（输入框回填 + 保存/取消）→ 引用（输入区引用条 + 取消）→ AI 失败消息 → 重新生成
- **断言**：编辑态输入框回填原内容；保存后更新；取消恢复；引用条可取消；重新生成替换失败内容（新气泡）
- **命令**：eval 断言编辑态 `value`；重生成后消息数不变但内容变化

### 6.8 Toast 轻提示
- **路径**：保存/删除/审批等操作后
- **断言**：成功/失败 Toast 文案准确、自动消失、不阻塞操作
- **命令**：操作后 eval 断言 `#__wf_portal` 内 Toast 文本 + 若干秒后消失

### 6.9 空状态引导
- **路径**：新租户（无数据）各页面
- **断言**：Agent/部门/公司/聊天 空态都有图标 + 文案 + 引导按钮，点击直达创建页
- **命令**：新租户逐页 eval 断言 EmptyState + 按钮 href/导航

---

## 7. ⚙️ 前端工程师视角 — 渲染正确性 / 稳定性 / 性能

> 验证 vdom 引擎正确性：DOM 与 vnode 一致、无错误、无泄漏、路由健壮。

### 7.1 页面加载无 console 错误
- **路径**：逐页导航（概览/Agent/新建/编辑/公司/部门/聊天/审批/设置/注册/登录）
- **断言**：每页 `console --level error` 为空；无「组件渲染失败」「Cannot read properties」等
- **命令**：`agent-browser console --level error`（覆盖导航全过程）

### 7.2 vdom DOM 结构正确（三层一致）
- **路径**：聊天页数组消息（含 @ / 引用 / 工具卡片 / 系统消息混合）
- **断言**：用户 JSX = vnode = DOM 一致；数组项含占位 hole 时 DOM 不串位（消息按顺序一一对应）；`data-wf-key` 与用户 key 一致
- **命令**：`agent-browser eval "document.querySelector('.wf-chat-msgs')?.outerHTML"` 消息节点顺序对照
- **回归红线**：历史 bug（Chat 回复条消失/引用错位）在此页回归——回复引用 + 发送后引用条必须出现

### 7.3 路由切换 / 前进后退
- **路径**：概览 → Agent → 部门 → 聊天 → 浏览器后退/前进
- **断言**：popstate 导航正确渲染对应页；快速连续导航无竞态（不闪错页）；URL 与页面同步
- **命令**：`agent-browser eval "history.back()"` 后断言页面标题/内容

### 7.4 登录态切换 / 401 兜底
- **路径**：登录 → 手动清 token → 触发 API
- **断言**：401 被捕获，跳登录页而非白屏/报错
- **命令**：`agent-browser eval "localStorage.removeItem('agent_platform_token'); location.reload()"` → 断言回登录页

### 7.5 受控组件行为
- **路径**：聊天输入框 / 搜索框 / 表单输入
- **断言**：输入聚焦不丢失（无重挂）；受控值回流不打断 IME；输入后 DOM 不重建（焦点保持）
- **命令**：`agent-browser type` 中文（拼音组合）→ 断言 input 未替换（`outerHTML` 引用不变）

### 7.6 浮层定位正确性
- **路径**：@ 补全 / 成员选择器 / Dropdown 反复开合
- **断言**：浮层坐标跟随锚点（`getBoundingClientRect` 非 0 且在视口内）；滚动后重定位；关闭后 DOM 清除
- **命令**：`agent-browser eval "document.querySelector('.wf-dropdown, .wf-popup')?.getBoundingClientRect()"` 断言 width>0 且 on-screen

### 7.7 流式渲染不抖动
- **路径**：AI 回复流式输出时滚动位置
- **断言**：内容追加时光标/滚动跟随（在底部时自动滚到底）；新消息不整体重建历史 DOM（diff 增量 patch）
- **命令**：`agent-browser eval "记录消息容器 children 数"` 流式前后对比（应只 +1 而非全量重建）

### 7.8 组件卸载清理（内存/监听）
- **路径**：反复切换页面（20+ 次）+ 反复开合浮层
- **断言**：无监听器/定时器泄漏（页面切换后旧页 DOM 消失）；`#__wf_portal` 无残留节点；无明显内存增长
- **命令**：`agent-browser eval "document.querySelectorAll('#__wf_portal *').length"` 多次开合后应为 0

### 7.9 前端构建 / 类型健康
- **路径**：`tsc --noEmit` + `npm run build`
- **断言**：零类型错误；构建成功；`/static/app.js` 200
- **命令**：`cd apps/agent-platform && npx tsc --noEmit && npm run build`

### 7.10 调试 trace 开关
- **路径**：`?vdom_debug=1` 打开页面
- **断言**：`[vdom/trace]` 日志 + `audit ✓ 一致` 出现（DOM 与 vnode 结构校验通过）
- **命令**：`agent-browser open "http://localhost:3000/?vdom_debug=1"` + `console --level log | grep audit`

---

## 8. 🗄️ 后端工程师视角 — API 契约 / 安全 / 数据

> 通过 curl + 浏览器行为双验证：接口契约、鉴权、租户隔离、限流、幂等、一致性。

### 8.1 公开 API 契约
- **路径**：`/api/role-templates`（9 条）、`/api/skills/available`、`/api/agents/builtin-tools`
- **断言**：字段结构符合类型定义（types.ts）；404 语义正确（不存在模板 → 404 + 错误 json）
- **命令**：`curl http://localhost:3000/api/role-templates | python3 -m json.tool`

### 8.2 鉴权保护（401）
- **路径**：无 token 访问所有 `/api/*` protected 路由
- **断言**：401 + 明确错误；`/api/auth/profile`、`/api/agents`、`/api/stats` 等全部拦截；非法/过期 token 也 401
- **命令**：`curl -i http://localhost:3000/api/agents | head -5`（无 Authorization）

### 8.3 租户隔离（多租户数据边界）
- **路径**：租户 A token 访问租户 B 的 agent/department 详情
- **断言**：404（不可见而非泄露）；列表仅本租户；消息仅本租户；审批仅本租户
- **命令**：注册租户 B → 拿 token → `curl /api/agents/<A 的 id>` → 断言 404

### 8.4 权限控制（owner vs member）
- **路径**：HITL Agent 的 owner 与非 owner 成员
- **断言**：仅 owner 可批准/拒绝其 Agent 的草稿（他人操作 403）；仅 owner 可编辑/删除其 Agent
- **命令**：user@demo.com token 操作 admin 的 Agent → 断言 403

### 8.5 速率限制
- **路径**：1 分钟内连续 100+ 请求
- **断言**：第 101 个请求返回 429 或限流提示
- **命令**：`for i in $(seq 1 110); do curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/api/role-templates; done`（注意触发全局 or 按 IP）

### 8.6 埋点幂等
- **路径**：重复 POST `/api/track` 同一事件
- **断言**：first_message 每租户仅 1 条（部分唯一索引）；非法事件名 400
- **命令**：`curl -X POST /api/track -d '{"event":"hack"}'` → 400；重复 first_message → 均 ok 但 DB 1 条

### 8.7 消息数据一致性
- **路径**：发送 → 编辑 → 删除 全链路后查 DB
- **断言**：DB 行与 UI 一致（content 更新、deleted 标记、时间戳）；回复引用存引用 id
- **命令**：`SELECT content, updated_at FROM messages ORDER BY created_at DESC LIMIT 5`

### 8.8 WebSocket 契约
- **路径**：`/ws` 连接握手 + 消息事件推送
- **断言**：握手 101；发消息推送事件（客户端收到）；断线重连（CLIENT KILL 后自动重连）
- **命令**：`agent-browser console` 观察 WS 日志；`docker exec weifuwu-postgres-1 psql -U root -d demo -c "SELECT 1 FROM pg_stat_activity WHERE query LIKE '%LISTEN%'"` 验证 LISTEN 机制

### 8.9 知识库检索正确性
- **路径**：上传文档 → 搜索 → 语义相似度排序
- **断言**：命中片段含关键词/语义相关；相似度分数合理降序；删除文档后检索不到
- **命令**：curl `POST /api/agents/:id/knowledge/search` 断言结果数组

### 8.10 错误处理 / 非法输入
- **路径**：非法 JSON / 超长字段 / 不存在 id
- **断言**：400/404 明确错误码，不 500 崩溃；日志无堆栈刷屏
- **命令**：`curl -X POST /api/departments -d '{bad json'` → 400

### 8.11 DB 迁移幂等
- **路径**：重启服务两次
- **断言**：schema 初始化幂等（CREATE IF NOT EXISTS），不 DROP 数据；agent-platform migration 标记复用
- **命令**：`curl -s http://localhost:3000/api/role-templates > /dev/null && docker exec weifuwu-postgres-1 psql -U root -d demo -c "SELECT COUNT(*) FROM agents"` 前后一致

---

## 9. 执行建议

1. **顺序**：按角色顺序 1→8，但**核心链路优先**（§2.5 聊天 / §3.4 HITL / §1.1 漏斗 先测）
2. **破坏性分组**：删除/改密码/拒绝 操作集中在各角色最后
3. **数据策略**：演示租户只读验证；写操作（建 Agent/部门/发消息）优先用**临时注册租户**或接受 demo 数据增长
4. **回归红线**（每次发布前必须过）：
   - §7.1 全页无 console error
   - §7.2 聊天消息 DOM 顺序（历史 bug 区）
   - §2.5 流式回复
   - §1.1 漏斗卡片
5. **记录**：每项通过打 ✅，失败记录复现命令 + 截图（`agent-browser screenshot`）
