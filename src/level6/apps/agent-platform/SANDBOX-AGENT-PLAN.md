# sandbox entrypoint 升级计划（SANDBOX-AGENT-PLAN——2026-08）

> 用户洞察：**「让 entrypoint 完全可控——每个 docker 镜像有一个 agent」**——
> 深挖 stop 10s 慢因后的架构级结论：**容器 PID 1 是裸 sleep/工具进程——
> 无信号处理——内核忽略 PID 1 的默认信号动作（SIGTERM 被丢弃）——
> 10s 后 SIGKILL**。**根治方向 = 镜像内嵌 agent（PID 1 常驻服务）**。

> ## ✅ 全部完成（2026-08——4 波落地 + 用户决策统一镜像）
> - **W1**：sandbox-agent（PID1 常驻入口）——SIGTERM 优雅关闭（杀子树→退出）
>   ——**docker stop 10s→0.24s 根治**（内核忽略 PID1 默认信号动作——知识性根因）
>   + Dockerfile ENTRYPOINT agent（入口完全可控）
> - **W2**：agent liveness 真实化（/healthz——框架 ensure 探活）+ 能力声明注入
>   AI（workspaceLayer 尾【沙盒环境能力】层——AI 知道环境有什么——省试错）
> - **W3**：**统一镜像全能力（用户决策）**——argv CLI 语义（docker run 镜像
>   <命令> 转发——统一镜像任意命令可用）+ 能力一致性契约（T-M1h——声明=实际）
>   ——多变体取消（一个镜像一张 Dockerfile 一构建——管理成本最小）
> - **W4**：测试加固——T-M1f（stop 秒级契约）/ T-M1g（健康/能力面）/ T-M1h
>   （能力一致性）
> - **终态**：test:docker 14/14 · 20.3s（基线 47.6s）· 默认套件 289/289 ·
>   双侧 tsc 0 —— stop 秒级 · 入口可控 · 能力声明可信（AI 零试错前提）

---

## 一、根因定案（本轮精确实验——数据完整）

| 实验 | 结果 | 结论 |
| --- | --- | --- |
| `docker stop`（sleep infinity 容器 ×3） | **稳定 10.1s** | 非偶发——信号没被处理 |
| 容器内 `ps` | **PID 1 = `sleep infinity`** | 裸进程（无信号 handler） |
| 宿主侧 `kill -TERM` 直达 PID 1 | **容器不退出**（Up 1 second） | **内核忽略 PID 1 默认信号动作**（sleep 无 handler——SIGTERM 被丢弃） |
| node 显式 `process.on('SIGTERM')` | **秒退** | **agent 化（显式 handler）根治方向确认** |

**知识**：Linux 内核**不向 PID 1 应用默认信号处理**（PID 1 遗漏 SIGTERM/SIGINT 的默认动作——**除非进程显式注册 handler**）——**裸 sleep/node（无 handler）作为 PID 1 → SIGTERM 被丢**——docker 等 10s 宽限 → SIGKILL。

**连带问题**（agent 化要解决的）：
- 无健康检查（现在无 liveness 端点——框架靠 docker inspect 猜）
- 无优雅关闭（exec 中的子进程树——SIGKILL 直接断——**孤儿/数据未刷**）
- 无能力自描述（镜像有什么工具——AI 不知道——靠模型猜）
- 状态不可观测（容器内 CPU/内存/进程——框架无内省面）

---

## 二、目标架构（agent 化——每个镜像一个 agent）

```
现状（被动执行协议）：
  docker exec -i 容器 node /opt/sandbox/tool-runner.js   ← 每次 exec 起新进程
  PID 1 = sleep infinity（docker run 的 CMD——无信号/无健康/无状态）

目标（镜像内嵌 agent——PID 1 常驻服务）：
  PID 1 = sandbox-agent（node agent——镜像内嵌——自管理）
    ├── 信号处理（SIGTERM/SIGINT → 优雅关闭子进程树 → 刷卷 → 退出）
    ├── 工具执行（接收命令 → 分发 → 超时 → 杀树——保持现有工具语义）
    ├── 健康检查（/healthz——框架 probe 升级为真实 liveness）
    ├── 能力自描述（/capabilities——镜像声明的工具清单——AI 可见）
    └── 状态内省（/stats——CPU/内存/进程——框架诊断面）
```

### 协议（agent 化——stdin 协议升级为 HTTP + keep stdin 兼容）
| 面 | 现状 | 升级 |
| --- | --- | --- |
| 工具执行 | stdin JSON → stdout JSON（每次 exec） | **POST /exec**（常驻——无进程启动开销——**并发串行队列在 agent 内**） |
| 信号 | 无 | **SIGTERM → 优雅关闭**（杀子树→exit 0——**stop 秒级**） |
| 健康 | docker inspect 猜 | **GET /healthz**（200 = 就绪——框架 probe 用） |
| 能力 | 无 | **GET /capabilities**（镜像声明——AI/tool-calling 可见） |
| 内省 | 无 | **GET /stats**（CPU/内存/进程——诊断） |

### 镜像变体（**用户决策 2026-08：统一镜像——所有镜像具备全部能力——方便管理**）
```
ap-sandbox:latest（唯一镜像——全能力）：
  通用工具（bash/file/python）+ office 库 + chromium/agent-browser
  能力声明：capabilities.json（单一实现源——镜像构建 + AI 注入 + 测试一致性同源）
  ——不建 office/browser 分体（管理成本 > 镜像体积收益——一个镜像一张 Dockerfile
  一个构建——统一升级统一保障）
```
（Wave 3 多镜像变体——**已取消**——用户决策：统一镜像全能力更易管理）

---

## 三、波次执行

### Wave 1 · entrypoint 可控化（最小——根治 stop 10s）
1. **自建 `sandbox-entry.sh`**（替换基镜像 docker-entrypoint.sh——exec node agent——`exec "$@"` 保留但**自管信号**）
2. **agent 内显式信号处理**：`process.on('SIGTERM')` → 杀活跃子进程树 → `process.exit(0)`（**实验已证秒退**）
3. Dockerfile.sandbox：`ENTRYPOINT ["sandbox-agent"]`（bash file 或 node 直接）
4. **验收**：`docker stop` 秒退（<1s）——T-M1b/M1d/M2a 再快（现在 23.7s → 目标 <15s）

### Wave 2 · agent 化服务（健康/能力/状态）
5. agent 加 **GET /healthz**（框架 probe 改用——不再 docker inspect 猜）
6. agent 加 **GET /capabilities**（镜像声明——AI 工具可见——**新能力**）
7. agent 加 **GET /stats**（诊断——sandbox debug 面增强）
8. **验收**：框架 liveness 真实化 + 能力面可见（新 AI 体验）

### Wave 3 · 统一镜像全能力（**用户决策——取代多变体**）
9. **任意命令 CLI 语义**：`docker run 镜像 <命令>` → agent argv 转发（统一镜像
   调试/运维直接 exec——非仅 stdin 协议）——sandbox-agent argv 分支
10. **能力一致性契约**：T-M1h（声明 vs 实际环境——防漂移——全能力声明必须
    真实存在：runtime/office/chromium/agent-browser）
11. **验收**：统一镜像全能力实测（argv 命令 + office 6 库 + 浏览器全在）·
    T-M1h 绿（能力声明零漂移）

### Wave 4 · 测试扩展（T-M 系列加固）
12. T-M1f：**信号处理**（SIGTERM → 优雅退出——stop 秒级断言）
13. T-M1g：**健康检查**（/healthz 200——框架 probe 一致性）
14. 现有 T-M 系列适配（工具执行改 POST /exec——**兼容 stdin 回退**）
15. **验收**：test:docker 全绿（<20s）——信号/健康契约锁定

---

## 四、测试纪律
- **兼容优先**：agent 化后**保留 stdin 协议回退**（旧 tool-runner 路径不删——**双路径**——rolling 升级安全）
- **不删语义**：T-M 系列真实容器行为——适配而非 mock
- **诚实裁剪**：
  - 多镜像变体（Wave 3）——**实验性**（构建时间/镜像体积成本——先做通用 agent——变体按需）
  - HTTP 协议 vs stdin——**保持 stdin 为主**（exec 简化）+ HTTP 为增强面（健康/能力只读）——**工具执行不强制 HTTP**（避免大改框架 exec 链）
- **每波收尾**：test:docker 绿 + 默认套件 286 无回归 + tsc 0

---

## 五、验收标准（计划完成定义）
1. **stop 秒级**：docker stop 沙盒容器 <2s（当前 10s——**根治**）
2. **入口可控**：自建 entrypoint（不依赖基镜像信号语义）——PID 1 = agent
3. **健康/能力面**：/healthz + /capabilities 可用（框架 probe 升级）
4. **零回归**：T-M 系列全绿 + 默认套件 286 + tsc 0
5. **测试加固**：信号处理/健康检查契约测试（T-M1f/M1g）
