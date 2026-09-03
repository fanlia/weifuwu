/**
 * weifuwu/components — 轻量语法高亮 tokenizer
 *
 * 零依赖（FS-05）：正则单 pass 扫描，覆盖常见语法（注释/字符串/关键字/
 * 数字/函数调用/JSX 标签/操作符）。不追求完美分词（不做括号配对、多行
 * 字符串状态机），聚焦"代码可读性"——足够支撑文档/源码展示。
 *
 * 返回 token 数组：{ type: 'comment'|'string'|'keyword'|'number'|
 * 'function'|'jsx-tag'|'jsx-attr'|'operator'|'text', text }
 */

export type HighlightToken = { type: string; text: string }

// 关键字（按语言分组——ts/tsx 最全，其他语言取其子集）
const TS_KEYWORDS = /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|import|export|from|default|async|await|class|new|extends|implements|type|interface|public|private|protected|readonly|static|this|super|true|false|null|undefined|of|in|typeof|instanceof|void|throw|try|catch|finally|yield|as|satisfies)\b/
const BASH_KEYWORDS = /\b(?:if|then|else|fi|for|do|done|while|case|esac|function|echo|cd|ls|mkdir|rm|cp|mv|export|source|sudo|npm|node|docker)\b/

const JSX_TAG_RE = /<\/?[A-Za-z][\w.-]*(?=\s|\/?>|>)/

// 单 pass 主正则：组顺序 = 优先级（先注释/字符串——避免内部误匹配）
// 1 comment  2 string  3 keyword  4 number  5 function-call  6 jsx-tag  7 operator
const TOKEN_RE = new RegExp(
  [
    '(/\\*[\\s\\S]*?\\*/|//[^\\n]*|#[^\\n]*)', // 1 comment
    '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)', // 2 string
    '(' + TS_KEYWORDS.source + ')', // 3 keyword
    '(\\b\\d+(?:\\.\\d+)?(?:px|%|em|rem|vh|vw|fr|ms|s)?\\b)', // 4 number
    '([A-Za-z_$][\\w$]*(?=\\s*\\())', // 5 function call
    '(<\\/?[A-Za-z][\\w.-]*)', // 6 jsx tag（tsx 模式）
    '(<=|>=|===|!==|==|!=|=>|\\+\\+|--|&&|\\|\\||\\?\\?|\\??\\.|[{}()\\[\\];,.:=+\\-*/<>!?&|^~%])', // 7 operator
  ].join('|'),
  'g',
)

function keywordsFor(lang: string): RegExp {
  if (lang === 'bash' || lang === 'sh' || lang === 'shell') return BASH_KEYWORDS
  return TS_KEYWORDS
}

export function tokenize(code: string, lang?: string): HighlightToken[] {
  const tokens: HighlightToken[] = []
  const kw = keywordsFor(lang ?? '')
  // 按语言调整 jsx 标签（bash/html/css/json 不启用——尖括号多为比较符/标签文本）
  const jsxEnabled = lang === 'tsx' || lang === 'jsx' || lang === 'html' || !lang

  // 构建当前语言正则（keyword 组换语言特定）
  const langRe = new RegExp(
    [
      '(/\\*[\\s\\S]*?\\*/|//[^\\n]*|#[^\\n]*)',
      '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)',
      '(' + kw.source + ')',
      '(\\b\\d+(?:\\.\\d+)?(?:px|%|em|rem|vh|vw|fr|ms|s)?\\b)',
      '([A-Za-z_$][\\w$]*(?=\\s*\\())',
      jsxEnabled ? '(<\\/?[A-Za-z][\\w.-]*)' : '([^\\s\\S])', // 禁用：捕获组占位（永不匹配——[\s\S] 补集为空——组号不漂移——防判定表错位）
      '(<=|>=|===|!==|==|!=|=>|\\+\\+|--|&&|\\|\\||\\?\\?|\\??\\.|[{}()\\[\\];,.:=+\\-*/<>!?&|^~%])',
    ].join('|'),
    'g',
  )

  let last = 0
  let m: RegExpExecArray | null
  while ((m = langRe.exec(code)) !== null) {
    // 前缀文本
    if (m.index > last) tokens.push({ type: 'text', text: code.slice(last, m.index) })
    // 匹配组判定（1-7）
    let type = 'operator'
    for (let g = 1; g <= 7; g++) {
      if (m[g] !== undefined) {
        type = ['comment', 'string', 'keyword', 'number', 'function', 'jsx-tag', 'operator'][g - 1]
        // 特殊：jsx-tag 匹配但禁用时（组 6 是 (?!x)x——永不匹配）不会到这
        break
      }
    }
    tokens.push({ type, text: m[0] })
    last = m.index + m[0].length
    // 防止零宽匹配死循环
    if (m[0].length === 0) { last++; langRe.lastIndex = last }
  }
  if (last < code.length) tokens.push({ type: 'text', text: code.slice(last) })
  return tokens
}
