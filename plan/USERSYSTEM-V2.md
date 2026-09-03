# USERSYSTEM-V2 userSystem 产品级多租户（2027-09）

> 目标：userSystem 升级为「开箱即用 SaaS 框架」的用户系统——**开发者 3 行接入、
> 零 auth 代码、零角色双源**；agent-platform（试验田）收敛全部自建用户面。
> 用户拍板定案：_builtin 系统应用 · 注册=账号+系统成员+默认应用 · 应用面全 SSO
> · 系统级单 IdP · 两形态（A 单体嵌入式——V2 交付；B 中心身份+业务 server——判负延期）。

## 现状探针（基线锚点）

- 平台 `routes/auth.ts` **273 行**自建（register 60/slug 冲突 200 次循环/invite 25/
  join 60/SSO 77——标准 OIDC 授权码——全通用逻辑）
- 前端**角色双源**：`localStorage.agent_platform_role`（Login 写·**Register 漏写**）
  vs token payload `role`（框架签发已带）——实测注册用户聊天框误禁用
  （agent-browser 验证实录）
- members 表已有关系列：`app_id/user_id/role/invited_by/joined_at`
  （**关系表已存在**——缺 source/last_login_at 元数据）
- 框架 userSystem 815 行 · routes 已内置（register/login/logout/refresh/me/apps/
  apps:slug/* · exclude 机制）——平台绕开自建
- APP_TABLE/ALREADY：`_weifuwu_apps`/`_weifuwu_app_members`/`_weifuwu_sessions` ✓
- token payload 已带 `appId + role`（loginApp 签发）——`ctx.appId`/`ctx.auth.role`
  后端面已通——缺口=me() 前端会话面 + 平台自解/双源

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | _builtin 系统应用 migrate（幂等）+ members 补列 source/last_login_at | user.test 契约：_builtin 存在 · 列存在 |
| W2 | registerWithApp 完成（slug 冲突后缀收编 200 循环 + onRegisterApp hook）路由 /register 升级 | 契约：同域名 slug 自动 -N · 响应含 app · hook 触发 |
| W3 | me() 升级 { user, session } + ctx.session 注入（归一 ctx.appId/auth.role） | 契约：me 带 session · ctx.session 三元组 |
| W4 | OIDC SSO 内建（/apps/:appId/auth/sso/start|callback + 回调页）+ allowedRoles 幽灵拦截（invite/registerInApp） | 契约：start 302 state · callback 建号/加成员 · 非法 role 403 |
| W5 | members 元数据写入面（source=register/invite/sso · last_login_at 更新） | 契约：三种来源标记 · 登录刷新 |
| W6 | weifuwu/client `useSession()`（me 面消费端）+ 平台前端迁 me()（删 localStorage 双源） | 平台 UI 测试迁 me() 断言 · 注册流不再需 role localStorage |
| W7 | 平台收敛：auth.ts 删（SSO 框架面）· server.ts 接线 hooks/sso · Login/Register 迁新路由 | 平台 UI e2e 全绿 · auth.ts 文件删 |
| W8 | 全量回归门（契约+场景+showcase+server+平台 UI + audit 七线）+ 文档（docs/server.md §userSystem + AGENTS）+ 计划归档 | 五域全绿 · audit 七线 exit 0 |

## 判负记录

- **不做 userSystemRemote（B 形态客户端面）**：零消费者（agent-platform=A 形态）——
  但 `AuthApi` 契约面即天然 remote 实现面（未来 createUserSystemClient ~150 行）
  ——推翻条件：自研应用消费中心身份真实需求出现
- **不做应用级多 IdP**：系统级单 IdP 覆盖 90%——推翻条件：租户自带 IdP >1 例
- **不做独立注册事件流水表**：审计/行为分析属应用层（平台 audit 服务已有）
- **不做 members 变更同步事件**：TTL 缓存（60s）角色变更延迟可接受——推翻条件：
  <1s 实时性需求出现

## 验收标准

- [ ] user.test 含 V2 契约（_builtin/registerWithApp/me/session/SSO/白名单/source）
- [ ] 平台 auth.ts 删除 · localStorage 双源删除 · e2e（注册→聊天→workflow）真浏览器绿
- [ ] 全量回归门绿 + audit 七线 exit 0
- [ ] 文档收尾（docs/server.md §userSystem 双形态图示 + AGENTS 内核资产）
