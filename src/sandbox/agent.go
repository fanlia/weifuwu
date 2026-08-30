package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"time"
)

// ── HTTP 面（只读：健康/能力/状态——复刻 JS 版）──
func startAgent() {
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
	server := &http.Server{Addr: fmt.Sprintf("%s:%d", host, Port), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := server.ListenAndServe(); err != nil {
			fmt.Printf("[sandbox-agent] HTTP 面退出: %v\n", err)
		}
	}()
	fmt.Fprintf(os.Stderr, "[sandbox-agent] listening on 127.0.0.1:%d（健康/能力/状态面——工具经 stdin 协议）\n", Port)
	stdinLoop()
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
