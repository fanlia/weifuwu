import { chromium } from 'playwright'
const browser = await chromium.launch()
const ids = ['confirm', 'modal', 'tooltip', 'datepicker', 'codeeditor', 'editor', 'chart', 'markdown', 'kanban', 'pipeline', 'tour', 'menubar', 'carousel', 'command', 'calendar', 'virtuallist', 'virtualtable', 'infinitescroll', 'qrcode', 'sheetgrid', 'slidecanvas', 'aichat', 'chatinput', 'tree', 'transfer', 'cascader', 'mention', 'watermark', 'resizable', 'affix']
for (const id of ids) {
  try {
    const res = await fetch('http://localhost:3200/content/components/' + id + '.md')
    if (res.status !== 200) continue
    const r = await fetch('http://localhost:3200/components/misc/' + id)
    console.log(id, r.status)
  } catch (e) { console.log(id, 'FETCH-ERR', String(e).slice(0, 60)) }
}
await browser.close()
