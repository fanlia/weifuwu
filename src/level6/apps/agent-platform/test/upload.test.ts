/**
 * 附件上传（PERSONA-PLAN P1-3）——校验/消毒/注入测试
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  validateUploadFile,
  buildAttachmentLayer,
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
} from '../src/services/upload.ts'

const csvBase64 = Buffer.from('a,b\n1,2\n').toString('base64')

describe('附件上传（P1-3）', () => {
  it('白名单：允许 csv/xlsx/pdf 等', () => {
    assert.ok(ALLOWED_EXTENSIONS.includes('csv'))
    assert.ok(ALLOWED_EXTENSIONS.includes('xlsx'))
    assert.ok(ALLOWED_EXTENSIONS.includes('pdf'))
    assert.ok(ALLOWED_EXTENSIONS.includes('docx'))
  })

  it('校验通过：csv base64 解码 + safeName', () => {
    const f = validateUploadFile({ name: 'sales.csv', data: csvBase64 })
    assert.strictEqual(f.safeName, 'sales.csv')
    assert.strictEqual(f.ext, 'csv')
    assert.strictEqual(f.size, Buffer.byteLength('a,b\n1,2\n'))
  })

  it('非法扩展名拒绝', () => {
    assert.throws(
      () => validateUploadFile({ name: 'evil.exe', data: csvBase64 }),
      /不支持的文件类型/,
    )
    assert.throws(
      () => validateUploadFile({ name: 'noext', data: csvBase64 }),
      /需带扩展名/,
    )
  })

  it('路径穿越消毒：目录分隔符剥离 + 控制字符去除', () => {
    const f = validateUploadFile({ name: '../../etc/passwd.csv', data: csvBase64 })
    assert.strictEqual(f.safeName, 'passwd.csv', '只保留 basename')
    const f2 = validateUploadFile({ name: 'a\u0000b.csv', data: csvBase64 })
    assert.strictEqual(f2.safeName, 'ab.csv', '控制字符去除')
  })

  it('大小上限：声明与实际字节双校验', () => {
    assert.throws(
      () => validateUploadFile({ name: 'big.csv', data: csvBase64, size: MAX_UPLOAD_BYTES + 1 }),
      /文件过大/,
    )
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1).toString('base64')
    assert.throws(
      () => validateUploadFile({ name: 'big.csv', data: big }),
      /文件过大/,
    )
  })

  it('空附件拒绝', () => {
    assert.throws(() => validateUploadFile({ name: 'empty.csv', data: '' }), /缺少/)
  })

  it('buildAttachmentLayer：清单 + 类型读取指引', () => {
    const layer = buildAttachmentLayer([
      { name: 'sales.xlsx', size: 12 * 1024, path: 'uploads/msg1/sales.xlsx' },
      { name: 'notes.csv', size: 300, path: 'uploads/msg1/notes.csv' },
    ])
    assert.ok(layer.includes('sales.xlsx'), '文件名在清单中')
    assert.ok(layer.includes('12KB'), '大小格式化')
    assert.ok(layer.includes('uploads/msg1/sales.xlsx'), '路径在清单中')
    assert.ok(layer.includes('pandas/openpyxl'), 'Excel 读取指引')
    assert.ok(layer.includes('read 工具'), '文本读取指引')
    assert.ok(layer.includes('不要猜测文件内容'), '处理纪律')
  })

  it('buildAttachmentLayer：无附件返回空', () => {
    assert.strictEqual(buildAttachmentLayer([]), '')
  })
})
