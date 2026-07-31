# aippt — AI PPT 生成引擎

> **可部署 · 可编程 · 可批量 · 可证明** 的 AI PPT 生成引擎。
> 一句话或一份文档 → 大纲确认 → 流式生成 → 编辑/品牌化 → 下载或分享。

基于 **weifuwu** 框架构建，自研 **pptx-vdom 引擎**（零第三方依赖）渲染 OOXML。

---

## 快速开始

```bash
# 前置：postgres（仓库根 docker compose up -d postgres）
cd apps/aippt
node --env-file=../../.env server.ts
# → http://localhost:3001
```

`../../.env` 需包含：
```
DATABASE_URL=postgres://root:123456@localhost:5432/demo
DEEPSEEK_API_KEY=sk-xxx          # DeepSeek Chat（必需）
```

## 使用流程

1. **创建**：一句话生成 或 **从文档生成**（粘贴报告/方案/讲义，50-4000 字）；可选 **模板**（市场分析/产品发布/教学课件/周报/路线图——决定大纲结构）
2. **大纲确认页**：编辑标题与要点、加删页、上移下移、切换版式 → 确认
3. **流式生成**：SSE 逐批进度 → 自动进入预览页
4. **预览页**：
   - 换主题（5 预设一键换肤）
   - **品牌模板**：`＋` 自定义品牌（色板 + logo，每页右上角注入）
   - 单页 AI 重写（扩写/精简/换说法）、单页换版式
5. **输出**：下载 .pptx / 导出 PDF / **分享链接**（只读预览，可撤销）
6. **历史**：「我的演示文稿」——重启不丢，草稿可继续编辑

## 测试

```bash
cd apps/aippt
npm test        # 64+ 测试：引擎 / 两步管线 / 编辑 / db / 黄金文件字节级回归
```

## API 速览（编程接入）

| 端点 | 说明 |
|------|------|
| `POST /api/decks/outline` | 主题 → 大纲（可带 `template`） |
| `POST /api/decks/outline-from-doc` | 文档 → 大纲 |
| `POST /api/decks/:id/complete` | 编辑后大纲 → 完整 deck（SSE 流式） |
| `POST /api/decks/generate` / `generate-batch` | 一键 / 批量生成 |
| `GET /api/decks` / `:id` / `:id/export` | 列表 / 查询 / 下载 .pptx |
| `GET /api/templates` | 预设模板列表 |
| `GET /api/themes` · `POST /api/themes/custom` | 主题列表 / 自定义品牌主题 |
| `POST|DELETE /:id/share` · `GET /api/share/:token` | 分享 / 撤销 / 只读访问 |
| `PATCH /:id/theme` · `POST /:id/slides/:n/rewrite` · `relayout` | 编辑 |
| `DELETE /api/decks/:id` | 删除 |

完整契约见 [docs/API.md](./docs/API.md)。

## 架构

```
LLM ──► 语义 JSON（DeckData）──► validateDeck（硬守卫）──► 版式组件 ──► renderXml ──► zip ──► .pptx
        │                                            （可选 logo 注入）
        └──► HTML 预览（前端 SlidePreview，与 PPTX 同源）
```

```
src/
├── ai/          DeepSeek 客户端（chat/stream/SSE 解析，全链路 JSON mode）
├── services/    outline.ts（两步管线 + 文档生成）· edit.ts（重写/换版式）· templates.ts
├── pptx/        ★ 自研引擎：vnode / renderXml（含 image）/ zip / packager / theme / layout
│   ├── components/  primitives · widgets · layouts（6 版式，5 预设主题 + 自定义）
│   ├── template/    手写 OOXML 模板骨架
│   └── test/        引擎测试 + golden（黄金文件字节级回归）
├── db.ts         decks / themes 表 CRUD（JSONB 语义数据）
└── server.ts     API + SPA（端口 3001）
```

### 设计原则

- **JSON 为唯一事实源**：编辑 = 改 JSON，pptx 永远是导出产物
- **LLM 边界**：只产语义 JSON（JSON mode + 强 schema + validateDeck 三层守卫）
- **确定性输出**：同一输入 → 同一字节 → 黄金文件回归可证明
- **零第三方依赖的 PPTX 引擎**：CRC32/ZIP/OOXML/图片全部自研

## 计划与进度

见 [PLAN.md](./PLAN.md)（v0.2 ✅ / v0.3 Sprint 1-4 ✅：文档生成、模板库、品牌模板、分享链接）与 [IDEA.md](./IDEA.md)（产品定位）。
