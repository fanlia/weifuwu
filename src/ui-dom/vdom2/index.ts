/**
 * vdom2 引擎入口（TDD 实施中——测试见 src/test/vdom2-matrix.test.ts）
 */
export { mountRoot, createRenderer, type MountHandle, type Renderer } from './mount.ts'
export { buildVNode } from './build.ts'
export { renderValue } from './render.ts'
export { patchValue } from './patch.ts'
export { x2y, TRANSITIONS } from './transitions.ts'
export { x2html } from './x2html.ts'
export { auditEnabled, auditTree, auditChildren } from './audit.ts'
export { hydrateVNode } from './hydrate.ts'
export { classifyKind, getOutputRange } from './kind.ts'
export { h, jsx, jsxs, createPortal, Fragment, Portal, isNative, isFrag, isComp, isPortal } from '../vnode.ts'
