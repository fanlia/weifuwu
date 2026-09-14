# 交付物文件卡片体验优化计划（DELIVERABLES-UX-PLAN）

> 2026-09——用户截图（交付物面板文件卡片）驱动。现状探针（代码勘察已完成）：
> `ui/components/agent/FilesSection.tsx` 列表每行
> `[icon(file-text/folder)+名称truncate] [size] [time] [↓]`——窄面板 wrap 两行、
> 图片无缩略图、图标类型单一、名称截断无 tooltip。

## 问题清单（截图实证）

| # | 问题 | 现状 |
|---|---|---|
| P1 | 图片文件无缩略图——cat-poster.png 只显示 file-text 图标 | UI 侧仅 `Icon name=file-text` |
| P2 | 类型图标单一（docs/xlsx/csv/图片全 file-text） | 同上 |
| P3 | 文件名截断（cat-poster...）无完整显示/tooltip | `wf-truncate` 无 title |
| P4 | 窄面板信息排布挤压（size/时间/下载挤两行——视觉凌乱） | 单行 flex 不 wrap——窄面板挤压 |
| P5 | 图片不可直接预览（需下载后本地看） | 打开只支持文本（binary 提示不可预览） |

## 波次

### W1 类型感知 + 图片缩略图（面板核心体验）
- **图片扩展名**（png/jpg/jpeg/webp/gif）→ **小缩略图**（48×48 `<Img placeholder>`——复用
  Img 占位能力——fetch 带 token（authorizedGet→blob）→ Img 渲染）——
  **轻量缓存**（模块级 Map<path, blobUrl>——防列表重复渲染重复 fetch）
- **非图片** → 类型图标映射：表格（csv/xlsx…）→ `database`；图片→`image`；其他→`file-text`
- 缩略图点击 → 预览大图（`openFileUrl` ticket 直链新 tab——或 `Img preview` 弹窗——
  选 **Img preview**（页面内浮层——聊天图片同一体验——组件能力已就绪）

### W2 名称完整 + 排布（信息层级）
- 名称 `title={entry.name}`（tooltip 完整名——截断可读）
- 行布局：`[缩略/图标][名称(truncate+title)] [size] [time] [↓]`——**元数据紧凑化**：
  size/time 合并 `wf-nums wf-font-xs` 语义弱化（tertiary）——下载按钮 hover 常驻小图标
- 主题：窄面板（抽屉 ~260px）单行不 wrap——`min-width:0` + truncate 生效

### W3 判负登记（无证据不建）
- **排序**（名称/时间切换）：日常文件数 <20——无证据需求——翻案条件：用户文件>50 或
  明确要求排序
- **搜索**：同上判负
- **hover 显现下载**：窄面板触摸/误点风险——保留常驻小图标（简单）
- **文件多选/批量操作**：无场景证据——判负

## 测试

- UI 场景测试（test/ui/files-section-ux.test.ts——playwright 真实链路）：
  - 图片文件 → 缩略图 `<img>` 出现（naturalWidth>0——真实解码）
  - 非图片（订单.csv）→ `database` 图标（SVG class 断言）
  - 文件名 title 属性 = 完整名
  - 缩略图点击 → 预览浮层（`.wf-img-preview-image`）
- 存量回归：chat-image-preview / scenario-smoke（FilesSection 嵌入 Chat 面板）

## 验收

- 六旅程冒烟（scenario-smoke）绿 + 新测试绿 + tsc/build 零错
- 截图对账：面板视觉两行挤压消除、缩略图/图标可辨
