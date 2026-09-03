# USERSYSTEM-V2 —— 产品级多租户升级（完成）

> 目标：userSystem 从「框架面」升级为「产品级多租户」——系统应用/产品注册/
> 会话单源/SSO 内建/角色白名单。平台自建 auth.ts 收敛至框架 hooks。

## 状态：完成（2027-xx）

| 波次 | 内容 | 状态 |
| --- | --- | --- |
| W1 | `_builtin` 系统应用（固定 id·migrate 幂等）+ members 补列 source/last_login_at | ✅ |
| W2 | `RegisterWithAppInput/Result` · `registerWithApp`（账号+_builtin 成员+默认应用+app token）+ 路由 `POST /api/auth/register-app` | ✅ |
| W3 | `ctx.session`（token 解出 { userId, appId, role }——业务一行读身份）· `me()` 返回 { user, session } · Session 接口声明 | ✅ |
| W4 | OIDC SSO 内建（enabled/login/callback 三路由 + renderCallback 可定制 + state 定向 + token 交换失败显式 401）· allowedRoles 白名单拦截（invite/addMember/registerInApp） | ✅ |
| W5 | members 元数据写入（register/sso/invite source + loginApp/ssoLogin last_login_at）· onJoinApp hook | ✅ |
| W6 | `ctx.ui.useSession`（me() 会话面 getter——前端角色/租户单源——401 降级 null） | ✅ |
| W7 | 平台收敛：routes/auth.ts 删除（273 行）· server.ts hooks（onRegisterApp 默认 Agent+试用 / onJoinApp / onSsoLogin）+ SSO 接线（OIDC_* env）· 前端 Register 迁移 register-app·Login 删 localStorage 角色写 · roles.ts clientRole 解 token payload | ✅ |
| W8 | 全量回归：契约 433 · server 737 · showcase 328 · scenario 123 · shared 25 · 平台 449 · tsc 0 · build ✓ · audit:all 七线 ✓ | ✅ |

## 关键设计决策

- **注册 = 账号 + _builtin 成员 + 默认个人应用**（owner）——开箱即用；纯账号 `/register` 保留
- **会话单源**：token payload（appId/role 签发即带）——前端 clientRole 解 JWT——双源根除
- **SSO**：系统级单 IdP（OIDC 授权码——issuer 派生 authorize/token/userinfo——无 discovery
  诚实裁剪）；未配置 = 路由不挂（enabled 404——前端优雅降级）；JWT 验签留待生产强化
- **角色白名单**：allowedRoles（默认四角色）+ inviteRoles（平台收紧 member/viewer——ROLES-OPTIMIZATION 波次 1 红线）
- **B 形态（userSystemRemote 中心身份）判负延期**——AuthApi 契约面即实现面（零成本预留）

## 诚实边界

- SSO 平台面（server.ts 接线）无自动化 e2e（需真 IdP env）——框架契约已覆盖 mock IdP 全链
- 角色降级非实时（刷新 token 后生效——API 403 兜底）
- loginApp 路径 last_login_at 写入不异步——登录热路径一查一更新（可接受量级）
