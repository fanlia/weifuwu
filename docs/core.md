# weifuwu/core —— 内核分层（L0/L1/L2）

> **状态：W0 草稿（2026-09）**——判据与规则为规范面；分层清单由
> `node scripts/core-levels.mjs` 生成（`src/core/levels.json`），文档在 W4 由清单生成。
> 实施过程见 `plan/core-分层与冻结.md`。

weifuwu 的内核不是目录，而是**一组"去掉就不再是 weifuwu"的机制**：双端共享路由、
命令流渲染、声明式数据面、组合/生成协议。为了保证它可冻结，内核按**依赖深度**分三层——
**Level = 依赖方向 = 环境约束 = 冻结节奏**（一条主轴，三个含义）。

## 分层判据（分类三问）

新能力归属只答这三问：

| 问题 | 是 | 归属 |
| --- | --- | --- |
| 没有运行时也存在？（纯数据/协议/不变量） | ✅ | **L0 协议**——立即冻结 |
| 它"执行"某件事？（I/O / DOM / node） | ✅ | **L1 运行时**——随 1.0 冻结 |
| 它在"生成"什么？（声明 → 行为/机械部分） | ✅ | **L2 生成**——迁移后入承诺（provisional） |
| 以上都不满足 | — | **装备**（组件/中间件/线协议/工具） |

## 规则矩阵

| 规则 | L0 | L1/universal | L1/server | L1/client | L2 |
| --- | --- | --- | --- | --- | --- |
| 允许 import | L0 only | L0 | L0+L1 | L0+L1 | L0/L1（禁反向） |
| 环境 | universal | universal | `node:*` | DOM | 视子目录 |
| 三方依赖 | 0 | 0 | 0 | 0 | 0 |
| 测试 | 纯函数零 mock | node 直跑 | node 直跑、无 docker | 契约 harness | 契约 harness |
| 变更 | 快照 + 弃用周期 | 随 1.0 | 随 1.0 | 随 1.0 | 迁移期可动 |

## 承诺边界

- **L0**：冻结面——出口快照 golden，变更属显式事件。
- **L1**：随 1.0 冻结；0.x 内变更需弃用记录 + 快照 diff。
- **L2**：provisional——三面论 / 原语全面化收口前不承诺，之后按 L1 冻结。
- **装备**：自由演进/可弃；core 不得依赖装备。

## 目录形态（W3 已落地）

```
src/core/
├── levels.json        # 生成物：模块 → {level, env, loc}
├── l0/                # universal（协议/纯数据）
├── l1/{server,client}/ # 运行时（IO/DOM/node）
└── l2/{server,client}/ # 生成器（声明 → 行为）
```

**目录即层级**：审计（`scripts/core-levels.mjs`）以 `src/core` 为唯一 scope，
按目录前缀定级——新增能力先答三问，再入对应目录。

**兼容 shim**：旧路径（`src/shared/router/**`、`src/server/db/{shape,errors,…}.ts`、
`src/client/vdom/{core,hooks,context,…}/**` 等 116 个）保留 `export *` 重出——
装备面/测试/dist 入口零改动；移除条件：1.0 或消费点全迁移。
core 自身**不得**经 shim 导入（审计对 core→非 core 导入 = 泄漏即红）。

## 工具

```bash
npm run core:levels          # 生成清单与基线（src/core/levels.json + scripts/core-levels-baseline.json）
npm run audit:core-levels    # 校验：新增未知/三方/泄漏/上行/闭包依赖 = exit 1（存量基线登记）
npm run test:core            # 内核回归（无 docker/无浏览器：契约 + shared + core + 内核域）
```

基线数字（W3 目录迁移后——内容未变，随迁移更新）：

| 层 | 文件 | 行数 | 导出 |
| --- | --- | --- | --- |
| L0 | 25 | 2856 | 215 |
| L1 | 84 | 12912 | 383 |
| L2 | 7 | 693 | 22 |

（装备面不在 scope —— 组件/中间件/线协议/工具为范围外，自由演进。）

违规基线（W3 收口）：**core→装备泄漏 0 · 三方依赖 0 · 未知 0 · 闭包三方 0**；层内上行 1（`vnode(L0)→UIContext(L1)` type——待收编/登记）。
