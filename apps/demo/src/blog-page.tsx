/**
 * 博客页组件 — async 工厂组件（形态 C）完整演示
 *
 * 服务端（ctx.ui.ssr）：await 工厂 → ctx.data 预取 → 完整 HTML + __DATA__
 * 客户端（mount hydrate）：ctx.data 从 __DATA__ 同步命中 → 渲染一致 → 游标收养（无闪跳）
 * 交互（点赞/折叠）：$ 客户端状态，hydrate 后可用
 */

import { h, asyncComponent } from 'weifuwu/client'

export const BlogPage = asyncComponent(async (ctx: any) => {
  // ── 工厂层：数据声明（服务端预取；客户端 hydration 从 __DATA__ 同步命中，不重跑）──
  const post = await ctx.data.get(`/api/posts/${ctx.params.slug}`, async () => {
    await new Promise(r => setTimeout(r, 20)) // 模拟慢数据
    return {
      slug: ctx.params.slug,
      title: `文章：${ctx.params.slug}`,
      body:
        '<p>这是 <b>async 工厂组件</b> 渲染的正文——服务端 await 工厂，数据直接进 HTML（SEO 可见）。</p>' +
        '<p>客户端 hydration 从 <code>window.__DATA__</code> 同步命中，<b>不会重复请求</b>，DOM 不重建、无闪跳。</p>',
      author_name: 'weifuwu 团队',
    }
  })

  return (_init: any, ctx: any) => {
    // ── mount：客户端状态（SSR 时渲染初始值，hydrate 后交互变化）──
    const $ = ctx.ui.$()
    $.liked = false
    $.likes = 42
    $.expanded = false

    return (props: any) =>
      h('article', { class: 'bg-white rounded-xl p-8 shadow-md' },
        h('h1', { class: 'text-2xl font-bold mb-2' }, post.title),
        h('p', { class: 'text-gray-400 text-sm mb-4' }, post.author_name),
        h('div', { class: 'leading-relaxed mb-4', innerHTML: post.body }),
        h('button', {
          id: 'like-btn',
          class: 'px-3 py-1 rounded bg-blue-500 text-white cursor-pointer',
          onClick: () => { $.liked = !$.liked; $.likes += $.liked ? 1 : -1 },
        }, `${$.liked ? '❤️ 已赞' : '🤍 点赞'} (${$.likes})`),
        h('button', {
          id: 'toggle-comments',
          class: 'px-3 py-1 rounded bg-gray-200 ml-2 cursor-pointer',
          onClick: () => { $.expanded = !$.expanded },
        }, $.expanded ? '收起评论' : '展开评论'),
        $.expanded &&
          h('div', { class: 'mt-3 text-sm text-gray-500' },
            h('p', {}, '评论 1：正文是服务端数据，交互是客户端状态——hydration 无闪跳接管'),
            h('p', {}, '评论 2：这个组件在 SSR / hydration / SPA 三场景同一个写法'),
          ),
      )
  }
})
