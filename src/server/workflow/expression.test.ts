/**
 * workflow/expression 契约测试（纯函数，零外部依赖）
 *
 * 覆盖：路径求值 / 宽松比较 / exists / 逻辑组合 / 布尔语境定版 /
 * 语法错误（安全面：无算术、无函数调用）/ 插值 / fuzz 对账（AST→src→parse round-trip）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse, compile, evaluate, evaluateBoolean, interpolate, toSrc, type ExprNode } from './expression.ts'

const ctx = {
  data: {
    items: [{ price: 100 }, { price: 200 }],
    status: '200',
    empty: [],
    text: '',
    flag: false,
    nil: null,
    obj: {},
  },
  steps: {
    probe: { ok: true, data: { total: 3 } },
  },
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

describe('expression: 比较（宽松 == 定版）', () => {
  it('字符串 == 数字（宽松：200 === "200" 场景）', () => {
    assert.equal(evaluate(parse("data.status == 200"), ctx), true)
  })
  it('!= null 匹配缺失与 null', () => {
    assert.equal(evaluate(parse('data.missing != null'), ctx), false)
    assert.equal(evaluate(parse('data.nil != null'), ctx), false)
    assert.equal(evaluate(parse('data.items != null'), ctx), true)
  })
  it('字符串字面量（单引号/双引号/转义）', () => {
    assert.equal(evaluate(parse("data.status == '200'"), ctx), true)
    assert.equal(evaluate(parse('data.status == "200"'), ctx), true)
    // 有效转义：\\→反斜杠 \'→引号 \n→换行
  })
  it('布尔字面量比较', () => {
    assert.equal(evaluate(parse('data.flag == false'), ctx), true)
  })
  it('路径 == 路径', () => {
    assert.equal(evaluate(parse('steps.probe.data.total == data.items[1].price'), ctx), false)
  })
})

describe('expression: exists', () => {
  it('存在（数组/对象/0/空串均算存在）', () => {
    assert.equal(evaluate(parse('data.items exists'), ctx), true)
    assert.equal(evaluate(parse('data.obj exists'), ctx), true)
    assert.equal(evaluate(parse('data.nil exists'), ctx), true) // JSON null 存在
    assert.equal(evaluate(parse('data.missing exists'), ctx), false)
  })
  it('!path exists = 不存在', () => {
    assert.equal(evaluate(parse('!data.missing exists'), ctx), true)
    assert.equal(evaluate(parse('!data.items exists'), ctx), false)
  })
})

describe('expression: 逻辑组合', () => {
  it('&& / || / ! / 括号', () => {
    assert.equal(evaluate(parse("data.status == 200 && data.items exists"), ctx), true)
    assert.equal(evaluate(parse("data.status == 500 || data.items exists"), ctx), true)
    assert.equal(evaluate(parse("!(data.status == 500)"), ctx), true)
    assert.equal(evaluate(parse("(data.items exists || data.missing exists) && data.status == 200"), ctx), true)
  })
  it('逻辑运算产生 boolean（非短路返回值语义）', () => {
    assert.equal(typeof evaluate(parse('data.items && data.flag'), ctx), 'boolean')
    assert.equal(evaluate(parse('data.items && data.flag'), ctx), false)
  })
})

describe('expression: 布尔语境（when 语义定版）', () => {
  it('空数组/空串/空对象/null/缺失 → false；0 → true；非空值 → true', () => {
    assert.equal(evaluateBoolean(parse('data.empty'), ctx), false)
    assert.equal(evaluateBoolean(parse('data.text'), ctx), false)
    assert.equal(evaluateBoolean(parse('data.obj'), ctx), false)
    assert.equal(evaluateBoolean(parse('data.nil'), ctx), false)
    assert.equal(evaluateBoolean(parse('data.missing'), ctx), false)
    assert.equal(evaluateBoolean(parse('data.flag'), ctx), false)
    const zeroCtx = { n: 0 }
    assert.equal(evaluateBoolean(parse('n'), zeroCtx), true) // 数字存在即真
    assert.equal(evaluateBoolean(parse('data.items'), ctx), true)
    assert.equal(evaluateBoolean(parse('1'), ctx), true) // 字面量同样语义
    assert.equal(evaluateBoolean(parse("''"), ctx), false)
  })
})

describe('expression: 语法错误（安全面）', () => {
  it('算术不支持：+ / *', () => {
    assert.throws(() => compile('a + 1'), /unexpected character '\+'/)
    assert.throws(() => compile('a * 2'), /unexpected character '\*'/)
  })
  it('=== / !== 不支持', () => {
    assert.throws(() => compile('a === 1'), /unexpected character '='/)
    assert.throws(() => compile('a !== 1'), /unexpected character '='/)
  })
  it('函数调用不支持', () => {
    assert.throws(() => compile('exists(a)'), /unexpected '\('/)
  })
  it('未闭合括号 / 字符串', () => {
    assert.throws(() => compile('(a && b'), /expected '\)'/)
    assert.throws(() => compile("a == 'x"), /unterminated string/)
  })
  it('数字数组下标必须整数', () => {
    assert.throws(() => compile('a[1.5]'), /expected integer index/)
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
  it('缺失 → 空串；对象 → JSON.stringify', () => {
    assert.equal(interpolate('x={{data.missing}}y', ctx), 'x=y')
    assert.equal(interpolate('{{data.items[0]}}', ctx), '{"price":100}')
  })
  it('严格错误：未闭合 / 空表达式', () => {
    assert.throws(() => interpolate('a{{b', ctx), /unclosed '\{\{'/)
    assert.throws(() => interpolate('a{{}}b', ctx), /empty expression/)
  })
})

describe('expression: fuzz 对账（AST→源码→编译 round-trip）', () => {
  // 参考世界：evaluate 直接作用于 AST；模拟世界：toSrc → parse → evaluate
  // 对账目标：toSrc 保真 + parse 正确性（evaluate 语义由上方契约测试独立锁定）
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
    const n = depth >= 2 ? Math.floor(rnd() * 6) : Math.floor(rnd() * 3) // 0,1,2 = 原子
    const path = () => {
      const segs: (string | number)[] = ['data', ['items', 'price', 'status', 'total'][Math.floor(rnd() * 4)]]
      if (rnd() < 0.4) segs.push(Math.floor(rnd() * 2))
      return { kind: 'path' as const, segments: segs }
    }
    const lit = () => {
      const k = Math.floor(rnd() * 5)
      if (k === 0) return { kind: 'literal' as const, value: null }
      if (k === 1) return { kind: 'literal' as const, value: true }
      if (k === 2) return { kind: 'literal' as const, value: false }
      if (k === 3) return { kind: 'literal' as const, value: [0, 1, 25, 3.5, -7][Math.floor(rnd() * 5)] }
      return { kind: 'literal' as const, value: ['x', 'hello', '200', ''][Math.floor(rnd() * 4)] }
    }
    switch (n) {
      case 0: return path()
      case 1: return lit()
      case 2: return { kind: 'exists' as const, target: path() }
      case 3: return { kind: 'compare' as const, left: path(), op: rnd() < 0.5 ? '==' : '!=' as const, right: rnd() < 0.5 ? lit() : path() }
      case 4: { const r = randAst(rnd, depth + 1); return { kind: 'not' as const, operand: r } }
      default: return { kind: rnd() < 0.5 ? 'and' as const : 'or' as const, left: randAst(rnd, depth + 1), right: randAst(rnd, depth + 1) }
    }
  }
  const fuzzCtx = {
    data: {
      items: [{ price: 100 }, { price: 200 }],
      price: 100,
      status: '200',
      total: 3,
      missing: undefined,
    },
  }
  it('300 样本 × 5 种子：求值一致', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rnd = mulberry32(seed * 7919)
      for (let i = 0; i < 300; i++) {
        const ast = randAst(rnd, 0)
        const src = toSrc(ast)
        const reparsed = parse(src)
        // 布尔语境对账（when 语义）
        assert.equal(
          evaluateBoolean(ast, fuzzCtx),
          evaluateBoolean(reparsed, fuzzCtx),
          `seed=${seed} i=${i} src=${src}`,
        )
        // 原值对账
        assert.deepEqual(evaluate(ast, fuzzCtx), evaluate(reparsed, fuzzCtx), `seed=${seed} i=${i} src=${src}`)
      }
    }
  })
})
