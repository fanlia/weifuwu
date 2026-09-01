# ROLES-OPTIMIZATION-PLAN · 角色体系优化计划（ROLES.md §6 设计观察落地）

> 2027-10 制定。来源：角色走查 + ROLES.md §6 设计观察 4 条 + 探针行号级证据
> （本计划探针已做——每项带证据锚点）。四条观察的处置分流：
> 观察一/二 → 波次交付；观察三/四 → 已闭环/判负（§4）。
> 完成状态：**待执行**（波次 1-4）

---

## 0. 探针结论（修正认知——计划依据）

### 探针 1：「幽灵 admin」修正——半幽灵

`invite` API 实际**可铸造** app 级 admin：`createInvite` 的
`opts.role !== 'owner' ? opts.role : 'member'` 放行任意串（传 admin 就存 admin）。
前端 Settings 只产 member/viewer、DB 实际分布 **0 个 admin**——「可铸造但无人铸造」。

8 处 admin 分支分两类（裁剪范围不同）：

| 类 | 位置 | 语义 | 处置 |
| --- | --- | --- | --- |
| 租户级 admin（app_members.role） | messages.ts L346（删任意消息）、agents.ts L305、departments.ts L104/L375（建删部门） | 检查 `appRoleOf`/`auth.role` | **裁剪**（删 admin 分支——DB 无实例行为不变） |
| 部门级 admin（department_members.role） | messages.ts L422/L462（草稿编辑/审批）、departments.ts L447/L521（成员管理） | 检查 department_members.role | **保留**（710 个实例——合法角色） |

附带发现：departments.ts L105 错误文案「只有租户所有者或**部门管理员**可以创建部门」——
检查的却是租户级 role，语义张冠李戴（一并修正）。

### 探针 2：写入口前端角色感知现状

| 页面 | 角色感知 | 现状 |
| --- | --- | --- |
| Workspace.tsx | ✅ L101-102 isViewer（localStorage `agent_platform_role`） | 新建按钮 viewer 禁用（regression.test 已锁） |
| Departments.tsx | ❌ 0 | 建部门按钮全角色可点（member/viewer 点了 403） |
| Agents.tsx | ❌ 0 | 创建入口 viewer 可点（member 合法不改） |
| Settings.tsx | ❌（仅 1 处文案） | 邀请区 member/viewer 可见可填（提交 403） |
| Approvals.tsx | ❌ 0 | viewer/member 可进（操作时 403） |
| Chat.tsx | 部分（$.isAdmin 只管删消息按钮） | **输入框 viewer 全可用**——打完字才「发送失败」（走查 P0 实证） |

### 探针 3：403 原因吞没

`sendText` catch → `toast('发送失败')`——服务端 403 body
「只读成员无权执行此操作」被丢弃（`errMsg` 工具已存在但未用）。

---

## 1. 波次计划

### 波次 1：幽灵 admin 裁剪（权限面诚实化——纯后端）

- **invite 路由 role 白名单**：`role ∈ {member, viewer}`，其余（含 admin）→ 403
  「邀请角色仅支持 member/viewer」（auth.ts L111 处加校验）
- **租户级 4 处分支删 admin**：`role !== 'owner' && role !== 'admin'` →
  `role !== 'owner'`；`auth!.role === 'owner' || auth!.role === 'admin'` →
  `auth!.role === 'owner'`（行为不变——DB 无 admin 实例——诚实化）
- **部门级 4 处保留**（合法——加注释与租户级区分，防未来误裁）
- **文案修正**：departments.ts L105 →「只有租户所有者可以创建部门」（L375 同）
- **防线**：① invite `role=admin` → 403 契约（roles.test 矩阵补）② 既有角色矩阵全绿
  （行为不变证明——member 建部门 403 等）③ DB 断言 admin=0（探针校验入测试注释）
- 验收：全量绿 + roles.test 新增 1 例

### 波次 2：写入口角色遮蔽（前端防线与 API 双保险——走查 P0-2 前半）

- **模式**：复用 Workspace.tsx 先例（localStorage `agent_platform_role`——injectAuth
  与登录流均已写入；实现时核验登录流 role 写入链）
- **遮蔽清单**（禁用态 + tooltip 原因，不做菜单隐藏——判负见 §3）：
  - Departments：建部门按钮——viewer「只读成员」/member「需要租户所有者」禁用
  - Agents：创建入口——viewer 禁用（member 保持可用——writer 合法）
  - Settings：邀请区——member/viewer 渲染禁用卡「仅租户所有者可邀请」
  - Approvals：viewer/member 进入时页头提示条「你没有审批权限」（操作按钮保持——API 兜底）
  - Chat：**输入框**——viewer 禁用 + placeholder「只读成员无法发言」；非部门成员同
    （`requireDeptMember` 403 前置感知——当前部门成员资格已有 $.msgs 面数据）
- **不改**：member 的 Agent 创建/上传/发消息（合法 writer 面不动）
- **防线**：UI 测试每页禁用态断言（点击无效 + tooltip 存在）——viewer 矩阵的前端半边
- 验收：走查复测三角色首屏——写入口零「可点但失败」形态

### 波次 3：403 原因透出 + 落地引导（走查 P0 体验面）

- **403 原因透出**：sendText catch → `toast(errMsg(e, '发送失败'), 'error')`
  （服务端「只读成员无权执行此操作」直达用户）；顺扫 deliverables/settings 等页
  同类吞错点（走查范围优先）
- **落地引导（工作台按角色定制空态）**：
  - viewer 登录首屏：身份说明卡「你是只读成员——可查看消息与下载交付物」
  - member 无空间：「等待所有者将你加入项目空间」+ 空间列表常态
  - （owner 空态已有 EmptyState 引导——不动）
- **断言演进（有据）**：roles-journey viewer 旅程 toast 断言从「发送失败」
  **有意更新**为「只读成员无权执行此操作」——测试即文档的契约升级
- **防线**：viewer 旅程断言更新 + 工作台角色空态 UI 测试
- 验收：走查三角色落地路径复测——首屏自解释、失败有原因

### 波次 4：验收归档

- 全量回归（应用 386+ 全绿 / tsc 0）+ 三角色 × 双视口走查（1280/390）
- ROLES.md §6 观察条目更新为「已处理状态 + 波次锚点」；§2.4 viewer 缺口条目清账
- commit 锚点登记（本文件头部）

---

## 2. 每波单一主题验收表

| 波次 | 主题 | 层 | 新增防线 | 回归门 |
| --- | --- | --- | --- | --- |
| 1 | 幽灵 admin 裁剪 | 后端权限 | invite 白名单契约 | 既有矩阵全绿（行为不变） |
| 2 | 写入口遮蔽 | 前端防线 | 每页禁用态断言 | 双视口走查 |
| 3 | 403 透出 + 引导 | 前端体验 | viewer 旅程断言演进 | 走查落地路径复测 |
| 4 | 验收归档 | — | — | 全量 + 三角色双视口 |

---

## 3. 判负预登记

| 项 | 判负理由 | 推翻条件 |
| --- | --- | --- |
| 菜单级隐藏（「管理」组按角色收起） | 读面导航有真实价值（viewer/member 需要浏览部门/Agent 列表找上下文）——写入口遮蔽（波次 2）已消除「可点但失败」的越权感知；菜单隐藏增加导航维护成本 | 用户实测反馈菜单混乱/误入率高 |
| app 级 admin 补铸造入口 | 波次 1 已选裁剪——租户 owner + 部门 admin 双层已覆盖管理场景，多一层角色提高理解成本 | 出现「多租户管理员分担」真实客户需求 |
| owner 占比模型调整（观察三） | 「注册即建租户」是产品增长模型非 bug；邀请链路防线已厚（seedRoleMember + 矩阵 3 例 + settings 链路 3 例） | 数据表明邀请转化漏斗存在问题 |
| RBAC 细粒度权限表/角色编辑 UI | 现三角色 + 部门级双层覆盖演示与走查场景；引入权限表 = schema + 管理 UI + 迁移三面成本 | 客户明确要求自定义角色 |
| 观察四（样本勘误）开工作项 | 已闭环——ROLES.md §6.4 纪律 + seedRoleMember 造号标准已立；无代码可改 | — |

---

## 4. 验收基线（全绿门禁）

应用 `npm test` 386+ 全 pass · tsc 0 · 三角色 × 双视口（1280/390）走查零
console 错误 · viewer 旅程断言演进有据（「发送失败」→ 403 原因文案）·
每波独立 commit · ROLES.md 同步更新
