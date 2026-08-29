# sandbox 测试优化计划（SANDBOX-TEST-PLAN——2026-08）

> 现状：test/sandbox.test.ts——11 个 docker 集成测试（T-M1/M2/M5/M6 系列）
> **~59s**（T-M1b 14s / T-M1d 10.6s / T-M2a 11.4s / T-M2c 5.6s 为主）——
> 已移出默认套件（test:docker 专项——RUN_DOCKER_TESTS=1 守卫）。
> 目标：**在保留测试语义（真实容器行为验证）的前提下提速 + 增强健壮性**。

---

## 一、耗时解剖（精准测量——每测试的内部时间分布）

| 测试 | 总耗时 | 慢因（估计） | 可压缩性 |
| --- | --- | --- | --- |
| T-M1a 并发 ensure | 1.2s | 10 并发 × ensure（probe/pull/创建）——**镜像检查重复** | 中 |
| **T-M1b busy 豁免** | 14.2s | sleep 2.5 + reconcile 轮询 1.5s + idle 1.2s + **容器启动 ~8s** | **高** |
| T-M1c 超时杀树 | 1.4s | 快速 | 低 |
| **T-M1d stopped 自愈** | 10.6s | docker stop 15s timeout + 自愈 start + 等待 | **高** |
| T-M1e 漂移重建 | 0.7s | 快速 | 低 |
| **T-M2a 状态机全路径** | 11.4s | 多状态转换（每转换容器启停等待） | **高** |
| T-M2b 孤儿清理 | 0.2s | 快速 | 低 |
| **T-M2c 串行队列** | 5.7s | 并发 exec（每个 exec 容器内运行） | 中 |
| T-M2d 配额 | 0.05s | 快速 | 低 |
| T-M5-2 池预算 | 0.6s | 快速 | 低 |
| T-M6-3 ephemeral | 0.7s | 快速 | 低 |

**总量判断**：3 个慢测试（T-M1b/M1d/M2a ≈ 36s = 61%）——**慢因是容器启动等待**（ensure 的 probe/probeImage/probeNetwork 多次 docker CLI + 容器 ready 轮询）。

---

## 二、优化方案（按收益/成本排序）

### S1 · 镜像预拉取 + 镜像检查去重（高收益低风险）
- **现状**：每测试 `makeSandbox` → ensure → `probe()` → `ensureImage`（`docker image inspect` + 可能 `docker pull`——**多次重复**）
- **优化**：before 一次 `ap-sandbox:latest` 预检查/预拉取（幂等——**只失败时拉**）——测试内 ensure 不再拉（已有镜像即跳过）
- **预期**：省 T-M1a 的重复检查 + 冷环境首次拉镜像（镜像存在时 ~0.5s/测试）

### S2 · 容器启动等待轮询最小化（高收益）
- **现状**：ensure → docker run → **轮询 inspect 直到 running**（间隔/次数保守——**实测容器启动 3-8s**——轮询可能多等）
- **优化**：轮询间隔 300ms→150ms + **事件驱动**（docker inspect once + 短 sleep——**实测加载 vs 等待**）——记录真实启动耗时校准
- **预期**：每测试省 1-3s（容器启动快的环境）

### S3 · 慢测试的「按需等待」裁剪（中收益——保留语义）
- **T-M1b 14s**：sleep 2.5（exec 语义）+ reconcile 1.5s（busy 豁免语义）+ idle 1.2s——**语义必需**——但**容器启动 8s 可压缩**（S2）——改 `idleTimeoutMs` 更短（800ms 已是——**启动等待是主因**）
- **T-M1d 10.6s**：docker stop 15s timeout（**实测 stop 耗时**——改 timeout 8s——容器停止快）+ 自愈 start 等待（S2）
- **T-M2a 11.4s**：状态机多转换——每转换一次容器 ensure——**串行必要**——**但**每步等待可压（S2）

### S4 · 并行化（中收益——架构级）
- **现状**：串行（`--test-concurrency` 文件级——测试内部串行）
- **优化**：T-M1c/M1e/M2b/M2d/M5-2/M6-3（6 个快/独立测试——**同一沙盒租户隔离**——不同部门 id 并行）——`await Promise.all` 或分文件——**挑战**：共享 DB（TEST_APP）——cleanTestData 每次全清——**并行需按部门隔离清理**
- **预期**：6 个快测试 2s 并行完成——省 ~1s——**收益有限（快测试本身就快）**——**P2 优先**

### S5 · 镜像构建断言（防漂移——新能力）
- 加：**tool-runner.js 版本断言**（测试容器内 tool-runner 与 src 一致——bind mount 已验——**改为显式断言**——漂移防线）

### S6 · 测试超时显式化（健壮性）
- **现状**：容器操作无显式测试超时（node --test 默认无——挂起则等 forever）
- **优化**：每测试 `{ timeout: 15_000 }`（慢的 20s）——**挂起即失败（确定性）**——不再无限等
- **预期**：测试永远有界（用户痛点「挂起」根治）

### S7 · skip 机制精确化
- **现状**：`HAS_DOCKER = RUN_DOCKER_TESTS && dockerAvailable()`——skip 全有/全无
- **优化**：**分层 skip**——`docker 不可用 → skip`；`沙盒镜像缺失 → skip 但 warn`（可安装）——**诊断信息**（为什么 skip——测试可观测）

---

## 三、执行波次

### Wave 1·速度（S1+S2+S3——目标 59s → ~35s）
1. before 镜像预检查（幂等——保证存在 → 测试 ensure 快速）
2. ensure/self-heal 等待轮询校准（300ms→150ms + 实测启动耗时）
3. T-M1d 的 docker stop timeout 15s→8s（实测 stop 快）
4. **验收**：test:docker 全量 <40s（当前 59s）——测试语义零删减

### Wave 2·健壮性（S6+S7——目标 永远有界）
5. 每测试显式 timeout（15s/20s——挂起即失败）
6. skip 分层 + 诊断信息（warn 原因——不静默）
7. **验收**：挂起测试在 timeout 内失败（不再无限等）——skip 原因可见

### Wave 3·能力（S5——可选）
8. tool-runner 版本断言（bind mount 漂移防线）
9. **验收**：容器内 runner 与 src 一致显式断言

---

## 四、测试纪律（AGENTS 对齐）
- **不删语义**：T-M 系列是真实容器行为验证（保证沙盒生产正确）——优化只压缩等待/重复——**不 mock 不跳过真实行为**
- **测量优先**：每优化前先测基线（耗时分布）——优化后对比（数据说话）
- **诚实裁剪**：S4 并行化——收益有限且增加 DB 隔离复杂度（P2 先不做——登记）
- **每波收尾**：test:docker 绿 + 非 docker 环境 skip 正常 + 其余套件不回归

---

## 五、验收标准（计划完成定义）
1. **test:docker 全量 <40s**（当前 59s——压缩 30%+）
2. **零挂起**：每测试显式 timeout——最慢测试有界（<20s）
3. **语义零删减**：11 测试全保留（断言不变）
4. **skip 可观测**：docker/镜像缺失时 warn 原因（不静默）
5. **无回归**：默认套件（286）不受影响
