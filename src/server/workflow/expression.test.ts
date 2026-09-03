/**
 * workflow/expression 契约测试（纯函数，零外部依赖）
 *
 * 覆盖：路径（投影/长度）/ 宽松比较 / 大小比较 / 严格算术 / null 合并 /
 * 逻辑组合 / 布尔语境定版 / 语法错误（安全面：无函数调用）/ 插值 /
 * fuzz 对账（AST→src→parse round-trip，值+错误双对账）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse, compile, evaluate, evaluateBoolean, interpolate, toBoolean, toSrc, type ExprNode, type ExprFns } from './expression.ts'
import { STD_FNS } from './std.ts'

const ctx = {
  data: {
    items: [{ price: 100 }, { price: 200 }],
    nested: [[{ price: 1 }, { price: 2 }], [{ price: 3 }]],
    status: '200',
    empty: [],
    text: 'hello',
    flag: false,
    nil: null,
    obj: {},
    count: 3,
  },
  steps: { probe: { ok: true, data: { total: 3 } } },
}

describe('expression: 路径求值', () => {
  it('点路径 + 数组下标', () => {
    assert.equal(evaluate(parse('data.items[0].price'), ctx), 100)
    assert.equal(evaluate(parse('data.items[1].price'), ctx), 200)
  })
  it('缺失路径 → undefined', () => {
    assert.equal(evaluate(parse('data.missing.deep'), ctx), undefined)
    assert.equal(evaluate(parse('data.items[9]'), ctx), undefined)
  })
  it('steps 命名空间（步骤输出引用）', () => {
    assert.deepEqual(evaluate(parse('steps.probe.data'), ctx), { total: 3 })
  })
})

describe('expression: [*] 数组投影', () => {
  it('对象数组提取字段', () => {
    assert.deepEqual(evaluate(parse('data.items[*].price'), ctx), [100, 200])
  })
  it('嵌套投影展平（多页数据）', () => {
    assert.deepEqual(evaluate(parse('data.nested[*][*].price'), ctx), [1, 2, 3])
  })
  it('非数组 → 空数组；投影结果按 JS 判空（length > 0）', () => {
    assert.deepEqual(evaluate(parse('data.obj[*].x'), ctx), [])
    assert.equal(evaluateBoolean(parse('data.obj[*].x.length > 0'), ctx), false)
    assert.deepEqual(evaluate(parse('data.items[*].missing'), ctx), [])
  })
})

describe('expression: .length', () => {
  it('数组/字符串长度', () => {
    assert.equal(evaluate(parse('data.items.length'), ctx), 2)
    assert.equal(evaluate(parse('data.text.length'), ctx), 5)
    assert.equal(evaluateBoolean(parse('data.items.length == 2'), ctx), true)
    assert.equal(evaluateBoolean(parse('data.items.length > 1'), ctx), true)
  })
  it('缺失 → undefined（不报错）', () => {
    assert.equal(evaluate(parse('data.missing.length'), ctx), undefined)
  })
})

describe('expression: 比较（宽松 == 定版）', () => {
  it('字符串 == 数字（宽松：200 === "200" 场景）', () => {
    assert.equal(evaluate(parse('data.status == 200'), ctx), true)
  })
  it('!= null 匹配缺失与 null', () => {
    assert.equal(evaluate(parse('data.missing != null'), ctx), false)
    assert.equal(evaluate(parse('data.nil != null'), ctx), false)
    assert.equal(evaluate(parse('data.items != null'), ctx), true)
  })
  it('字符串字面量（单引号/双引号/转义）', () => {
    assert.equal(evaluate(parse("data.status == '200'"), ctx), true)
    assert.equal(evaluate(parse('data.status == "200"'), ctx), true)
  })
  it('布尔字面量比较', () => {
    assert.equal(evaluate(parse('data.flag == false'), ctx), true)
  })
  it('路径 == 路径', () => {
    assert.equal(evaluate(parse('steps.probe.data.total == data.items[1].price'), ctx), false)
  })
})

describe('expression: 大小比较（JS 语义）', () => {
  it('数字大小', () => {
    assert.equal(evaluate(parse('data.count > 2'), ctx), true)
    assert.equal(evaluate(parse('data.count >= 3'), ctx), true)
    assert.equal(evaluate(parse('data.count < 3'), ctx), false)
    assert.equal(evaluate(parse('data.count <= 2'), ctx), false)
  })
  it('宽松：字符串数字与数字比较（JS 转换）', () => {
    assert.equal(evaluate(parse('data.status > 2'), ctx), true) // '200' → 200
  })
})

describe('expression: 严格算术', () => {
  it('优先级：* 高于 +；括号', () => {
    assert.equal(evaluate(parse('1 + 2 * 3'), ctx), 7)
    assert.equal(evaluate(parse('(1 + 2) * 3'), ctx), 9)
    assert.equal(evaluate(parse('10 / 4'), ctx), 2.5)
    assert.equal(evaluate(parse('7 % 3'), ctx), 1)
  })
  it('路径运算 + 计数模式（while 推进）', () => {
    assert.equal(evaluate(parse('data.count + 1'), ctx), 4)
    assert.equal(evaluate(parse('data.count - 2 * 1'), ctx), 1)
  })
  it('非数字操作数 → 抛错（不静默拼接）', () => {
    assert.throws(() => evaluate(parse("data.text + 1"), ctx), /requires numbers/)
    assert.throws(() => evaluate(parse("'1' + 1"), ctx), /requires numbers/)
    assert.throws(() => evaluate(parse('-data.text'), ctx), /requires number/)
  })
  it('非有限结果（除零）→ 抛错', () => {
    assert.throws(() => evaluate(parse('1 / 0'), ctx), /non-finite/)
    assert.throws(() => evaluate(parse('0 % 0'), ctx), /non-finite/)
  })
  it('一元负号', () => {
    assert.equal(evaluate(parse('-5'), ctx), -5)
    assert.equal(evaluate(parse('-data.count + 10'), ctx), 7)
  })
})

describe('expression: != null（存在语义——JS 宽松 null 合并）', () => {
  it('null/undefined（缺失）→ 不等成立为 false', () => {
    assert.equal(evaluate(parse('data.items != null'), ctx), true)
    assert.equal(evaluate(parse('data.nil != null'), ctx), false)
    assert.equal(evaluate(parse('data.missing != null'), ctx), false)
    assert.equal(evaluate(parse('data.missing == null'), ctx), true)
  })
})

describe('expression: 逻辑组合', () => {
  it('&& / || / ! / 括号', () => {
    assert.equal(evaluate(parse("data.status == 200 && data.items != null"), ctx), true)
    assert.equal(evaluate(parse("data.status == 500 || data.items != null"), ctx), true)
    assert.equal(evaluate(parse("!(data.status == 500)"), ctx), true)
    assert.equal(evaluate(parse("(data.items != null || data.missing != null) && data.status == 200"), ctx), true)
  })
  it('逻辑返回操作数（JS 语义：默认值模式）', () => {
    assert.equal(evaluate(parse('data.flag || \'default\''), ctx), 'default')
    assert.equal(evaluate(parse('data.count && 1'), ctx), 1) // 3 truthy → 返回右操作数
  })
})

describe('expression: 布尔语境（when 语义定版）', () => {
  it('布尔语境 = JS truthy（逐条 JS）', () => {
    assert.equal(evaluateBoolean(parse('data.empty'), ctx), true)  // [] truthy（JS）
    assert.equal(evaluateBoolean(parse('data.text'), ctx), true)
    assert.equal(evaluateBoolean(parse('data.obj'), ctx), true)    // {} truthy（JS）
    assert.equal(evaluateBoolean(parse('data.nil'), ctx), false)
    assert.equal(evaluateBoolean(parse('data.missing'), ctx), false)
    assert.equal(evaluateBoolean(parse('data.flag'), ctx), false)
    assert.equal(evaluateBoolean(parse('data.count'), ctx), true)
    assert.equal(evaluateBoolean(parse('0'), ctx), false)          // 0 → false（JS）
    assert.equal(evaluateBoolean(parse('1'), ctx), true)
    assert.equal(evaluateBoolean(parse("''"), ctx), false)
    // 数组长度判断（"有数据"的 JS 写法）
    assert.equal(evaluateBoolean(parse('data.items.length > 0'), ctx), true)
  })
})

describe('expression: 语法错误（安全面）', () => {
  it('未注册函数调用报错（无 fns 环境）', () => {
    assert.throws(() => compile('foo(1)')({}), /未注册函数 'foo'/)
  })
  it('=== / !== 严格比较（JS 语义）', () => {
    const ctx = { data: { s: '1', n: 1 } }
    assert.equal(evaluate(parse('data.s === data.n'), ctx), false)   // 严格：类型不符
    assert.equal(evaluate(parse('data.s !== data.n'), ctx), true)
    assert.equal(evaluate(parse('data.n === 1'), ctx), true)
    // 宽松 == 仍可用（JS 两套并存）
    assert.equal(evaluate(parse('data.s == data.n'), ctx), true)
  })
  it('未闭合括号 / 字符串', () => {
    assert.throws(() => compile('(a && b'), /expected '\)'/)
    assert.throws(() => compile("a == 'x"), /unterminated string/)
  })
  it('数组下标必须整数', () => {
    assert.throws(() => compile('a[1.5]'), /expected integer index/)
    assert.throws(() => compile('a[-1]'), /expected integer index/)
  })
})

describe('expression: 三元 + 纯函数调用（JS 对齐）', () => {
  const ctx = { data: { n: 5, items: [1, 2, 3] } }
  it('三元 ?: 惰性（只算选中分支）', () => {
    assert.equal(evaluate(parse('data.n > 3 ? "大" : "小"'), ctx), '大')
    assert.equal(evaluate(parse('data.n > 7 ? "大" : "小"'), ctx), '小')
    assert.equal(evaluate(parse('data.n > 0 ? data.n : 0'), ctx), 5)
  })
  it('纯函数调用（fns 环境注入）', () => {
    const fns: ExprFns = { sum: (a) => (a[0] as number[])?.reduce((x: number, y: number) => x + y, 0) ?? 0, upper: (a) => String(a[0]).toUpperCase() }
    assert.equal(evaluate(parse('sum(data.items)'), ctx, fns), 6)
    assert.equal(evaluate(parse('upper(\'ab\')'), ctx, fns), 'AB')
    // 嵌套调用 + 复合表达式
    assert.equal(evaluate(parse('sum(data.items) + 1'), ctx, fns), 7)
  })
  it('std 函数环境（STD_FNS）', () => {
    assert.equal(evaluate(parse('count(data.items)'), ctx, STD_FNS), 3)
    assert.equal(evaluate(parse('clamp(data.n, 0, 3)'), ctx, STD_FNS), 3)
    assert.equal(evaluate(parse('avg(data.items)'), ctx, STD_FNS), 2)
  })
})

describe('expression: 插值', () => {
  it('纯文本原样返回', () => {
    assert.equal(interpolate('hello 世界', ctx), 'hello 世界')
  })
  it('单/多表达式插值', () => {
    assert.equal(interpolate('价格：{{data.items[0].price}} 元', ctx), '价格：100 元')
    assert.equal(interpolate('{{data.status}}/{{steps.probe.data.total}}', ctx), '200/3')
  })
  it('缺失 → 空串；对象 → JSON.stringify；投影数组', () => {
    assert.equal(interpolate('x={{data.missing}}y', ctx), 'x=y')
    assert.equal(interpolate('{{data.items[0]}}', ctx), '{"price":100}')
    assert.equal(interpolate('{{data.items[*].price}}', ctx), '[100,200]')
  })
  it('严格错误：未闭合 / 空表达式', () => {
    assert.throws(() => interpolate('a{{b', ctx), /unclosed '\{\{'/)
    assert.throws(() => interpolate('a{{}}b', ctx), /empty expression/)
  })
})

describe('expression: fuzz 对账（AST→源码→编译 round-trip，值+错误双对账）', () => {
  function mulberry32(seed: number) {
    let a = seed >>> 0
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  function randAst(rnd: () => number, depth: number): ExprNode {
    const n = depth >= 2 ? Math.floor(rnd() * 8) : Math.floor(rnd() * 3)
    const path = () => {
      const segs: (string | number)[] = ['data', ['items', 'price', 'status', 'count', 'text'][Math.floor(rnd() * 5)]]
      const k = rnd()
      if (k < 0.35) segs.push(Math.floor(rnd() * 3))
      else if (k < 0.55) segs.push('*')
      else if (k < 0.7) segs.push('length')
      return { kind: 'path' as const, segments: segs }
    }
    const lit = () => {
      const k = Math.floor(rnd() * 5)
      if (k === 0) return { kind: 'literal' as const, value: null }
      if (k === 1) return { kind: 'literal' as const, value: true }
      if (k === 2) return { kind: 'literal' as const, value: false }
      if (k === 3) return { kind: 'literal' as const, value: [0, 1, 2, 3, 5, 7][Math.floor(rnd() * 6)] }
      return { kind: 'literal' as const, value: ['x', 'hello', '200', ''][Math.floor(rnd() * 4)] }
    }
    const arith = () => ({ kind: 'arith' as const, op: ['+', '-', '*'][Math.floor(rnd() * 3)] as '+' | '-' | '*', left: randAst(rnd, depth + 1), right: randAst(rnd, depth + 1) })
    const cmpOp = () => ['==', '!=', '<', '<=', '>', '>='][Math.floor(rnd() * 6)] as '==' | '!=' | '<' | '<=' | '>' | '>='
    if (depth >= 4) return rnd() < 0.5 ? path() : lit() // 深度封顶——防栈溢出
    switch (n) {
      case 0: return path()
      case 1: return lit()
      case 2: return { kind: 'compare' as const, op: cmpOp(), left: randAst(rnd, depth + 1), right: randAst(rnd, depth + 1) }
      case 3: return arith()
      case 5: return { kind: 'not' as const, operand: randAst(rnd, depth + 1) }
      default: return { kind: rnd() < 0.5 ? 'and' as const : 'or' as const, left: randAst(rnd, depth + 1), right: randAst(rnd, depth + 1) }
    }
  }
  const fuzzCtx = {
    data: {
      items: [{ price: 100 }, { price: 200 }],
      price: 100, status: '200', count: 3, text: 'hi',
      missing: undefined,
    },
  }
  // 求值（值或错误——双对账）
  function evalEither(ast: ExprNode, c: unknown): { ok: true; value: unknown } | { ok: false; err: string } {
    try { return { ok: true, value: evaluate(ast, c) } }
    catch (e) { return { ok: false, err: (e as Error).message } }
  }
  it('400 样本 × 5 种子：值+错误一致', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rnd = mulberry32(seed * 7919)
      for (let i = 0; i < 400; i++) {
        const ast = randAst(rnd, 0)
        const src = toSrc(ast)
        const reparsed = parse(src)
        const a = evalEither(ast, fuzzCtx)
        const b = evalEither(reparsed, fuzzCtx)
        const label = `seed=${seed} i=${i} src=${src}`
        if (a.ok !== b.ok) assert.fail(`${label}: ok mismatch ${JSON.stringify(a).slice(0, 80)} vs ${JSON.stringify(b).slice(0, 80)}`)
        if (!a.ok) { assert.equal((a as any).err, (b as any).err, `${label}: err mismatch`) }
        else {
          assert.deepEqual((a as any).value, (b as any).value, `${label}: value mismatch`)
          // 布尔语境对账（复用已对账的值——错误路径上方已对账）
          assert.equal(toBoolean((a as any).value), toBoolean((b as any).value), `${label}: bool mismatch`)
        }
      }
    }
  })
})
