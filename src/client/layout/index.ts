/**
 * weifuwu/client/layout — 布局原语声明 + 装配（defineLayout 生态公共面）
 *
 * 三面：
 * - **原语声明**（define.ts）：StructureDecl/generateLayoutCss/parseProps/
 *   isEquivalent——自定义布局语言（构建期声明 → 生成 CSS——声明比实现短
 *   且机械部分全消失判据）
 * - **内建声明**（decl.ts）：row/stack/items 族（生成 = 旧手写逐属性等价冻结快照）
 * - **装配**（bundle.ts）：bundleLayout/bundleComponents/layerMapOf/LAYER_OF/
 *   LAYER_ORDER——node 构建管线（build.mjs/审计脚本共用——装配单源）
 *
 * 注意：bundle 面含 node:fs 依赖（构建期工具）——浏览器消费只引
 * `weifuwu/client/layout/weifuwu-layout.css`（CSS 面）；JS 面是构建期工具。
 */
export type { StructureDecl } from './define.ts'
export { generateLayoutCss, parseProps, isEquivalent } from './define.ts'
export { structures } from './decl.ts'
export { LAYER_ORDER, LAYER_OF } from './bundle.ts'
export type { CssBundle } from './bundle.ts'
export { layoutEntryFiles, isLayoutSourceDir, bundleLayout, bundleComponents, layerMapOf } from './bundle.ts'
