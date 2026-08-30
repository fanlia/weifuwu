package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"sync"
	"time"
)

// ── 容器核心（HTTP 面）──
// 监听策略（安全自适应）：
//   - SANDBOX_AGENT_TOKEN 存在 → 0.0.0.0（端口映射 -p 127.0.0.1::5711——
//     平台经宿主 loopback 直连常驻 agent——/exec 校验 token）
//   - 无 token → 127.0.0.1（容器内——平台走 docker exec 路径——降级兼容）
var execMu sync.Mutex // 工具串行（同容器工具操作必须串行——文件/浏览器状态）

func startAgent() {
	listenAddr := fmt.Sprintf("%s:%d", host, Port)
	token := os.Getenv("SANDBOX_AGENT_TOKEN")
	if token != "" {
		listenAddr = fmt.Sprintf("0.0.0.0:%d", Port)
		fmt.Fprintf(os.Stderr, "[sandbox-agent] token 鉴权已启用（0.0.0.0——/exec 需 X-Sandbox-Token）\n")
	}
	// /exec：工具执行（POST {tool,args} → {ok,output|error}——token 鉴权+串行）
	http.HandleFunc("/exec", func(w http.ResponseWriter, r *http.Request) {
		if token != "" && r.Header.Get("X-Sandbox-Token") != token {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(403)
			json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "unauthorized"})
			return
		}
		if r.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		var req struct {
			Tool string                 `json:"tool"`
			Args map[string]interface{} `json:"args"`
		}
		body, err := io.ReadAll(r.Body)
		if err != nil || json.Unmarshal(body, &req) != nil || req.Tool == "" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "invalid request"})
			return
		}
		// 超时传递（x-sandbox-timeout 头——bash 内部超时 = 外层 − 2s——
		// 与 docker exec 路径的 SANDBOX_EXEC_TIMEOUT_SECS 语义对齐）
		if h := r.Header.Get("X-Sandbox-Timeout"); h != "" {
			os.Setenv("SANDBOX_EXEC_TIMEOUT_SECS", h)
		}
		execMu.Lock()
		output, ok := dispatch(req.Tool, req.Args)
		execMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if ok {
			json.NewEncoder(w).Encode(map[string]any{"ok": true, "output": output})
		} else {
			json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": output})
		}
	})
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "pid": os.Getpid()})
	})
	http.HandleFunc("/capabilities", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(readCapabilities())
	})
	http.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var rssMB float64
		var m runtime.MemStats
		runtime.ReadMemStats(&m)
		rssMB = float64(m.Sys) / 1024 / 1024
		json.NewEncoder(w).Encode(map[string]any{
			"pid":            os.Getpid(),
			"activeChildren": len(activeChildren),
			"rssMB":          int(rssMB),
			"uptimeSec":      int(time.Since(startTime).Seconds()),
		})
	})
	server := &http.Server{Addr: listenAddr, ReadHeaderTimeout: 5 * time.Second}
	fmt.Fprintf(os.Stderr, "[sandbox-agent] listening on %s（容器核心——/healthz /capabilities /stats /exec——工具经 HTTP 或 stdin）\n", listenAddr)
	// stdin 协议 goroutine（docker exec 直连时一次性入参——EOF 即读完）
	go stdinLoop()
	// HTTP 主阻塞（保持进程——信号退出）——与 JS 版 server.listen 同构
	if err := server.ListenAndServe(); err != nil {
		fmt.Fprintf(os.Stderr, "[sandbox-agent] HTTP 面退出: %v\n", err)
	}
}

var startTime = time.Now()

// 能力声明（镜像层 /opt/sandbox/capabilities.json——失败降级默认）
func readCapabilities() []byte {
	b, err := os.ReadFile("/opt/sandbox/capabilities.json")
	if err != nil {
		def, _ := json.Marshal(map[string]any{
			"image": "generic",
			"tools": []string{"bash", "read", "write", "edit", "grep", "list_files"},
		})
		return def
	}
	return b
}

// ── stdin 协议（主力）：JSON {tool, args} → JSON {ok, output|error}
//
//	非 JSON（bash 管道）→ 按命令执行——复刻 JS 语义 ──
//
// ── stdin 协议（主力）：JSON {tool, args} → JSON {ok, output|error}
//
//	非 JSON（bash 管道）→ 按命令执行——复刻 JS 语义 ──
func stdinLoop() {
	agentLoopReader(os.Stdin)
}

func writeJSON(v map[string]any) {
	b, _ := json.Marshal(v)
	os.Stdout.Write(b)
	os.Stdout.Write([]byte("\n"))
}
