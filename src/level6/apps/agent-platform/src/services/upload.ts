/**
 * 附件上传公共模块（PERSONA-PLAN P1-3）
 *
 * 聊天上传 + 配置页上传共用：白名单 / 大小上限 / 文件名消毒。
 * 安全基线：扩展名白名单（沙盒隔离兜底——不做 MIME 魔数校验）、
 * basename 消毒（防路径穿越——F8 resolveWorkspacePath 防线外第二道）。
 */

export const ALLOWED_EXTENSIONS = [
  'csv', 'xlsx', 'xls', 'pdf', 'docx', 'pptx',
  'txt', 'md', 'json', 'log',
  'png', 'jpg', 'jpeg', 'gif',
]

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 // 20MB

export interface UploadFileInput {
  /** 原始文件名（含扩展名） */
  name: string
  /** base64 内容（无 data: 前缀） */
  data: string
  /** 声明大小（字节）——用于拒绝超大请求 */
  size?: number
}

export interface UploadedFile {
  /** 消毒后的安全文件名（basename + 白名单扩展名） */
  safeName: string
  /** 原始文件名字段（展示用） */
  originalName: string
  /** 扩展名（小写，无点） */
  ext: string
  /** 解码后的 Buffer */
  buffer: Buffer
  size: number
}

/** 校验并解码单个附件——失败抛 Error（消息含原因） */
export function validateUploadFile(file: UploadFileInput): UploadedFile {
  if (!file?.name || !file.data) throw new Error('附件缺少 name 或 data')

  // 文件名消毒：只保留 basename + 去控制字符
  const rawBase = String(file.name).split(/[\\/]/).pop() ?? ''
  const safeName = rawBase.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!safeName) throw new Error('文件名无效')

  const dot = safeName.lastIndexOf('.')
  if (dot <= 0) throw new Error(`不支持的文件类型：${safeName}（需带扩展名）`)
  const ext = safeName.slice(dot + 1).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`不支持的文件类型 .${ext}——允许：${ALLOWED_EXTENSIONS.join('/')}`)
  }

  // base64 解码 + 大小校验（先按声明 size 快速拒绝，再按实际字节）
  const declared = Number(file.size ?? 0)
  if (declared > MAX_UPLOAD_BYTES) throw new Error(`文件过大（上限 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB）`)
  let buffer: Buffer
  try {
    buffer = Buffer.from(file.data, 'base64')
  } catch {
    throw new Error('附件内容不是有效的 base64')
  }
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error(`文件过大（实际 ${Math.round(buffer.length / 1024 / 1024)}MB，上限 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB）`)
  if (buffer.length === 0) throw new Error('附件内容为空')

  return { safeName, originalName: rawBase, ext, buffer, size: buffer.length }
}

/**
 * 附件清单注入文本（AI 知道用户传了什么、在哪读、怎么读）
 * 例：
 * 【用户附件】
 * - sales.xlsx（Excel，12KB）——uploads/{msgId}/sales.xlsx
 *   读取：文本用 read 工具；Excel/PDF/Word 用 bash+python（pandas/openpyxl/pypdf/docx 已预装）
 */
export function buildAttachmentLayer(files: Array<{ name: string; size: number; path: string }>): string {
  if (files.length === 0) return ''
  const typeHint = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    if (['csv', 'txt', 'md', 'json', 'log'].includes(ext)) return '文本——用 read 工具读取'
    if (['xlsx', 'xls'].includes(ext)) return 'Excel——用 bash+python（pandas/openpyxl）读取'
    if (ext === 'pdf') return 'PDF——用 bash+python（pypdf）读取'
    if (['docx', 'pptx'].includes(ext)) return 'Office 文档——用 bash+python（python-docx/python-pptx）读取'
    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return '图片——无视觉模型，请说明图片内容或跳过'
    return '文件——先 list_files 确认后选择读取方式'
  }
  const lines = files.map((f) => {
    const kb = f.size >= 1024 ? `${Math.round(f.size / 1024)}KB` : `${f.size}B`
    return `- ${f.name}（${kb}）——${f.path}｜${typeHint(f.name)}`
  })
  return `【用户附件】\n${lines.join('\n')}\n处理步骤：1) 先 list_files 确认文件存在；2) 按类型读取；3) 直接基于内容回答，不要猜测文件内容。`
}
