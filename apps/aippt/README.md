# aippt — AI PPT 生成引擎

> **可部署 · 可编程 · 可批量 · 可证明** 的 AI PPT 生成引擎。
> 一句话 → AI 生成大纲 → 确认编辑 → 流式生成完整演示文稿 → 下载 .pptx。

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

1. **首页**：输入主题 / 页数 / 风格（5 主题）/ 受众 → 生成大纲（约 10s）
2. **大纲确认页**：编辑标题与要点、加删页、上移下移、切换版式 → 确认
3. **流式生成**：SSE 逐批进度（"生成中… 4/8 页"）→ 自动进入预览页
4. **预览页**：换主题（一键换肤）、单页 AI 重写（扩写/精简/换说法）、单页换版式
5. **下载**：.pptx 文件 / 浏览器打印导出 PDF
6. **历史**：「我的演示文稿」——重启不丢，可继续编辑草稿

## 测试

```bash
cd apps/aippt
npm test        # 55+ 测试：引擎 31 + 服务 14 + db 5 + 黄金文件 5 + 布局 5
```

测试覆盖：引擎（ZIP/XML/确定性/语法）、两步管线（大纲/分批/校验）、编辑（重写/换版式）、db CRUD、**黄金文件字节级回归**（5 主题 × 6 版式）。

## API 速览（编程接入）

| 端点 | 说明 |
|------|------|
| `POST /api/decks/outline` | 主题 → 大纲 |
| `POST /api/decks/:id/complete` | 编辑后大纲 → 完整 deck（SSE 流式） |
| `POST /api/decks/generate` | 一键生成（无大纲确认） |
| `POST /api/decks/generate-batch` | 批量生成（≤10 份） |
| `GET /api/decks` / `:id` / `:id/export` | 列表 / 查询 / 下载 .pptx |
| `PATCH /:id/theme` · `POST /:id/slides/:n/rewrite` · `relayout` | 编辑 |
| `DELETE /api/decks/:id` | 删除 |

完整契约见 [docs/API.md](./docs/API.md)。

## 架构

```
LLM ──► 语义 JSON（DeckData）──► validateDeck（硬守卫）──► 版式组件 ──► renderXml ──► zip ──► .pptx
        │
        └──► HTML 预览（前端 SlidePreview，与 PPTX 同源）
```

```
src/
├── ai/          DeepSeek 客户端（chat/stream/SSE 解析）
├── services/    outline.ts（两步管线编排）· edit.ts（重写/换版式）
├── pptx/        ★ 自研引擎：vnode / renderXml / zip / packager / theme / layout
│   ├── components/  primitives · widgets · layouts（6 版式，5 主题）
│   ├── template/    手写 OOXML 模板骨架（母版/版式/主题）
│   └── test/        31 测试 + golden（黄金文件回归）
├── db.ts         decks 表 CRUD（postgres，JSONB 存语义数据）
└── server.ts     API + SPA（端口 3001）
```

### 设计原则

- **JSON 为唯一事实源**：编辑 = 改 JSON，pptx 永远是导出产物
- **LLM 边界**：只产语义 JSON，`validateDeck` 硬守卫，绝不把脏数据喂给引擎
- **确定性输出**：同一输入 → 同一字节 → 黄金文件回归可证明
- **零第三方依赖的 PPTX 引擎**：CRC32/ZIP/OOXML 全部自研，可测试、可控制

## 计划与进度

见 [PLAN.md](./PLAN.md)（v0.2 完成：两步管线/SSE/大纲页/预览编辑/持久化/批量/黄金文件/PDF；T9 docker 待验证）与 [IDEA.md](./IDEA.md)（产品定位）。
