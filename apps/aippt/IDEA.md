# aippt — AI PPT 生成引擎

> 定位：**「PPT 生成基础设施」——可部署、可编程、可批量、可证明的 AI PPT 引擎**，而不是又一个 AI PPT SaaS。

---

## 产品定位

### 一句话

> 把 PPT 生成变成你的基础设施：**可部署**（私有化）、**可编程**（API/SDK）、**可批量**（管线化）、**可证明**（确定性输出 + 质量测试矩阵）。

### 与云 SaaS 的本质区别

| 他们（Gamma/讯飞智文等） | 我们 |
|--------------------------|------|
| 部署在别人服务器 | 可私有化部署，数据不出网 |
| 封闭产品，交互式 | API/SDK，可嵌入现有系统 |
| 一次一单，面向单人 | 批量、定时任务、CI 管线 |
| 输出黑盒，不可回归 | 确定性输出，质量可证明 |

### 目标用户（按优先级）

1. **技术型团队** — API 调用、批量生成、私有部署（v0.1 验证对象）
2. **企业内部数字化部门** — 品牌模板 + 数据打通 + 合规（商业模式对象）
3. **预算敏感的批量用户** — 培训课件、新媒体矩阵、高频迭代 deck
4. **自部署爱好者** — docker 一键部署，开源可审计

### 核心场景

```
场景 1（v0.1 验证）：数据/内容 → 品牌模板 PPT 管线化生成
  内部系统(BI/CRM) → API → 语义 JSON → 品牌版式组件 → .pptx（定时/CI/批量）
场景 2：第三方产品内嵌（PPT as a Service）
场景 3：个人/团队自部署 AI PPT（开源流量入口）
```

### 边界（明确不做）

- ❌ 消费级个人 PPT 工具（动画/协作/分享/模板市场）
- ❌ 像素级自由编辑画布
- ❌ 多租户 SaaS 平台
- ❌ 移动端
- ❌ 自研 LLM（用现成 API：DeepSeek 等）

### 商业模式（开源核心 + 企业服务）

```
开源：引擎 + 框架 + 基础版式组件库 → 建立开发者信任与社区
企业版：私有化部署支持 + 品牌版式定制 + 数据对接集成 + SLA
```

---

## 基本概念

### deck（演示文稿）

- 一次生成的完整 PPT，包含 slides、theme、元信息
- 事实源是**语义 JSON**，.pptx 永远是导出产物

### slide（幻灯片）

- deck 中的一页，由版式组件 + 语义数据构成
- 尺寸固定 13.333 × 7.5 英寸（16:9）

### 语义 JSON（Semantic JSON）

- LLM 的唯一产出物，也是存储与编辑的事实源
- 例：`{ layout: 'bullet', title: '核心观点', points: [...] }`
- LLM 永远接触不到引擎与组件树——质量在工程资产手里

### 版式（Layout）

- 一页的结构骨架，是**代码组件**（不是数据）
- 分三层：primitives（原子）→ layouts（版式）→ widgets（业务组件）
- 品牌模板 = 用代码精确实现品牌规范（色值/字体/logo 位），不是换皮

### 主题（Theme）

- token 集合：配色 / 字体（含中文 ea 字体）/ 间距 / 版式参数
- 换肤 = 换 token，不碰组件与 XML

### 组件（Component）

- 纯函数：`(initProps) => (props) => VNode`，与 weifuwu 组件模型一致但不依赖 client
- 输出确定、可测试、可复用

### 生成管线（Pipeline）

```
LLM → 语义 JSON → validateDeck() → 语义→版式组件映射 → pptx-vdom 组件树
     → renderXml() → slide XML → packager() → .pptx
```

除 LLM 外全部是纯函数：确定性输出，可字节级回归。

---

## 技术方案

### 核心引擎：pptx-vdom（零外部依赖）✅ v0.1 已实现

```
src/pptx/
├── vnode.ts          ✅ PPTX VNode 类型 + h() + 组件模型
├── renderXml.ts      ✅ VNode → slide XML（纯函数/确定性/顺序/转义/中文字体）
├── layout.ts         ✅ Stack/Grid 相对布局 → 绝对坐标（英寸）
├── theme.ts          ✅ 5 套主题 token（配色/字体）
├── zip.ts            ✅ ZIP writer（CRC32 + deflate，确定性）
├── packager.ts       ✅ slide XML → 完整 .pptx（模板骨架 + rels + content-types）
├── template/         ✅ 14 个手写静态 XML（母版/版式/主题）
├── components/
│   ├── primitives.ts ✅ Text/Heading/Pill/HLine/Bullets/Rect/Footer
│   ├── widgets.ts    ✅ StatCard/QuoteCard/Timeline/FeatureGrid
│   ├── layouts.ts    ✅ Cover/Section/Bullets/TwoColumn/Data/Thanks + validateDeck
│   └── index.ts
└── test/             ✅ 26 个测试（ZIP 回读/XML 断言/确定性/语法合法/版式）
```

### 关键机制

- **模板骨架策略**：slideMasters/slideLayouts/theme 来自验证过的真实文件，运行时只生成 slideN.xml + 更新 rels/content-types
- **确定性**：`VNode → string` 纯函数，同一输入同一字节 → 黄金文件字节级比对
- **质量三层防线**：引擎 schema 校验 → 组件黄金文件/快照 → 集成兼容性矩阵

### 质量保证体系

```
1. 引擎层：渲染前 schema 校验（必填 props/坐标范围/OOXML 元素顺序）→ 结构上不可能错
2. 组件层：黄金文件测试（版式×主题，字节级回归）+ 快照测试
3. 集成层：ZIP 回读、XML well-formed、兼容性矩阵（PowerPoint/WPS/LibreOffice）
```

---

## 功能规划

### P0 核心闭环
一句话/详细输入 + 风格/页数 → 大纲确认（编辑/增删/重排/重生成）→ 流式生成+进度 → HTML 预览 → 下载 .pptx

### P1 产品化
预览编辑（改文本/换版式/一键换肤/AI 单页重写）、用户系统、历史列表（decks 表）、PDF 导出（print CSS）

### P2 差异化
从文档生成、分享链接、演讲备注、图表生成、模板市场、用量配额与统计

---

## 迭代路线

```
v0.1  ✅ 引擎最小闭环（vnode + renderXml + zip + packager）
     ✅ 组件层（primitives/widgets/layouts + 5 主题）
     ✅ 语义 JSON 契约 + validateDeck（LLM 守卫）
     ✅ 主流程打通（server.ts + DeepSeek + 前端 SPA）
     ✅ v0.2: 两步管线 + SSE + 大纲页 + 预览编辑 + 持久化 + 批量 + 黄金文件 + PDF
     ✅ 31 测试 + LibreOffice 兼容性验证 + 浏览器端到端验证
     ⏳ 内存存储 → postgres（v0.3）
v0.2  编辑 + 单页重写 + SSE 进度 + widgets 扩充 + API/批量接口 + 品牌模板
v0.3  用户系统 + 历史 + docker 私有化打包
v1.0  从文档生成 + PDF 导出 + 分享链接 + 模板市场
```

---

## 风险与对策

| 风险 | 对策 |
|------|------|
| OOXML 元素顺序/兼容性 | 模板骨架 + 顺序校验器 + 兼容性矩阵 |
| 中文排版 | `a:ea` 字体注入集中处理 |
| LLM JSON 不稳定 | 严格 schema + 重试 + 剥代码块 |
| 组件纪律（DOM 能力混入） | 类型系统约束 + 引擎对未知标签抛错 |
| DeepSeek 超时 | 页数上限 + 分段生成 + 重试 |
