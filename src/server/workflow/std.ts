/**
 * workflow std 纯函数库（`wf://std/*` 的运行时实现）
 *
 * 纯函数 = 表达式内可调用的函数（无副作用/无 ctx/无 I/O）。
 * 参数严格校验：类型错/NaN → 抛错（与表达式严格算术同一纪律）。
 *
 * 命名空间映射（v1 平铺——namespace 导入 W8 展开）：
 *   wf://std/math        → sum/avg/clamp
 *   wf://std/strings     → upper/lower/join
 *   wf://std/collections → count/pick
 *
 * ponytail: v1 平铺命名空间（math.sum 与 sum 同表）；若 std 膨胀至 20+ 函数按包拆分前缀校验。
 */

/** 纯函数环境（表达式内调用） */
export type StdFns = Record<string, (args: unknown[]) => unknown>

function requireArgs(name: string, args: unknown[], n: number): void {
  if (args.length !== n) throw new Error(`std.${name}: 期望 ${n} 个参数，收到 ${args.length}`)
}

function toNum(name: string, v: unknown, pos: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`std.${name}: 参数 ${pos + 1} 不是有限数字（${String(v)}）`)
  return n
}

const math: StdFns = {
  sum: (a) => {
    requireArgs('sum', a, 1)
    const xs = a[0] as unknown[]
    if (!Array.isArray(xs)) throw new Error('std.sum: 期望数组')
    return xs.reduce((acc: number, v) => acc + toNum('sum', v, 0), 0)
  },
  avg: (a) => {
    requireArgs('avg', a, 1)
    const xs = a[0] as unknown[]
    if (!Array.isArray(xs)) throw new Error('std.avg: 期望数组')
    if (xs.length === 0) throw new Error('std.avg: 空数组')
    return xs.reduce((acc: number, v) => acc + toNum('avg', v, 0), 0) / xs.length
  },
  clamp: (a) => {
    requireArgs('clamp', a, 3)
    const v = toNum('clamp', a[0], 0)
    const lo = toNum('clamp', a[1], 1)
    const hi = toNum('clamp', a[2], 2)
    if (lo > hi) throw new Error('std.clamp: lo > hi')
    return Math.min(hi, Math.max(lo, v))
  },
}

const strings: StdFns = {
  upper: (a) => {
    requireArgs('upper', a, 1)
    if (typeof a[0] !== 'string') throw new Error(`std.upper: 期望字符串（${String(a[0])}）`)
    return a[0].toUpperCase()
  },
  lower: (a) => {
    requireArgs('lower', a, 1)
    if (typeof a[0] !== 'string') throw new Error(`std.lower: 期望字符串（${String(a[0])}）`)
    return a[0].toLowerCase()
  },
  join: (a) => {
    requireArgs('join', a, 2)
    if (!Array.isArray(a[0]) || typeof a[1] !== 'string') throw new Error('std.join: 期望(数组, 分隔符)')
    return a[0].map((v) => String(v)).join(a[1])
  },
  split: (a) => {
    requireArgs('split', a, 2)
    if (typeof a[0] !== 'string' || typeof a[1] !== 'string') throw new Error('std.split: 期望(字符串, 分隔符)')
    return a[0].split(a[1])
  },
}

const collections: StdFns = {
  count: (a) => {
    requireArgs('count', a, 1)
    if (Array.isArray(a[0])) return a[0].length
    if (typeof a[0] === 'string') return a[0].length
    throw new Error(`std.count: 期望数组或字符串（${String(a[0])}）`)
  },
  pick: (a) => {
    requireArgs('pick', a, 2)
    if (!Array.isArray(a[0])) throw new Error('std.pick: 期望数组')
    const i = toNum('pick', a[1], 1)
    if (!Number.isInteger(i) || i < 0 || i >= a[0].length) throw new Error(`std.pick: 索引 ${i} 越界（长度 ${a[0].length}）`)
    return a[0][i]
  },
}

/** std 模块表：wf://std/<name> → 导出成员（函数/对象） */
export const STD_MODULES: Record<string, StdFns> = {
  'wf://std/math': math,
  'wf://std/strings': strings,
  'wf://std/collections': collections,
}

/** 平铺纯函数表（表达式内调用解析用——运行时直接可用，无需导入） */
export const STD_FNS: StdFns = { ...math, ...strings, ...collections }

/** std 纯函数名列表（validate/wfjs 静态检查共用） */
export const STD_NAMES: string[] = Object.keys(STD_FNS)

/** 从模块源解析导出成员（缺少的成员 → 未定义；store 模块见 STORE_MODULE） */
export function stdExports(src: string): string[] {
  return Object.keys(STD_MODULES[src] ?? {})
}

/** wf://std/store：store 对象（get/set/del 方法——语句层调用） */
export const STORE_MODULE = { exports: ['store'] }
