/**
 * weifuwu/vdom/jsx-runtime — JSX 自动导入运行时（`<></>`/`<div/>` 编译目标）
 *
 * 使用（应用 tsconfig）：
 * ```json
 * { "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "weifuwu/vdom" } }
 * ```
 * 编译器自动生成：`import { jsx, jsxs, Fragment } from 'weifuwu/vdom/jsx-runtime'`
 *
 * 结构符号内化（X-S1 S9.4）：**主入口（index.ts）不导出 Fragment**——
 * 数组 = 隐式 Fragment；`<></>` 经本子路径自动导入（编译目标即 Fragment 符号）。
 */

export { jsx, jsxs, jsxDEV } from './core/vnode.ts'
import { Fragment as _Fragment } from './core/node/fragment.ts'
export { Fragment } from './core/node/fragment.ts'
const Fragment = _Fragment

/** JSX 类型声明（jsxImportSource: weifuwu/vdom——组件/用户 JSX 编译产物类型） */
declare global {
  namespace JSX {
    type Element = import('./core/vnode.ts').VNode | null
    type ElementType =
      | string
      | ((props: any, ctx: any) => any)
      | typeof Fragment
    interface IntrinsicElements {
      [tag: string]: any
    }
    interface IntrinsicAttributes {
      key?: string | number | null
    }
  }
}
