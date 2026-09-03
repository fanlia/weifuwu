# USERSYSTEM-V4 —— 管理面定案（_builtin=应用管理面·_default=平台业务面·appKey 分离面）

> 定案链：四层角色跨域复用 → _builtin=应用管理面（全员在册·身份即资格）→
> _default=平台业务应用（超级管理员关联）→ 单应用模式（agent-platform=_default）
> → appKey/appId 机器凭据（未来控制平面与服务分离的沟通面）。

## 状态：完成

| 项 | 内容 |
| --- | --- |
| 角色定案 | owner（1·最高）/admin（N·委派）/member（注册用户·管理面身份）/viewer（显式委派·只读）——层级决定权力·域决定语义 |
| `_builtin` | 应用管理面：全员 member 入册（身份即资格）· owner=超级管理员·admin=系统管理员·viewer 禁·注册开关恒 false·不走邀请 |
| `_default` | 平台业务应用（migrate 幂等建·owner 空→seed 首 owner 关联）· 普通应用属性（可开放注册）· 开发者直接开发 |
| 规则 | 一切注册必经 _builtin（register/register-app/registerInApp/ssoLogin 全覆盖 + migrate 存量补挂）· createApp 资格= _builtin 成员 · slug `_` 前缀保留名 · registerInApp 检查 open_registration |
| appKey | 随机 64 hex（createApp 生成·存量回填）· appId=应用 id · `POST /api/auth/system/verify`（X-Wf-App-Id/Key）机器验证端点——未来分离的服务间认证 |
| 平台 | 单应用模式：注册=加入 _default（registerInApp 路径）· 登录=直进 _default（无应用选择）· _default 开放注册（启动 UPDATE） |
| 回归 | 框架 server 747/747 · 平台 449/449 · 契约 433/433 · tsc 0 · build ✓ |

## 关键设计决策

- 不新增角色（sysadmin 判负）——四层跨域复用（判定=appId+role 组合）
- viewer=匿名落点方案 A（显式委派——匿名=无角色）
- _builtin=用户中心（V2）→ 升华：应用管理面（全员在册·身份即资格）——V3"系统域纯净"修正（普通用户摘除过度——管理面身份是注册必经）
- _default：控制平面自己的业务应用——agent-platform 单应用模式的落点（后续留 register-app 通用能力）
- appKey：纯凭据面（生成/存储/验证端点）——未来拆分 _builtin 独立 server 时业务方凭 appId+appKey 调用控制平面

## 诚实边界

- appKey 明文存储（内部系统——生产可加 casing/轮换接口——未建）
- 平台测试种子流（registerTenant——个人应用）与产品流（_default）并存——测试隔离租户语义（注释说明——后续可迁移）
- _default 开放注册为启动 SQL（无 owner 认证面——平台自管）
- 分离场景（两 server）未实测——凭据面+共享 DB 就绪——通信端点仅 verify（按需扩展）
