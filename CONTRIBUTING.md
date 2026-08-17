# 贡献指南（CONTRIBUTING）

> weifuwu 开源生态的入口——四条贡献路径，从易到难。
> 质量底线：任何贡献都过质量防线（测试 + 防漂移 + verify）——不是"能跑"而是"达标"。

## 开发环境

```bash
node >= 22（原生 TS 支持——零构建）
npm i                       # 安装依赖
node apps/showcase/server.ts   # showcase 平台（:3200）
node src/cli/docs.ts        # 本地文档站（:4000）
```

## 测试规范

```bash
# 单文件测试（开发迭代——快速定位）
timeout 15 node --env-file=.env --test --test-timeout=8000 <file>

# 全量测试（发布前——≤15s 预算，--test-concurrency=8 已固化）
npm test
```

- 组件测试用官方原语：`weifuwu/ui-dom/testing`（renderVNode / mountComponent / findByClass / createTestCtx）
- 新组件测试 ≥3 条硬地板；交互组件 ≥8（不足登记 TEST_GAP 并说明）
- **行为变更先查旧测试**（默认值/时序变更后旧测试可能静默挂起而非失败）

## 提交规范

```
1. 小步提交（一次变更一个主题）
2. 提交信息：动词 + 对象（如 "fix(router): 根路径与通配并存"）
3. 变更后必跑：相关测试组 + node scripts/gen-content.mjs --check（文档防漂移）
4. 发布前全量：npm test + node .pi/skills/weifuwu-dev/scripts/verify.mjs
```

## 四条贡献路径

### ① 文档贡献（最容易——不需要懂框架内部）

```
1. content/ 下找要改的文档（content/guides/、content/components/*.md）
2. 编辑 .md → 3. node scripts/gen-content.mjs --check（防漂移校验）
4. 提交 PR（模板勾选"文档同步"）
```

### ② 测试贡献（补覆盖）

```
1. 找组件测试（src/components/<Name>/<Name>.test.ts）
2. 补交互/边界/键盘用例（测试规范见上）
3. 跑单文件测试 → 提交
```

### ③ demo 贡献（场景化演示）

```
1. apps/showcase/src/demos/<cat>.tsx 加 Demo 组件（场景化——不是孤立展示）
2. DEMOS map 登记（组件名 → Demo）
3. node scripts/gen-content.mjs --check → 提交
```

### ④ 组件贡献（完整流程）

```bash
# scaffold 生成三件套 + registry 自动登记
node .pi/skills/weifuwu-dev/scripts/scaffold.mjs component <Name> [category]
```

1. 实现 + 纪律（受控回调/键盘/样式 token/浏览器纪律 ctx.browser）
2. 测试 ≥3 条（渲染/交互/键盘）
3. demo 场景化（见 ③）
4. style-audit 合规（对比度/动效/键盘/hover）
5. `node scripts/gen-content.mjs`（文档生成）→ 全量测试 → verify

## 框架贡献（核心）

```
1. 大变更先文档（design/ 计划 + 理由）——RFC 精神
2. 实战先行：框架能力变更先在 apps/agent-platform 验证
3. 诚实裁剪：不支持的能力抛 ProtocolError('unsupported'），不静默降级
4. 防线不破：style-audit / 防漂移 / verify / LLM 体验审计全绿
```

## 质量防线（提交前自查）

```
□ 相关测试组绿（单文件 + 关联组）
□ node scripts/gen-content.mjs --check（文档与 registry 同步）
□ node .pi/skills/weifuwu-dev/scripts/verify.mjs quick（内容健康）
□ 浏览器走查（交互组件——agent-browser 真实点击）
```

> 开发手册全文：`.pi/skills/weifuwu-dev/SKILL.md`（五步工作流 + 纪律速查 + 命令表）。
> 文档库：content/（随 npm 包发布——node_modules/weifuwu/content/）。
