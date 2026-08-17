# 01 开源生态计划（Ecosystem）

> 目标：weifuwu 从"高质量仓库"成为"开源项目"——可被发现、被采用、被贡献。
> 质量底子已就绪（520 测试/60 audit/防漂移/verify/文档随包）——缺的是"入口和仪式"。

## 目标与验收

```
目标：npm i weifuwu 可安装可用；外部开发者可无门槛贡献（文档/测试/组件）
验收：
  □ npm 发布成功（门面：名称/描述/关键词/README 首屏）
  □ CONTRIBUTING.md 上线（跑/测/提交/文档贡献四条路径）
  □ Issue/PR 模板生效（bug/feature/组件贡献三类）
  □ 首个外部 PR 合入（里程碑）
```

## 任务清单

| 优先级 | 任务 | 产出 | 依赖 |
|--------|------|------|------|
| P0 | npm 发布门面：package.json（name/desc/keywords）+ README 首屏（是什么/30 秒体验/能力速查） | 发布后 npm 页可读 | 03 组件定稿 |
| P0 | CONTRIBUTING.md：开发环境（node 版本/.env）/ 测试规范（单文件命令/预算）/ 提交规范 / 文档贡献路径（content/ 编辑 → gen-content --check）/ 组件贡献路径（scaffold + 场景 demo） | 贡献者入口 | — |
| P0 | Issue 模板（bug 报告：复现/期望/环境）+ PR 模板（变更/测试/文档同步勾选） | 贡献漏斗规范化 | — |
| P1 | 落地页部署（见 05——发现入口的最终形态） | weifuwu.dev | 05 |
| P1 | 案例墙：showcase 首页"用 weifuwu 做的应用"（agent-platform + 社区案例提交入口） | 传播素材 | 05 |
| P1 | /community 组件收录：提交模板（包名/描述/场景 demo/质量 checklist）+ 收录展示 | 中级贡献台阶 | 02 |
| P2 | 弃用纪律：breaking change 提前 1 版本 console.warn 标记 → 下一版移除（0.x 阶段的兼容信用——成熟由反馈循环定义，非 1.0 里程碑） | 逐步成熟的信任基础 | — |
| P2 | RFC/设计评审流程（大变更先文档后实现——AGENTS.md 升级为流程） | 治理决策机制 | — |
| P2 | 版本节奏：0.x 快速迭代 + 每版 CHANGELOG 强制（破坏性变更清单） | 可预期的演进 | — |

## 质量门槛（贡献者视角）

```
□ 贡献指南可达（README 导航 → CONTRIBUTING.md）
□ 外部贡献者 30 分钟内跑通：clone → 单文件测试 → 改 content/ → gen-content --check
□ 组件贡献走 scaffold（三件套 + 场景 demo + registry 自动登记）——与内部开发同一流程
```

## 状态（2026-12 核对）

**P0 全部完成 ✅**——npm 门面（package.json name/desc/keywords + README 首屏）/
CONTRIBUTING.md / Issue+PR 模板（.github/）已上线；本轮修正 desc 组件计数（121→129）。
P1：/community 域落地（社区组件收录页 + 提交指引 5 步 + 空态占位——首个外部 PR 的承接台阶）；
案例墙已有（首页"用 weifuwu 做的应用"——agent-platform/showcase/模板）。
剩余：**首个外部 PR 合入（里程碑——需社区行动，非代码）** + P2（弃用纪律/版本节奏）。

## 状态

进行中——**P0 ✅ + 案例墙 ✅**（npm 门面/CONTRIBUTING/Issue+PR 模板 + 案例墙：registry cases 表 6 案例——agent-platform 生产级/showcase 自举/4 模板 + 首页"提交你的案例"入口）；community 收录机制待做
