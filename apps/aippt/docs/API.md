# aippt API 契约 v1

> 编程接入边界（SDK 化）。全部端点返回 JSON；错误统一 `{ "error": string }`。
> 语义 JSON 结构见 `src/pptx/components/layouts.ts` 的 `DeckData` / `SlideData`。

## 端点总览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/decks/outline` | 阶段 1：主题 → 大纲 |
| POST | `/api/decks/:id/complete` | 阶段 2：编辑后大纲 → 完整 deck（SSE 流式） |
| POST | `/api/decks/generate` | 一键生成（无大纲确认） |
| POST | `/api/decks/generate-batch` | 批量生成（≤10 份，串行） |
| GET | `/api/decks` | 历史列表 |
| GET | `/api/decks/:id` | 查询（outline 或 deck） |
| GET | `/api/decks/:id/export` | 下载 .pptx |
| PATCH | `/api/decks/:id/theme` | 换主题 |
| POST | `/api/decks/:id/slides/:n/rewrite` | AI 重写单页 |
| POST | `/api/decks/:id/slides/:n/relayout` | AI 单页换版式 |
| DELETE | `/api/decks/:id` | 删除 |
| GET | `/api/health` | 健康检查 |

## 请求 / 响应

### POST /api/decks/outline
```jsonc
// 请求
{ "topic": "AI 技术趋势", "pages": 8, "style": "tech", "audience": "投资人" }
// 响应 200
{ "id": "dms...", "outline": { "title": "...", "theme": "tech", "slides": [ { "layout": "bullets", "title": "...", "points": ["摘要"] } ] } }
```

### POST /api/decks/:id/complete（SSE 流）
```jsonc
// 请求：编辑后的大纲 slides（OutlineItem[]，与 outline 阶段同构）
{ "slides": [ { "layout": "bullets", "title": "要点页", "points": ["a", "b"] } ] }

// 响应：text/event-stream，逐事件：
event: slide     data: { "index": 2, "total": 8, "slides": [SlideData] }   // 每批进度
event: done      data: { "id": "dms...", "deck": DeckData }                // 完成
event: error     data: { "message": "..." }
```

### POST /api/decks/generate（一键）
```jsonc
{ "topic": "..." } → 200 { "id": "dms...", "deck": DeckData }
```

### POST /api/decks/generate-batch（批量）
```jsonc
// 请求
{ "items": [ { "topic": "A", "pages": 6 }, { "topic": "B", "style": "tech" } ] }
// 响应 200（每份独立状态，单份失败不影响其他）
{ "results": [
    { "index": 0, "status": "ok", "id": "dms...", "title": "A", "slides": 6 },
    { "index": 1, "status": "error", "error": "..." }
] }
```

### GET /api/decks
```jsonc
200 { "decks": [ { "id", "title", "theme", "status": "outline|ready", "slides": 6, "createdAt": "ISO" } ] }
```

### GET /api/decks/:id
```jsonc
// status='ready'
200 { "deck": DeckData, "status": "ready" }
// status='outline'
200 { "outline": Outline, "status": "outline" }
```

### GET /api/decks/:id/export
```
200 application/vnd.openxmlformats-officedocument.presentationml.presentation
Content-Disposition: attachment; filename*=UTF-8''xxx.pptx
```

### 编辑端点
```jsonc
// PATCH /api/decks/:id/theme
{ "theme": "tech" } → 200 { "deck": DeckData }

// POST /api/decks/:id/slides/:n/rewrite（n 从 1 起）
{ "mode": "expand" | "condense" | "rephrase" } → 200 { "slide": SlideData }

// POST /api/decks/:id/slides/:n/relayout
{ "layout": "bullets" | "twoColumn" | "data" } → 200 { "slide": SlideData }
```

## 错误码

| 状态 | 场景 |
|------|------|
| 400 | 参数缺失/非法（topic 为空、mode/layout 非法、items 超限） |
| 404 | deck/大纲/页面不存在 |
| 502 | LLM 生成失败（含重试后） |
| 500 | AI 客户端未配置 / DB 异常 |

## 语义 JSON 结构

```ts
type SlideData =
  | { layout: 'cover'; title: string; subtitle?: string; meta?: string }
  | { layout: 'section'; number: number; title: string; subtitle?: string }
  | { layout: 'bullets'; title: string; points: string[] }
  | { layout: 'twoColumn'; title: string; leftTitle: string; leftPoints: string[]; rightTitle: string; rightPoints: string[] }
  | { layout: 'data'; title: string; stats: { label: string; value: string; delta?: string }[] }
  | { layout: 'thanks'; title: string; subtitle?: string }

type DeckData = { title?: string; theme: 'corporate'|'minimal'|'tech'|'academic'|'vibrant'; slides: SlideData[] }
```

主题：`corporate`（商务）/ `minimal`（极简）/ `tech`（科技）/ `academic`（学术）/ `vibrant`（活力）。
