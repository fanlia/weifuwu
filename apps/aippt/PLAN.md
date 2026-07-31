# aippt 开发计划（v0.2 → v1.0）

> 状态：v0.1 已完成（引擎 + 组件 + 主流程 + 31 测试，见 IDEA.md）
> 原则：每个里程碑独立可用；LLM 边界（语义 JSON + validateDeck）只扩不破；测试先行。

---

## v0.2 — 「从能生成到好用」（产品体验分水岭）

**目标**：大纲先行交互 + 流式进度 + 编辑能力 + 持久化，让产品真正可用。

### T1 两步生成管线（大纲 → 内容）⭐ 最高优先
| 项 | 内容 |
|----|------|
| 后端 | `POST /api/decks/outline` `{topic, pages, style, audience}` → `{id, outline}`（LLM 只产每页标题+要点摘要） |
| 后端 | `POST /api/decks/:id/complete` `{slides: 编辑后大纲}` → 逐页/分批生成正文 → `{id, deck}` |
| 后端 | 保留 `POST /api/decks/generate` 一键路径（快速体验） |
| 验收 | outline 与 deck 均可 mock 测试；编辑后大纲能约束最终版式顺序 |

### T2 SSE 流式进度
| 项 | 内容 |
|----|------|
| 后端 | `GET /api/decks/:id/stream` SSE 事件：`{type:'outline-done'}` / `{type:'slide', index, slide}` / `{type:'done', deck}` |
| 后端 | 分段生成：outline 一次 + 正文每 2-3 页一批（降低超时风险） |
| 前端 | 生成页：ProgressBar/Steps 展示「大纲 → 第 n/m 页」，逐页出现 |
| 验收 | 浏览器可见逐页进度；断流可重试；SSE 有 mock 测试 |

### T3 大纲确认页（前端）
| 项 | 内容 |
|----|------|
| 页面 | 大纲列表：每页标题 + 要点摘要，行内编辑 |
| 操作 | 加页 / 删页 / 上移下移 / 重新生成大纲 |
| 交互 | 确认 → 调 complete → 进预览页 |
| 验收 | 编辑后生成结果反映修改（标题/顺序/数量一致） |

### T4 预览页编辑能力
| 项 | 内容 |
|----|------|
| 换主题 | 一键切换 5 套主题，立即重新渲染（JSON 不变，只换 token） |
| 单页重写 | 「AI 重写本页」（换说法/扩写/精简） |
| 换版式 | 该页在 bullets/twoColumn/data 间切换（数据映射尽量保留） |
| 验收 | 编辑只改 JSON，pptx 重新导出即反映变更 |

### T5 postgres 持久化 + 历史
| 项 | 内容 |
|----|------|
| schema | `decks` 表：id, title, theme, outline_json, deck_json, status, created_at, updated_at（复用框架 postgres 中间件） |
| API | `GET /api/decks`（列表）/ `DELETE /api/decks/:id` / 恢复继续编辑 |
| 前端 | 「我的演示文稿」历史页（卡片墙：标题/页数/时间/继续编辑） |
| 验收 | 刷新/重启不丢；历史可恢复编辑并重新导出 |

### v0.2 测试目标
两步管线 mock 测试、SSE 解析测试、编辑 API 测试、持久化 round-trip 测试；浏览器端到端回归（大纲页 → 生成 → 预览 → 下载）。

---

## v0.3 — 定位落地（可批量 / 可证明 / 可部署）

**目标**：把「基础设施」定位变成可交付形态。

### T6 黄金文件测试（可证明）
| 项 | 内容 |
|----|------|
| 脚本 | 固化 5 主题 × 6 版式输出为 `test/golden/*.pptx`（人工 LibreOffice 验证过一次） |
| 测试 | CI 字节级比对 `deckToPptx(fixture) === golden`，改版式即暴露 diff |
| 验收 | 黄金文件测试进入 `npm test`，回归防线成型 |

### T7 稳定 API + 批量接口（可编程/可批量）
| 项 | 内容 |
|----|------|
| 契约 | API 文档（请求/响应 JSON 契约 + 错误码），作为 SDK 边界 |
| 批量 | `POST /api/decks/generate-batch`（数组，串行/限制并发）或队列 |
| 验收 | curl 可编程调用；批量 5 份 deck 全成功 |

### T8 PDF 导出
| 项 | 内容 |
|----|------|
| 方案 | 前端 print CSS（预览页打印为 PDF，零后端依赖）——先做；服务端 LibreOffice 后置 |
| 验收 | 浏览器打印导出 PDF 版式正确 |

### T9 docker 私有化打包（可部署）⚠️ 已跳过（部署验证待后续）
| 项 | 内容 |
|----|------|
| 交付 | Dockerfile（服务）+ docker-compose（+ postgres）+ 启动脚本 |
| 状态 | 代码已就绪（Dockerfile/docker-compose/.dockerignore），镜像构建验证**跳过**，待后续环境就绪时执行 |
| 验收 | `docker compose up` 一键起服务，生成可用 |

### T10 用户系统（复用 agent-platform auth）
| 项 | 内容 |
|----|------|
| 后端 | 复制 auth 中间件 + users 表 + 注册/登录 API |
| 前端 | 登录/注册页 + 路由守卫 |
| 验收 | 未登录不可生成；decks 归属用户 |

---

## v1.0 — 定位扩展

- **从文档生成**：粘贴 markdown/纯文本 → LLM 提炼大纲（复用 outline 管线）
- **品牌模板**：企业主题自定义 API（品牌色/字体/logo 位写入版式组件）
- **分享链接**：只读预览页（无登录可看）
- **模板市场**：预设 deck 模板库（大纲骨架 + 主题组合）

---

## 依赖关系

```
T1 outline API ──► T2 SSE（依赖分段生成）──► T3 大纲页（依赖 T1）
                                    └──► T4 预览编辑（依赖 deck API）
T5 postgres ──► T10 用户系统（依赖 T5 schema）
T6 黄金文件（独立，可并行）   T7 批量 API（依赖 T1 稳定契约）
T8/T9 独立可并行
```

## 执行顺序建议

```
Sprint 1: ✅ T1 + T2（两步管线 + SSE，后端骨架）
Sprint 2: ✅ T3 + T4（大纲页 + 预览编辑，前端主战场）
Sprint 3: ✅ T5（持久化 + 历史）
Sprint 4: ✅ T6 + T7（黄金文件 + 批量 API）   ← 定位落地
Sprint 5: ✅ T8 PDF 导出（print CSS）+ ⚠️ T9 docker 已跳过（代码就绪待验证）
Sprint 6: T10（用户系统）⏳ 待定（按需）
```

---

## v0.3 — 从「可用的单机产品」到「可交付的私有化基础设施」

**目标**：扩大输入与场景覆盖（文档生成/模板），兑现定位场景 1（品牌模板），补 docker 验收。
**明确不做**：T10 用户系统（与私有化定位张力，出现明确多用户需求再做）。

### Sprint 1: 从文档生成 ⭐
| 项 | 内容 |
|----|------|
| 后端 | `POST /api/decks/outline-from-doc` `{content}` → LLM 提炼大纲（复用 generateOutline 管线，prompt 变体：文档要点 → 大纲） |
| 前端 | 创建页输入方式切换：一句话 vs 粘贴文档（大 textarea + 字数提示） |
| 验收 | 粘贴 500-2000 字文档 → 大纲质量可用；超长截断保护；mock 测试 |

### Sprint 2: 大纲模板与预设模板库
| 项 | 内容 |
|----|------|
| 后端 | 模板定义（JSON 大纲骨架）：market-analysis / product-launch / teaching / weekly-report / roadmap |
| 后端 | `GET /api/templates`；模板 → outline 时注入 prompt（骨架 + 主题） |
| 前端 | 创建页模板选择卡片（点击填充主题/页数/风格预设） |
| 验收 | 选模板后生成的大纲遵循模板结构（章节布局匹配）；mock 测试 |

### Sprint 3: 品牌模板（定位场景 1 兑现）
| 项 | 内容 |
|----|------|
| 引擎 | 新增 image 元素（p:pic）支持 —— logo 位基础 |
| 后端 | 自定义主题 API：`POST /api/themes/custom` `{name, colors}` → 存 DB，decks.theme 可引用自定义主题 |
| 后端 | `GET /api/themes`（预设 + 自定义列表） |
| 前端 | 主题选择器加「自定义」入口（色板编辑 + logo 上传） |
| 验收 | 自定义主题生成 pptx 全页生效（含 logo 出现在固定位置）；黄金文件不受影响（fixture 用预设主题） |

### Sprint 4: 分享链接（只读预览）
| 项 | 内容 |
|----|------|
| 后端 | decks 表加 `share_token`；`POST /api/decks/:id/share` 生成 token；`GET /share/:token` 只读视图 |
| 前端 | 预览页「复制分享链接」按钮；/share/:token 渲染只读预览（无编辑/无导出下载按钮可保留下载） |
| 验收 | 无登录直接打开分享链接可看；撤销分享（DELETE share） |

### ✅ v0.3 全部完成：文档生成 / 模板库 / 品牌模板 / 分享链接

### 收尾（v0.3 最后一个动作）
| 项 | 内容 |
|----|------|
| 交付 | README 更新 + PLAN/IDEA 进度 + 端到端回归 |
| 部署 | docker 部署**暂不列入计划**（T9 保持跳过标记，环境/需求明确后再评估） |

### 依赖关系
```
Sprint 1 文档生成（独立）→ 依赖 outline 管线（已有）
Sprint 2 模板库（独立，复用 outline）
Sprint 3 品牌模板（依赖引擎 image 元素 + theme 扩展）
Sprint 4 分享（依赖 decks 表扩展）
```

### 风险
| 风险 | 对策 |
|------|------|
| 文档输入长/乱 | 截断保护 + 提示词引导提炼要点；LLM 输出仍走 validateOutline 守卫 |
| 自定义主题与预设主题并存复杂度 | 统一 Theme 结构（id 允许自定义），引擎无感 |
| image 元素兼容性 | 复用模板骨架的 p:pic 结构 + 黄金文件不覆盖自定义主题 + LibreOffice 验证 |
| share token 泄露 | 随机 token + 可撤销 + 只读（无编辑 API） |

## 风险

| 风险 | 对策 |
|------|------|
| 两步生成内容一致性（大纲→正文跑偏） | prompt 里注入确认后的大纲作为约束 + 单页重写兜底 |
| SSE 在 weifuwu 后端的实现方式 | 用标准 Response 流（`ReadableStream`），框架 serve 需验证 |
| 编辑能力边界（复杂改动做不了） | 只承诺「结构编辑」（文本/版式/主题），像素级编辑明确不做 |
| postgres schema 演进 | decks 表 + JSONB 字段（outline_json/deck_json），避免列爆炸 |
| 黄金文件脆（任何版式改动都要重生成） | 生成脚本一键重建 + 人工 LibreOffice 验证后提交 |
