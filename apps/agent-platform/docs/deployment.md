# agent-platform 私有化部署与运维（R7 交付链）

> 交付包三件套：**部署（Compose 一键）→ 升级（脚本 + 备份）→ 运维（健康/告警/备份）**。

## 1. 部署（docker compose 一键）

```bash
# 1. 准备环境变量（必配 4 项 + 商业化按需）
cp .env.example .env
vim .env   # DATABASE_URL/JWT_SECRET/DEEPSEEK_API_KEY 必填；ADMIN_EMAILS/LICENSE_*/OIDC_* 按需

# 2. 一键启动（postgres + redis + app 三容器）
docker compose up -d --build

# 3. 验证
curl http://localhost:3000/healthz      # {"status":"ok","deps":{"pg":true,"redis":true,...}}
docker compose logs -f app              # 看启动日志
```

**数据卷**（升级/迁移不丢）：
- `pg-data`：数据库（唯一真相源）
- `redis-data`：缓存/广播（可重建）
- `workspace-data`：AI 工作空间文件

## 2. 升级（脚本 + 备份 + 回滚）

```bash
# 升级 = 拉新代码 → 一键脚本（自动备份 → 重建 → 健康校验）
git pull                          # 或更新镜像
node scripts/upgrade.mjs --backup-dir /data/backups
```

脚本流程：`pg_dump` 备份 → `docker compose up -d --build` → 轮询 `/healthz`（120s 超时）→
成功打印备份路径 / 失败打印回滚指引（`pg_restore` + 旧镜像回退）。

## 3. 运维

### 健康检查（告警接入）

`GET /healthz` 返回：`status / uptimeSec / deps{pg,redis,sandbox} / disk{freePercent} / version / ts`

**告警接入（推荐 cron + 邮件/webhook）**：

```bash
# 每 5 分钟探活，失败发邮件（对接 SMTP/RESEND 或任意 webhook）
*/5 * * * * curl -fsS http://localhost:3000/healthz || \
  curl -s -X POST http://your-alert-endpoint -d '{"subject":"agent-platform 健康告警","text":"healthz 失败"}'
```

**阈值建议**：
| 指标 | 告警阈值 |
|------|---------|
| healthz 503 | 立即 |
| disk.freePercent < 10% | 警告（工作空间卷增长） |
| sandbox.poolSize = maxContainers | 提示（容量） |
| deps.redis = false | 立即（WS 广播降级） |

### 备份 / 恢复

```bash
# 手动备份（每日 cron 建议）
./scripts/backup.sh
# 恢复
./scripts/restore.sh <备份文件>
```

### 沙盒（可选组件）

- 生产建议：沙盒与主服务同机（docker.sock 挂载）或独立沙盒节点
- 安全基线：见 [docs/sandbox-threat-model.md](docs/sandbox-threat-model.md)（`--cap-drop ALL`/no-new-privileges 已默认）
- 高安全：`SANDBOX_RUNTIME=runsc`（gVisor）+ 每租户配额（登记待做）

### 升级检查清单（发布前）

1. `node --env-file=.env test/*.test.ts` 全绿
2. migration 幂等（CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS——重复执行安全）
3. seed 可选重跑（仅演示环境）
4. 升级脚本 dry-run 确认备份路径可写

## 4. 环境变量总表（生产必读）

| 变量 | 必填 | 说明 |
|------|------|------|
| DATABASE_URL | ✅ | postgres://user:pass@host:5432/db |
| JWT_SECRET | ✅ | ≥32 字符随机串（泄漏 = 会话伪造） |
| DEEPSEEK_API_KEY | ✅ | 对话模型 |
| DASHSCOPE_API_KEY | 条件 | 知识库 embedding |
| REDIS_URL | 建议 | 多实例 WS 广播 |
| ADMIN_EMAILS | 商业化 | 平台管理员（逗号分隔） |
| LICENSE_KEY / LICENSE_TO | 私有化 | 授权标识/到期日 |
| WHITE_LABEL_* | 私有化 | 品牌名/logo/主色 |
| OIDC_* | 按需 | 企业 SSO |
| MANAGEMENT_API_KEY | 按需 | 管理 API |
| SMTP_* / RESEND_API_KEY | 按需 | 审批邮件通知 |
| PUBLIC_BASE_URL | 建议 | 邮件/回调中的外网地址 |
