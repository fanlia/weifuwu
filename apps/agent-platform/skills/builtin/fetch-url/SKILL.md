---
name: fetch-url
description: 读取公开网页/API 内容（GET）。当用户需要获取 URL 内容、查阅在线文档、调用公开 API 时使用。需要 Agent 开启「允许网络访问」。
license: MIT
---

# Fetch URL

Fetches public URL content via HTTP GET. Returns text content (truncated to 8KB).

Requires: agent `allow_network` enabled（沙盒 --network bridge）。
