package main

import (
	"regexp"
	"time"
)

func sleepMs(n int) { time.Sleep(time.Duration(n) * time.Millisecond) }

// 网络失败模式（提示注入——对齐 JS 版）
var rxNetworkFail = regexp.MustCompile(`(getaddrinfo|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|curl:|npm ERR)`)
