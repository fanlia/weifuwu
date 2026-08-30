# SHOWCASE-COMPONENTS-ONLY-PLAN —— showcase 只留组件目录（2027-XX）

> 目标：打开 showcase = 组件目录——160 组件一页平铺、字母升序、顶栏搜索即筛；
> 点进详情 = 活体 demo + 用法。**无 layout 域、无分类层、无死表。**
> 用户路径：落地即目录 → 搜索/扫读 → 详情 → 复制 import 用起来。

## 0. 现状对账（2027-XX 实测）

- 路由：`/`(hero) · `/components`(分类网格) · `/components/:category` · `/components/:category/:id` · `/layout`
- registry：components 160 条（category 字段 ×12 分类）+ primitives 20 族 + **7 张死表**
  （patterns/apps/backend/capabilities/guides/needs/cases/community——页面已删、只剩 index.json 空转）
- 消费端：129 个 `comp-*.test.ts` 硬编码 `COMP_PATH='/components/<cat>/<id>'`；
  `scripts/audit-showcase-dev.mjs` 拼 category 路径 + `--cat` 过滤
- 死链：详情页 FamilyTag → `/guides/*`（路由不存在）
- 不受影响：`DEMOS` 按组件名索引（与分类无关）；`comp-layout.test.ts` 测的是 Layout **组件**（保留）

## 1. 目标路由表

| 路由 | 内容 | 变化 |
|---|---|---|
| `/` | ComponentsIndex——A→Z 平铺 + 搜索（**组件即首页**） | 改 |
| `/components` | 同 ComponentsIndex（别名——旧链接保留） | 保留 |
| `/components/:id` | ComponentPage 详情（活体 demo） | 改：去 category 中段 |
| `/components/:category/:id` | legacy 兼容——pageWithParams params 里 `id` 已存在，原行不动即为兜底 | 零成本 |
| `/layout` · `/components/:category` | 删除（404 壳兜底——导航可用） | 删 |

## 2. P1 页面层重构（一次 commit）

1. `src/app-router.ts`：`/` → ComponentsIndex；删 `/layout` 路由 + LayoutIndex/Home import；
   新增 `/components/:id`；保留 3 段式 legacy 行。
2. `src/pages/home.tsx`、`src/pages/domains.tsx`：删除。
3. `src/pages/components.tsx`：
   - 删 `CATEGORIES` 常量、分类网格、`CategoryPage`；
   - ComponentsIndex 全量 `sort((a,b)=>a.name.localeCompare(b.name))`，卡片 href `/components/${c.id}`，
     删卡片 `· {c.category}`；搜索保留（name/desc/family 维度）；
   - ComponentPage breadcrumb 两段化（`组件 › Name`）；变体链接 `/components/${v.id}`；
     **FamilyTag 改非链接 span**（/guides/* 死链歼灭）；
   - （可选 polish）详情页标题下加一行 `import { X } from 'weifuwu/components'`（mono）——"快速使用"。
4. `src/shell.tsx`：DOMAINS 只留 components 项；footer 文案去"页面/应用/后端/能力/指南"。
5. `src/server.ts`：SSR 路由表同步（删 `/layout`、加 `/components/:id`）；头注释同步。

## 3. P2 数据层歼灭（一次 commit——零消费字段不供养）

1. 删 registry 死表 8 文件：`primitives.ts` + patterns/apps/backend/capabilities/guides/needs/cases/community。
2. `src/registry/types.ts`：删 `CategoryId`/`category`/`PrimitiveFamily`/七表接口/`Registry` 收缩。
3. `src/registry/components.ts`：逐条删 `"category": "x",`（160 条——每条独占一行，正则批改 + 计数对账）。
4. `src/registry/index-json.ts`：删七表 import/字段/反链推导（usedInPatterns/usedInApps/relatedBackend
   消费点只剩已死的 CategoryPage）/counts 收缩为 `components`；头注释同步。
5. `src/data.ts`：IndexJson/EMPTY_INDEX 同步收缩（保留 components 全字段 + counts.components）。
6. 保留：`tags.ts`（详情页标签）、`family` 字段（搜索 + 家族标签）、`variantOf` 链（v2 别名页）。

## 4. P3 消费端同步（一次 commit）

1. **129 个 comp-*.test.ts** 批改（R-03 纪律——闭集枚举，禁宽泛通配）：
   `sed -E "s|/components/(core|input|form|display|viz|feedback|navigation|overlay|advanced|virtual|editor|ai)/|/components/|g"`
   ——注释头与 COMP_PATH 一 regex 覆盖；替换前后 grep 计数对账（129 文件 / 129 处）。
2. `scripts/audit-showcase-dev.mjs`：path → `/components/${c.id}`；删 `--cat` 过滤段（`--ids` 保留）。

## 5. P4 验证（每步全绿才进下一步）

1. typecheck（apps/showcase tsconfig 覆盖面确认）。
2. 手动冒烟（spawn server + curl）：
   - `/` 与 `/components`：含搜索框 + 组件计数 160 + 首卡片字母序正确；
   - `/components/button` 200 + 活体 demo；`/components/core/button` 200（legacy）；
   - `/layout` → 404 壳；`/index.json` 无 primitives/patterns 等字段。
3. `npm run test:showcase`（129 文件全绿 ~2.5min）。
4. `node scripts/audit-showcase-dev.mjs --ids=button,aichat` 抽查。
5. `npm run audit:semantics`（红线不受影响确认）。

## 6. P5 文档同步

- `design/showcase-plan.md` 尾部追加决策记录（components-only 定稿——路由扁平化/字母序/
  layout 域移除/七表歼灭）。
- AGENTS.md 不动（showcase 测试命令与 129 文件数不变）。

## 7. 风险与边界（诚实面）

- **SSR ≡ SPA**：全部改动在 app-router 单一实现源同一棵树——SSR 自动跟随；fetchIndexCached
  种子预热不动。首帧数据未到 = 空网格 + 数据到重渲染（既有机制）。
- **旧书签**：3 段式 legacy 兜底；`/components/<cat>` 单段旧分类页 → 404 壳（可接受）。
- **字母序**：组件名全 PascalCase，localeCompare 无歧义；（可选后续）A–Z 锚点跳转栏。
- **七表删除**：git 历史可回溯；若未来重建文档库再按需恢复（本次按"只 demo components"裁剪）。

## 8. 工作量

P1/P2/P3 各一次独立 commit（可回滚）；P4 全量验证；合计半天内。
