/**
 * vitest browser setup（跑在浏览器页面——每个测试文件独立 page）
 *
 * - 每个测试前重置 DOM（#root 容器 + 清 body）与 URL（navigate/popstate
 *   测试修改 location——后续测试的 router '/' 匹配依赖干净 URL）——测试间隔离
 */
import { beforeEach } from 'vitest'

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  window.history.replaceState({}, '', '/')
})
